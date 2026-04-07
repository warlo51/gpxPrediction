/**
 * Service de prédiction de course basé sur les données Garmin/Firstbeat.
 *
 * Algorithme :
 * 1. Convertir le tracé GPX en distance "km-effort" (D+ et D- réduits en km équivalents plat)
 * 2. Ajuster les prédictions Garmin via la courbe de Riegel (T = a × D^b)
 * 3. Interpoler / extrapoler pour la distance km-effort cible
 *
 * Références :
 * - Riegel (1981) : T2 = T1 × (D2/D1)^1.06  — exponent calibré ici sur les données du coureur
 * - Ehrenberg / UTMB km-effort : +1km/100m D+, +0.5km/100m D-
 */

import type { GpxTrack, GarminRacePredictions } from '@/types'

// ─── Distances de référence Garmin (mètres) ───────────────────────────────────

const REFERENCE_DISTANCES = {
  fiveK: 5000,
  tenK: 10000,
  halfMarathon: 21097,
  marathon: 42195,
} as const

// ─── km-effort ────────────────────────────────────────────────────────────────

/**
 * Calcule la distance "km-effort" d'un tracé GPX.
 *
 * La distance km-effort convertit le dénivelé en distance équivalente sur plat,
 * selon la formule Ehrenberg / UTMB :
 *   +1 km par 100m D+
 *   +0.5 km par 100m D-
 *
 * @returns Distance équivalente en mètres
 */
export function computeKmEffortDistance(track: GpxTrack): number {
  const flatDistanceM = track.totalDistance
  const uphillEquivalentM = (track.totalElevationGain / 100) * 1000   // +1km/100m D+
  const downhillEquivalentM = (track.totalElevationLoss / 100) * 500  // +0.5km/100m D-
  return flatDistanceM + uphillEquivalentM + downhillEquivalentM
}

// ─── Courbe de Riegel ─────────────────────────────────────────────────────────

type RiegelParams = {
  /** Coefficient d'échelle */
  a: number
  /** Exposant d'endurance (typiquement 1.04 – 1.12 pour la course à pied) */
  b: number
}

type RacePoint = { distanceM: number; timeSeconds: number }

/**
 * Ajuste la courbe de Riegel (T = a × D^b) sur les prédictions Garmin.
 * Utilise une régression linéaire sur log(T) = log(a) + b×log(D).
 *
 * Nécessite au moins 2 points pour calculer l'exposant b.
 * Avec 1 seul point, utilise l'exposant par défaut de Riegel (1.06).
 */
export function fitRiegelCurve(predictions: GarminRacePredictions): RiegelParams {
  const points: RacePoint[] = []

  if (predictions.fiveK)        points.push({ distanceM: REFERENCE_DISTANCES.fiveK, timeSeconds: predictions.fiveK })
  if (predictions.tenK)         points.push({ distanceM: REFERENCE_DISTANCES.tenK, timeSeconds: predictions.tenK })
  if (predictions.halfMarathon) points.push({ distanceM: REFERENCE_DISTANCES.halfMarathon, timeSeconds: predictions.halfMarathon })
  if (predictions.marathon)     points.push({ distanceM: REFERENCE_DISTANCES.marathon, timeSeconds: predictions.marathon })

  if (points.length === 0) {
    // Aucune donnée — valeurs Riegel par défaut (coureur moyen)
    return { a: 1.0, b: 1.06 }
  }

  if (points.length === 1) {
    // Un seul point → exposant Riegel standard, a calé sur ce point
    const p = points[0]!
    const b = 1.06
    const a = p.timeSeconds / Math.pow(p.distanceM, b)
    return { a, b }
  }

  // Régression linéaire sur les log : log(T) = log(a) + b × log(D)
  const logD = points.map(p => Math.log(p.distanceM))
  const logT = points.map(p => Math.log(p.timeSeconds))
  const n = points.length
  const meanLogD = logD.reduce((s, v) => s + v, 0) / n
  const meanLogT = logT.reduce((s, v) => s + v, 0) / n

  const numerator = logD.reduce((s, v, i) => s + (v - meanLogD) * (logT[i]! - meanLogT), 0)
  const denominator = logD.reduce((s, v) => s + (v - meanLogD) ** 2, 0)

  const b = denominator > 0 ? numerator / denominator : 1.06
  const a = Math.exp(meanLogT - b * meanLogD)

  return { a, b }
}

// ─── Prédiction principale ────────────────────────────────────────────────────

export type GarminCurvePrediction = {
  /** Temps prédit en secondes */
  totalTimeSeconds: number
  /** Distance km-effort en mètres */
  kmEffortDistanceM: number
  /** Distance km-effort en km (lisible) */
  kmEffortDistanceKm: number
  /** Exposant de Riegel calibré sur les données du coureur */
  riegelExponent: number
  /** Fiabilité selon le nombre de prédictions Garmin disponibles */
  confidence: 'high' | 'medium' | 'low'
  /** Source des prédictions Garmin */
  predictionSource: GarminRacePredictions['source']
}

/**
 * Prédit le temps de course pour un tracé GPX à partir des prédictions Garmin.
 *
 * @param predictions - Prédictions de course Garmin (5K, 10K, semi, marathon)
 * @param track - Tracé GPX de la course cible
 */
export function predictFromGarminCurve(
  predictions: GarminRacePredictions,
  track: GpxTrack,
): GarminCurvePrediction {
  const kmEffortDistanceM = computeKmEffortDistance(track)
  const kmEffortDistanceKm = kmEffortDistanceM / 1000
  const { a, b } = fitRiegelCurve(predictions)

  const totalTimeSeconds = Math.round(a * Math.pow(kmEffortDistanceM, b))

  const availablePoints = [
    predictions.fiveK,
    predictions.tenK,
    predictions.halfMarathon,
    predictions.marathon,
  ].filter(Boolean).length

  const confidence: GarminCurvePrediction['confidence'] =
    availablePoints >= 3 ? 'high'
    : availablePoints === 2 ? 'medium'
    : 'low'

  return {
    totalTimeSeconds,
    kmEffortDistanceM,
    kmEffortDistanceKm,
    riegelExponent: b,
    confidence,
    predictionSource: predictions.source,
  }
}

// ─── Formatage ────────────────────────────────────────────────────────────────

/** Formate un temps en secondes en "H:MM:SS" */
export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
