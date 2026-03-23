/**
 * Service de parsing des fichiers FIT Garmin
 * Extrait toutes les métriques disponibles et les mappe vers TrainingSession
 *
 * Le format FIT (Flexible and Interoperable Data Transfer) est le format natif
 * Garmin — il contient les données GPS brutes non lissées, la cadence, la puissance,
 * la variabilité FC, et bien plus que ce que Strava expose via son API.
 */

import FitParser from 'fit-file-parser'
import type { TrainingSession, ActivityStreams } from '@/types'

// ─── Types internes FIT ───────────────────────────────────────────────────────

/** Un enregistrement GPS/capteur à un instant t */
interface FitRecord {
  timestamp?: string
  position_lat?: number   // semicircles → degrés / 11930465
  position_long?: number  // semicircles → degrés / 11930465
  altitude?: number       // mètres
  heart_rate?: number     // bpm
  speed?: number          // m/s
  distance?: number       // mètres
  cadence?: number        // pas/min
  power?: number          // watts
  grade?: number          // % pente (pas toujours présent)
  temperature?: number    // °C
  [key: string]: unknown
}

/** Session globale dans un fichier FIT */
interface FitSession {
  timestamp?: string
  start_time?: string
  total_elapsed_time?: number   // secondes
  total_timer_time?: number     // secondes (temps actif)
  total_distance?: number       // mètres
  total_ascent?: number         // mètres D+
  total_descent?: number        // mètres D-
  avg_heart_rate?: number       // bpm
  max_heart_rate?: number       // bpm
  avg_speed?: number            // m/s
  max_speed?: number            // m/s
  avg_cadence?: number
  avg_power?: number
  total_calories?: number
  sport?: string
  sub_sport?: string
  laps?: FitLap[]
  [key: string]: unknown
}

interface FitLap {
  total_elapsed_time?: number
  total_distance?: number
  total_ascent?: number
  avg_heart_rate?: number
  avg_speed?: number
  [key: string]: unknown
}

// ─── Conversion semicircles → degrés ─────────────────────────────────────────

/** Garmin stocke lat/lon en semicircles (entiers 32 bits) */
function semicirclesToDegrees(sc: number): number {
  return sc * (180 / 2147483648)
}

// ─── Calcul de pente depuis l'altitude ────────────────────────────────────────

/**
 * Calcule le grade_smooth depuis les séries altitude et distance.
 * Fenêtre glissante de 10 points pour lisser le bruit GPS.
 */
function computeGradeSmooth(altitudes: number[], distances: number[]): number[] {
  const grades: number[] = new Array(altitudes.length).fill(0)
  const window = 10
  for (let i = window; i < altitudes.length; i++) {
    const dDist = distances[i]! - distances[i - window]!
    const dAlt = altitudes[i]! - altitudes[i - window]!
    if (dDist > 1) {
      grades[i] = (dAlt / dDist) * 100
    }
  }
  return grades
}

// ─── Extraction des streams depuis les records ────────────────────────────────

function extractStreams(records: FitRecord[]): ActivityStreams {
  const distance: number[] = []
  const altitude: number[] = []
  const heartrate: number[] = []
  const velocity_smooth: number[] = []
  const latlng: [number, number][] = []
  const time: number[] = []

  let hasHR = false
  let hasSpeed = false
  let hasPosition = false
  let hasAltitude = false

  const startTime = records[0]?.timestamp
    ? new Date(records[0].timestamp).getTime()
    : 0

  for (const rec of records) {
    // Distance
    if (rec.distance !== undefined) {
      distance.push(rec.distance)
    } else if (distance.length > 0) {
      distance.push(distance[distance.length - 1]!)
    } else {
      distance.push(0)
    }

    // Altitude
    if (rec.altitude !== undefined) {
      altitude.push(rec.altitude)
      hasAltitude = true
    } else {
      altitude.push(altitude.length > 0 ? altitude[altitude.length - 1]! : 0)
    }

    // FC
    if (rec.heart_rate !== undefined) {
      heartrate.push(rec.heart_rate)
      hasHR = true
    } else {
      heartrate.push(0)
    }

    // Vitesse
    if (rec.speed !== undefined) {
      velocity_smooth.push(rec.speed)
      hasSpeed = true
    } else {
      velocity_smooth.push(0)
    }

    // Coordonnées GPS
    if (rec.position_lat !== undefined && rec.position_long !== undefined) {
      const lat = typeof rec.position_lat === 'number' && Math.abs(rec.position_lat) > 90
        ? semicirclesToDegrees(rec.position_lat)
        : rec.position_lat
      const lng = typeof rec.position_long === 'number' && Math.abs(rec.position_long) > 180
        ? semicirclesToDegrees(rec.position_long)
        : rec.position_long
      latlng.push([lat, lng])
      hasPosition = true
    }

    // Temps relatif
    if (rec.timestamp) {
      time.push((new Date(rec.timestamp).getTime() - startTime) / 1000)
    }
  }

  // Grade smooth calculé depuis l'altitude (plus fiable que le GPS brut)
  const grade_smooth = hasAltitude && distance.length > 10
    ? computeGradeSmooth(altitude, distance)
    : undefined

  const streams: ActivityStreams = {
    distance,
    altitude,
    ...(hasHR && { heartrate }),
    ...(hasSpeed && { velocity_smooth }),
    ...(hasPosition && { latlng }),
    ...(time.length > 0 && { time }),
    ...(grade_smooth && { grade_smooth }),
  }

  return streams
}

// ─── Résultat du parsing ──────────────────────────────────────────────────────

export type FitParseResult = {
  session: TrainingSession
  /** Métriques avancées Garmin non disponibles via Strava */
  garminExtras: {
    avgCadence?: number
    avgPower?: number
    totalCalories?: number
    avgTemperature?: number
    sport?: string
    subSport?: string
    totalAscent?: number
    totalDescent?: number
  }
  /** Nombre de records GPS parsés */
  recordCount: number
  /** Qualité des données : streams disponibles */
  hasGPS: boolean
  hasHR: boolean
  hasSpeed: boolean
}

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Parse un fichier FIT Garmin et retourne une TrainingSession complète.
 *
 * @param buffer - ArrayBuffer du fichier .fit
 * @param fileName - nom du fichier (utilisé comme nom de séance par défaut)
 */
export async function parseFitFile(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<FitParseResult> {
  const parser = new FitParser({
    force: true,        // continuer même si le fichier a des erreurs mineures
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    mode: 'list',       // mode liste = records à plat, plus simple à traiter
  })

  const fit = await parser.parseAsync(buffer)

  // ── Extraire les records (données point par point)
  const records: FitRecord[] = (fit.records ?? []) as FitRecord[]

  // ── Extraire les métriques de session globale
  // En mode 'list', les sessions sont dans fit.activity.sessions ou fit.sessions
  const fitSessions = (fit.activity?.sessions ?? fit.sessions ?? []) as FitSession[]
  const mainSession: FitSession = fitSessions[0] ?? {}

  // Fallback : calculer depuis les records si session absente
  const totalDistance = mainSession.total_distance
    ?? (records.length > 0
      ? (records[records.length - 1] as FitRecord).distance ?? 0
      : 0)

  const totalDuration = mainSession.total_timer_time
    ?? mainSession.total_elapsed_time
    ?? (records.length > 1
      ? ((new Date((records[records.length - 1] as FitRecord).timestamp ?? 0).getTime()
        - new Date((records[0] as FitRecord).timestamp ?? 0).getTime()) / 1000)
      : 0)

  const totalAscent = mainSession.total_ascent
    ?? (() => {
      // Calculer le D+ depuis les altitudes si absent
      let gain = 0
      for (let i = 1; i < records.length; i++) {
        const dAlt = (records[i]!.altitude ?? 0) - (records[i - 1]!.altitude ?? 0)
        if (dAlt > 0) gain += dAlt
      }
      return gain
    })()

  const startDate = mainSession.start_time
    ? new Date(mainSession.start_time)
    : records[0]?.timestamp
      ? new Date(records[0].timestamp)
      : new Date()

  // Allure moyenne (s/km)
  const avgSpeed = mainSession.avg_speed
    ?? (records.length > 0
      ? records.reduce((acc, r) => acc + (r.speed ?? 0), 0) / records.length
      : 0)
  const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0

  // FC
  const avgHR = mainSession.avg_heart_rate
    ?? (() => {
      const hrValues = records.map(r => r.heart_rate ?? 0).filter(v => v > 0)
      return hrValues.length > 0
        ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
        : undefined
    })()

  const maxHR = mainSession.max_heart_rate
    ?? (() => {
      const hrValues = records.map(r => r.heart_rate ?? 0).filter(v => v > 0)
      return hrValues.length > 0 ? Math.max(...hrValues) : undefined
    })()

  // Température moyenne
  const temperatures = records.map(r => r.temperature ?? null).filter((t): t is number => t !== null)
  const avgTemperature = temperatures.length > 0
    ? Math.round(temperatures.reduce((a, b) => a + b, 0) / temperatures.length)
    : undefined

  // ── Extraire les streams
  const streams = extractStreams(records)
  const hasGPS = (streams.latlng?.length ?? 0) > 0
  const hasHR = (streams.heartrate?.filter(v => v > 0).length ?? 0) > 0
  const hasSpeed = (streams.velocity_smooth?.filter(v => v > 0).length ?? 0) > 0

  // ── Nom de la séance
  const sessionName = fileName
    .replace(/\.fit$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    || `Séance Garmin ${startDate.toLocaleDateString('fr-FR')}`

  const session: TrainingSession = {
    id: `fit-${startDate.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    name: sessionName,
    date: startDate,
    source: 'gpx', // on réutilise 'gpx' comme source "fichier importé"
    distance: totalDistance,
    duration: totalDuration,
    elevationGain: totalAscent,
    avgPace,
    avgHeartRate: avgHR && avgHR > 0 ? avgHR : undefined,
    maxHeartRate: maxHR && maxHR > 0 ? maxHR : undefined,
    streams: records.length > 10 ? streams : undefined,
  }

  return {
    session,
    garminExtras: {
      avgCadence: mainSession.avg_cadence,
      avgPower: mainSession.avg_power,
      totalCalories: mainSession.total_calories,
      avgTemperature,
      sport: mainSession.sport,
      subSport: mainSession.sub_sport,
      totalAscent,
      totalDescent: mainSession.total_descent,
    },
    recordCount: records.length,
    hasGPS,
    hasHR,
    hasSpeed,
  }
}

/**
 * Parse plusieurs fichiers FIT en parallèle.
 */
export async function parseFitFiles(
  files: File[],
): Promise<{ results: FitParseResult[]; errors: { file: string; error: string }[] }> {
  const results: FitParseResult[] = []
  const errors: { file: string; error: string }[] = []

  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer()
      const result = await parseFitFile(buffer, file.name)
      results.push(result)
    } catch (err) {
      errors.push({
        file: file.name,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  }

  return { results, errors }
}
