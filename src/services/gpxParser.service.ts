/**
 * Service de parsing GPX
 * Lit un fichier .gpx (XML), extrait les points GPS,
 * calcule D+/D-/distance/pentes et segmente le tracé intelligemment.
 */

import type { GpxPoint, GpxSegment, GpxTrack, SegmentType } from '@/types'

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Rayon de la Terre en mètres (formule Haversine) */
const EARTH_RADIUS_M = 6_371_000

/**
 * Fenêtre de lissage de l'altitude (points voisins à moyenner).
 * Réduit le bruit GPS qui gonfle artificiellement le D+.
 */
const ALTITUDE_SMOOTH_WINDOW = 5

/** Seuils de pente (%) pour classifier un segment */
const GRADE_THRESHOLDS = {
  flat: 3,        // |pente| < 3% → plat
  uphill: 8,      // 3–8% → montée modérée
  downhill: -3,   // -3 à -8% → descente modérée
  steepUphill: 8, // > 8% → montée raide
  steepDownhill: -8, // < -8% → descente raide
} as const

/** Distance minimale d'un segment en mètres (évite les micro-segments) */
const MIN_SEGMENT_DISTANCE_M = 200

// ─── Helpers géométriques ────────────────────────────────────────────────────

/** Convertit des degrés en radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Distance entre deux points GPS (formule Haversine)
 * @returns Distance en mètres
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

/**
 * Pente entre deux points (%)
 * @returns Pente en % (positif = montée, négatif = descente)
 */
function computeGrade(distM: number, elevDiffM: number): number {
  if (distM < 0.1) return 0
  return (elevDiffM / distM) * 100
}

/** Classifie un segment selon sa pente moyenne */
function classifySegment(avgGrade: number): SegmentType {
  if (avgGrade >= GRADE_THRESHOLDS.steepUphill) return 'steep_uphill'
  if (avgGrade >= GRADE_THRESHOLDS.flat) return 'uphill'
  if (avgGrade <= GRADE_THRESHOLDS.steepDownhill) return 'steep_downhill'
  if (avgGrade <= GRADE_THRESHOLDS.downhill) return 'downhill'
  return 'flat'
}

// ─── Parsing XML ─────────────────────────────────────────────────────────────

/**
 * Parse le contenu XML d'un fichier GPX et extrait les points bruts.
 * Compatible GPX 1.0 et 1.1.
 */
function parseGpxXml(xmlContent: string): { name: string; points: GpxPoint[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlContent, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Fichier GPX invalide : ${parseError.textContent ?? 'erreur XML'}`)
  }

  // Nom de la trace (optionnel)
  const nameEl = doc.querySelector('trk > name') ?? doc.querySelector('name')
  const name = nameEl?.textContent?.trim() ?? 'Parcours sans nom'

  // Extraction des track points (trkpt) — support aussi des waypoints (wpt)
  const trkpts = doc.querySelectorAll('trkpt')
  if (trkpts.length === 0) {
    throw new Error('Aucun point de trace (trkpt) trouvé dans le fichier GPX.')
  }

  const points: GpxPoint[] = []

  trkpts.forEach((trkpt) => {
    const lat = parseFloat(trkpt.getAttribute('lat') ?? '')
    const lon = parseFloat(trkpt.getAttribute('lon') ?? '')

    if (isNaN(lat) || isNaN(lon)) return

    const eleEl = trkpt.querySelector('ele')
    const elevation = eleEl ? parseFloat(eleEl.textContent ?? '0') : 0

    const timeEl = trkpt.querySelector('time')
    const time = timeEl?.textContent
      ? Math.floor(new Date(timeEl.textContent).getTime() / 1000)
      : undefined

    points.push({ lat, lon, elevation, time })
  })

  if (points.length < 2) {
    throw new Error('Le fichier GPX contient trop peu de points pour être analysé.')
  }

  return { name, points }
}

// ─── Lissage altitude ────────────────────────────────────────────────────────

/**
 * Lisse les altitudes par moyenne glissante.
 * Réduit le bruit GPS pour éviter un D+ artificiellement gonflé.
 */
function smoothAltitudes(points: GpxPoint[]): GpxPoint[] {
  const half = Math.floor(ALTITUDE_SMOOTH_WINDOW / 2)
  return points.map((p, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(points.length - 1, i + half)
    let sum = 0
    let count = 0
    for (let j = start; j <= end; j++) {
      sum += points[j]!.elevation
      count++
    }
    return { ...p, elevation: sum / count }
  })
}

// ─── Segmentation intelligente ───────────────────────────────────────────────

/**
 * Segmente le tracé en segments homogènes (même type de terrain).
 * Fusionne les micro-segments sous MIN_SEGMENT_DISTANCE_M.
 */
function buildSegments(points: GpxPoint[]): GpxSegment[] {
  if (points.length < 2) return []

  /** Points intermédiaires du segment en cours */
  let segmentPoints: GpxPoint[] = [points[0]!]
  let segmentDist = 0
  let currentType: SegmentType | null = null

  const rawSegments: Array<{
    points: GpxPoint[]
    distance: number
    type: SegmentType
  }> = []

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const dist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon)
    const elevDiff = curr.elevation - prev.elevation
    const grade = computeGrade(dist, elevDiff)
    const type = classifySegment(grade)

    // Nouveau type → on finalise le segment courant si assez long
    if (currentType !== null && type !== currentType && segmentDist >= MIN_SEGMENT_DISTANCE_M) {
      rawSegments.push({ points: [...segmentPoints], distance: segmentDist, type: currentType })
      segmentPoints = [prev]
      segmentDist = 0
    }

    segmentPoints.push(curr)
    segmentDist += dist
    currentType = type
  }

  // Dernier segment
  if (segmentPoints.length >= 2 && currentType !== null) {
    rawSegments.push({ points: segmentPoints, distance: segmentDist, type: currentType })
  }

  // Fusion des micro-segments avec le précédent
  const merged: typeof rawSegments = []
  for (const seg of rawSegments) {
    if (merged.length > 0 && seg.distance < MIN_SEGMENT_DISTANCE_M) {
      const last = merged[merged.length - 1]!
      last.points = [...last.points, ...seg.points.slice(1)]
      last.distance += seg.distance
    } else {
      merged.push({ ...seg })
    }
  }

  // Conversion en GpxSegment typé
  let cumDist = 0
  let cumElevGain = 0

  return merged.map((raw, index) => {
    const startPoint = raw.points[0]!
    const endPoint = raw.points[raw.points.length - 1]!

    let elevGain = 0
    let elevLoss = 0
    let maxGrade = 0

    for (let i = 1; i < raw.points.length; i++) {
      const diff = raw.points[i]!.elevation - raw.points[i - 1]!.elevation
      const d = haversineDistance(
        raw.points[i - 1]!.lat, raw.points[i - 1]!.lon,
        raw.points[i]!.lat, raw.points[i]!.lon,
      )
      const g = Math.abs(computeGrade(d, diff))
      if (g > maxGrade) maxGrade = g
      if (diff > 0) elevGain += diff
      else elevLoss += Math.abs(diff)
    }

    const avgGrade = computeGrade(raw.distance, endPoint.elevation - startPoint.elevation)

    cumDist += raw.distance
    cumElevGain += elevGain

    return {
      id: `seg-${index}`,
      index,
      startPoint,
      endPoint,
      points: raw.points,
      distance: raw.distance,
      elevationGain: elevGain,
      elevationLoss: elevLoss,
      avgGrade,
      maxGrade,
      type: raw.type,
      cumulativeDistance: cumDist,
      cumulativeElevationGain: cumElevGain,
    } satisfies GpxSegment
  })
}

// ─── Fonction principale ─────────────────────────────────────────────────────

/**
 * Parse un fichier GPX (File ou string XML) et retourne un GpxTrack complet.
 *
 * @example
 * const track = await parseGpxFile(file)
 * console.log(track.totalDistance, track.totalElevationGain)
 */
export async function parseGpxFile(input: File | string): Promise<GpxTrack> {
  // Lecture du contenu si c'est un File
  const xmlContent = typeof input === 'string'
    ? input
    : await input.text()

  // 1. Parse XML → points bruts
  const { name, points: rawPoints } = parseGpxXml(xmlContent)

  // 2. Lissage altitude
  const points = smoothAltitudes(rawPoints)

  // 3. Calcul des métriques globales
  let totalDistance = 0
  let totalElevationGain = 0
  let totalElevationLoss = 0
  let minElevation = Infinity
  let maxElevation = -Infinity

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.elevation < minElevation) minElevation = p.elevation
    if (p.elevation > maxElevation) maxElevation = p.elevation

    if (i > 0) {
      const prev = points[i - 1]!
      totalDistance += haversineDistance(prev.lat, prev.lon, p.lat, p.lon)
      const diff = p.elevation - prev.elevation
      if (diff > 0) totalElevationGain += diff
      else totalElevationLoss += Math.abs(diff)
    }
  }

  // 4. Segmentation
  const segments = buildSegments(points)

  return {
    name,
    totalDistance,
    totalElevationGain,
    totalElevationLoss,
    minElevation,
    maxElevation,
    points,
    segments,
  } satisfies GpxTrack
}

// ─── Utilitaires de sauvegarde ────────────────────────────────────────────────

/** Calcule le SHA-256 (hex) des bytes bruts d'un fichier */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Infère le profil du tracé selon le D+ par km */
export function inferTrackProfile(track: GpxTrack): 'route' | 'trail' | 'mixed' {
  const distanceKm = track.totalDistance / 1000
  if (distanceKm === 0) return 'mixed'
  const gainPerKm = track.totalElevationGain / distanceKm
  if (gainPerKm < 20) return 'route'
  if (gainPerKm > 50) return 'trail'
  return 'mixed'
}
