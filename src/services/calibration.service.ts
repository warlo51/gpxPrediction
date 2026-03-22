/**
 * Service de calibration automatique du profil coureur
 * Analyse un historique de TrainingSession[] pour générer un RunnerProfile calibré.
 */

import type { TrainingSession, RunnerProfile, SessionMetrics } from '@/types'
import { DEFAULT_RUNNER_PROFILE } from '@/stores/appStore'

// ─── Helpers statistiques ─────────────────────────────────────────────────────

/** Moyenne d'un tableau de nombres */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Médiane d'un tableau de nombres */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/** Écart-type */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length)
}

/**
 * Filtre les valeurs aberrantes (hors ±2 écarts-types)
 * Évite que des données GPS corrompues faussent la calibration.
 */
function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values
  const avg = mean(values)
  const sd = stdDev(values)
  return values.filter((v) => Math.abs(v - avg) <= 2 * sd)
}

// ─── Extraction des métriques par séance ─────────────────────────────────────

/**
 * Extrait les métriques pertinentes d'une séance individuelle.
 * Nécessite que les streams soient présents pour la calibration fine.
 */
function extractSessionMetrics(session: TrainingSession): SessionMetrics | null {
  // Sans streams, on ne peut extraire que les métriques globales
  if (!session.streams?.distance || !session.streams.altitude) {
    return null
  }

  const { distance: distStream, altitude: altStream, heartrate, velocity_smooth } =
    session.streams

  const speedGradeSamples: SessionMetrics['speedGradeSamples'] = []
  const hrSpeedSamples: SessionMetrics['hrSpeedSamples'] = []

  // Fenêtre glissante sur les streams pour calculer pente et vitesse locale
  const windowSize = 5
  for (let i = windowSize; i < distStream.length; i++) {
    const dDist = distStream[i]! - distStream[i - windowSize]!
    const dAlt = altStream[i]! - altStream[i - windowSize]!

    if (dDist < 1) continue

    const grade = (dAlt / dDist) * 100
    const speedMs = velocity_smooth
      ? velocity_smooth[i] ?? dDist / windowSize
      : dDist / windowSize

    if (speedMs > 0.5 && speedMs < 10 && Math.abs(grade) < 50) {
      speedGradeSamples.push({ grade, speedMs })

      if (heartrate?.[i]) {
        hrSpeedSamples.push({ speedMs, hr: heartrate[i]! })
      }
    }
  }

  // Dérive de performance : ratio vitesse moyenne fin/début (dernier tiers vs premier tiers)
  const third = Math.floor(distStream.length / 3)
  const startSpeeds = velocity_smooth?.slice(0, third).filter((v) => v > 0) ?? []
  const endSpeeds = velocity_smooth?.slice(2 * third).filter((v) => v > 0) ?? []
  const performanceDrift =
    startSpeeds.length > 0 && endSpeeds.length > 0
      ? mean(endSpeeds) / mean(startSpeeds)
      : 1

  // Vitesse sur plat (segments avec |grade| < 2%)
  const flatSamples = speedGradeSamples
    .filter((s) => Math.abs(s.grade) < 2)
    .map((s) => s.speedMs)
  const flatAvgSpeedMs = flatSamples.length > 0 ? mean(removeOutliers(flatSamples)) : 0

  // Vitesse médiane par tranche de pente de 5% (pour détecter le seuil de marche)
  const BUCKETS = [5, 10, 15, 20, 25, 30, 35, 40]
  const speedByGradeBucket = BUCKETS.map((gradeMin) => {
    const gradeMax = gradeMin + 5
    const samples = speedGradeSamples
      .filter(s => s.grade >= gradeMin && s.grade < gradeMax)
      .map(s => s.speedMs)
    return {
      gradeMin,
      gradeMax,
      medianSpeedMs: samples.length >= 3 ? median(samples) : -1,
      count: samples.length,
    }
  }).filter(b => b.medianSpeedMs > 0)

  return {
    sessionId: session.id,
    flatAvgSpeedMs,
    speedGradeSamples,
    hrSpeedSamples,
    performanceDrift,
    speedByGradeBucket,
  }
}

/**
 * Détecte automatiquement le seuil de pente à partir duquel le coureur marche.
 *
 * Méthode : pour chaque tranche de 5% de pente, on calcule la vitesse médiane.
 * Le seuil de marche est la première tranche où la vitesse médiane passe
 * en dessous du seuil de marche défini (~1.5 m/s ≈ 5.4 km/h).
 *
 * On agrège les buckets de toutes les séances pour plus de robustesse.
 */
function calibrateWalkingThreshold(
  allMetrics: SessionMetrics[],
): number | null {
  const WALKING_SPEED_MS = 1.6 // ~5.8 km/h — vitesse max considérée comme "marche"

  // Agréger tous les buckets de toutes les séances
  const bucketMap = new Map<number, number[]>()
  for (const m of allMetrics) {
    for (const b of m.speedByGradeBucket) {
      const arr = bucketMap.get(b.gradeMin) ?? []
      // On pousse la vitesse médiane de cette séance pour ce bucket
      if (b.medianSpeedMs > 0) arr.push(b.medianSpeedMs)
      bucketMap.set(b.gradeMin, arr)
    }
  }

  // Pour chaque tranche, calculer la médiane inter-séances
  // Trouver la première tranche où la médiane < seuil marche
  const sortedGrades = [...bucketMap.keys()].sort((a, b) => a - b)
  for (const gradeMin of sortedGrades) {
    const speeds = bucketMap.get(gradeMin)!
    if (speeds.length < 2) continue // pas assez de données
    const medSpeed = median(speeds)
    if (medSpeed < WALKING_SPEED_MS) {
      // Le seuil est au milieu de cette tranche (gradeMin + 2.5), arrondi à l'entier
      return Math.round(gradeMin + 2.5)
    }
  }

  return null // pas assez de données pour détecter
}

// ─── Calibration du modèle vitesse ───────────────────────────────────────────

function calibrateSpeedModel(
  allSamples: SessionMetrics['speedGradeSamples'],
  flatSpeedMs: number,
  allMetrics: SessionMetrics[],
): { uphillDecayFactor: number; downhillBoostFactor: number; walkingThresholdGrade: number | null } {
  if (allSamples.length < 10) {
    return {
      uphillDecayFactor: DEFAULT_RUNNER_PROFILE.speedModel.uphillDecayFactor,
      downhillBoostFactor: DEFAULT_RUNNER_PROFILE.speedModel.downhillBoostFactor,
      walkingThresholdGrade: null,
    }
  }

  const uphillSamples = allSamples.filter((s) => s.grade > 3 && s.grade < 30)
  const downhillSamples = allSamples.filter((s) => s.grade < -3 && s.grade > -30)

  // Facteur montée : k = -ln(speed/flatSpeed) / grade  (modèle exponentiel)
  const uphillFactors = uphillSamples
    .map((s) => {
      const ratio = s.speedMs / flatSpeedMs
      if (ratio <= 0 || ratio >= 1) return null
      return -Math.log(ratio) / s.grade
    })
    .filter((k): k is number => k !== null && k > 0.01 && k < 0.15)

  // Facteur descente : k = (speed/flatSpeed - 1) / |grade|
  const downhillFactors = downhillSamples
    .map((s) => (s.speedMs / flatSpeedMs - 1) / Math.abs(s.grade))
    .filter((k) => k > 0 && k < 0.15)

  // Seuil de marche détecté depuis les données réelles
  const walkingThresholdGrade = calibrateWalkingThreshold(allMetrics)

  return {
    uphillDecayFactor:
      uphillFactors.length >= 5
        ? median(removeOutliers(uphillFactors))
        : DEFAULT_RUNNER_PROFILE.speedModel.uphillDecayFactor,
    downhillBoostFactor:
      downhillFactors.length >= 5
        ? median(removeOutliers(downhillFactors))
        : DEFAULT_RUNNER_PROFILE.speedModel.downhillBoostFactor,
    walkingThresholdGrade,
  }
}

// ─── Calibration du modèle FC ─────────────────────────────────────────────────

function calibrateHeartRateModel(
  allHrSamples: SessionMetrics['hrSpeedSamples'],
  sessions: TrainingSession[],
): Partial<RunnerProfile['heartRateModel']> {
  const sessionsWithHR = sessions.filter((s) => s.avgHeartRate && s.avgHeartRate > 0)

  if (sessionsWithHR.length === 0 && allHrSamples.length === 0) return {}

  const avgHRs = sessionsWithHR.map((s) => s.avgHeartRate!)
  const maxHRs = sessionsWithHR.map((s) => s.maxHeartRate ?? s.avgHeartRate! * 1.1)

  return {
    baseHR: avgHRs.length > 0 ? Math.round(median(removeOutliers(avgHRs))) : undefined,
    maxHR:
      maxHRs.length > 0
        ? Math.round(Math.max(...removeOutliers(maxHRs)))
        : undefined,
  }
}

// ─── Calibration fatigue / endurance ─────────────────────────────────────────

/**
 * Estime le score d'endurance et le facteur de fatigue horaire
 * à partir de la dérive de performance moyenne sur les longues séances.
 */
function calibrateFatigueModel(
  metrics: SessionMetrics[],
  sessions: TrainingSession[],
): { enduranceScore: number; hourlyDecayFactor: number; fatigueThresholdKm: number } {
  // Séances longues (> 1h)
  const longSessions = sessions.filter((s) => s.duration > 3600)
  const drifts = metrics.map((m) => m.performanceDrift).filter((d) => d > 0.5 && d < 1.5)

  const avgDrift = drifts.length > 0 ? mean(drifts) : 1

  // Score d'endurance : 1 = pas de dérive, 0 = forte dérive
  const enduranceScore = Math.min(1, Math.max(0.1, avgDrift * 0.9))

  // Facteur de fatigue horaire calibré sur la dérive
  const hourlyDecay = drifts.length > 0 ? (1 - avgDrift) / 2 : 0.03
  const hourlyDecayFactor = Math.max(0.005, Math.min(0.1, hourlyDecay))

  // Seuil de fatigue tardive : distance médiane des longues séances
  const longDistances = longSessions.map((s) => s.distance / 1000)
  const fatigueThresholdKm =
    longDistances.length > 0
      ? Math.round(median(longDistances) * 0.6)
      : DEFAULT_RUNNER_PROFILE.fatigueModel.fatigueThresholdKm

  return { enduranceScore, hourlyDecayFactor, fatigueThresholdKm }
}

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Génère un RunnerProfile calibré à partir d'un historique de séances.
 * Fonctionne avec ou sans streams (dégradation gracieuse).
 *
 * @param history - Tableau de séances d'entraînement
 * @param baseProfile - Profil de base à enrichir (optionnel)
 * @returns RunnerProfile calibré
 */
export function calibrateRunner(
  history: TrainingSession[],
  baseProfile: RunnerProfile = DEFAULT_RUNNER_PROFILE,
): RunnerProfile {
  if (history.length === 0) return baseProfile

  // ── 1. Extraction des métriques
  const metrics = history
    .map(extractSessionMetrics)
    .filter((m): m is SessionMetrics => m !== null)

  // ── 2. Vitesse de base sur plat (médiane des séances avec streams, sinon allure globale)
  const flatSpeeds = metrics
    .map((m) => m.flatAvgSpeedMs)
    .filter((v) => v > 0.5 && v < 8)

  // Allure globale brute depuis les séances (s/km → m/s)
  const globalPaces = history
    .filter((s) => s.avgPace > 0)
    .map((s) => 1000 / s.avgPace)

  let flatSpeedMs: number

  if (flatSpeeds.length >= 2) {
    // On a des segments plats détectés via streams → source la plus fiable
    flatSpeedMs = median(removeOutliers(flatSpeeds))
  } else if (globalPaces.length > 0) {
    // Pas de streams → on corrige l'allure globale vers le haut
    // car elle est ralentie par les montées.
    // Correction basée sur le D+/km moyen des séances :
    // ~+8% de correction par 100m D+/km (empirique trail)
    const avgElevGainPerKm = mean(
      history
        .filter((s) => s.distance > 0)
        .map((s) => (s.elevationGain / (s.distance / 1000)))
    )
    // Facteur de correction : D+/km × 0.08 (ex: 50m/km D+ → +4%)
    const correctionFactor = 1 + Math.min(0.35, (avgElevGainPerKm / 100) * 0.08)
    flatSpeedMs = median(removeOutliers(globalPaces)) * correctionFactor
  } else {
    flatSpeedMs = baseProfile.speedModel.flatSpeed
  }

  const basePaceSecPerKm = Math.round(1000 / flatSpeedMs)

  // ── 3. Calibration modèle vitesse (+ seuil de marche détecté)
  const allSpeedGradeSamples = metrics.flatMap((m) => m.speedGradeSamples)
  const speedModelCalibration = calibrateSpeedModel(allSpeedGradeSamples, flatSpeedMs, metrics)

  // ── 4. Calibration FC
  const allHrSamples = metrics.flatMap((m) => m.hrSpeedSamples)
  const hrCalibration = calibrateHeartRateModel(allHrSamples, history)

  // ── 5. Calibration fatigue
  const fatigueCalibration = calibrateFatigueModel(metrics, history)

  // ── 6. Assemblage du profil calibré
  return {
    ...baseProfile,
    calibratedAt: new Date(),
    sessionCount: history.length,
    basePaceSecPerKm,
    baseHeartRate: hrCalibration.baseHR ?? baseProfile.baseHeartRate,
    enduranceScore: fatigueCalibration.enduranceScore,

    speedModel: {
      ...baseProfile.speedModel,
      flatSpeed: flatSpeedMs,
      uphillDecayFactor: speedModelCalibration.uphillDecayFactor,
      downhillBoostFactor: speedModelCalibration.downhillBoostFactor,
      // Seuil de marche détecté automatiquement depuis les vraies données GPS
      ...(speedModelCalibration.walkingThresholdGrade !== null && {
        walkingThresholdGrade: speedModelCalibration.walkingThresholdGrade,
      }),
    },

    heartRateModel: {
      ...baseProfile.heartRateModel,
      ...(hrCalibration.baseHR && { baseHR: hrCalibration.baseHR }),
      ...(hrCalibration.maxHR && { maxHR: hrCalibration.maxHR }),
    },

    fatigueModel: {
      ...baseProfile.fatigueModel,
      hourlyDecayFactor: fatigueCalibration.hourlyDecayFactor,
      fatigueThresholdKm: fatigueCalibration.fatigueThresholdKm,
    },
  }
}

// ─── Résumé de calibration ────────────────────────────────────────────────────

export type CalibrationSummary = {
  sessionCount: number
  sessionsWithStreams: number
  sessionsWithHR: number
  flatSpeedMs: number
  basePaceSecPerKm: number
  enduranceScore: number
  confidence: 'faible' | 'moyenne' | 'elevee'
}

/** Génère un résumé lisible de la qualité de la calibration */
export function getCalibrationSummary(
  history: TrainingSession[],
  profile: RunnerProfile,
): CalibrationSummary {
  const sessionsWithStreams = history.filter(
    (s) => s.streams?.distance && s.streams.altitude,
  ).length
  const sessionsWithHR = history.filter((s) => s.avgHeartRate).length

  const confidence: CalibrationSummary['confidence'] =
    sessionsWithStreams >= 5 ? 'elevee' : sessionsWithStreams >= 2 ? 'moyenne' : 'faible'

  return {
    sessionCount: history.length,
    sessionsWithStreams,
    sessionsWithHR,
    flatSpeedMs: profile.speedModel.flatSpeed,
    basePaceSecPerKm: profile.basePaceSecPerKm,
    enduranceScore: profile.enduranceScore,
    confidence,
  }
}
