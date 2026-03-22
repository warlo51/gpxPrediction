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

  return {
    sessionId: session.id,
    flatAvgSpeedMs,
    speedGradeSamples,
    hrSpeedSamples,
    performanceDrift,
  }
}

// ─── Calibration du modèle vitesse ───────────────────────────────────────────

/**
 * Calibre la relation vitesse ↔ pente à partir de l'ensemble des échantillons.
 * Régression linéaire simple : speed = flatSpeed * (1 - k * grade)
 */
function calibrateSpeedModel(
  allSamples: SessionMetrics['speedGradeSamples'],
  flatSpeedMs: number,
): { uphillDecayFactor: number; downhillBoostFactor: number } {
  if (allSamples.length < 10) {
    return {
      uphillDecayFactor: DEFAULT_RUNNER_PROFILE.speedModel.uphillDecayFactor,
      downhillBoostFactor: DEFAULT_RUNNER_PROFILE.speedModel.downhillBoostFactor,
    }
  }

  const uphillSamples = allSamples.filter((s) => s.grade > 3 && s.grade < 30)
  const downhillSamples = allSamples.filter((s) => s.grade < -3 && s.grade > -30)

  // Facteur montée : k = (1 - speed/flatSpeed) / grade
  const uphillFactors = uphillSamples
    .map((s) => (1 - s.speedMs / flatSpeedMs) / s.grade)
    .filter((k) => k > 0 && k < 0.3)

  // Facteur descente : k = (speed/flatSpeed - 1) / |grade|
  const downhillFactors = downhillSamples
    .map((s) => (s.speedMs / flatSpeedMs - 1) / Math.abs(s.grade))
    .filter((k) => k > 0 && k < 0.15)

  return {
    uphillDecayFactor:
      uphillFactors.length >= 5
        ? median(removeOutliers(uphillFactors))
        : DEFAULT_RUNNER_PROFILE.speedModel.uphillDecayFactor,
    downhillBoostFactor:
      downhillFactors.length >= 5
        ? median(removeOutliers(downhillFactors))
        : DEFAULT_RUNNER_PROFILE.speedModel.downhillBoostFactor,
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

  const globalPaces = history
    .filter((s) => s.avgPace > 0)
    .map((s) => 1000 / s.avgPace) // avgPace en s/km → m/s

  const flatSpeedMs =
    flatSpeeds.length >= 2
      ? median(removeOutliers(flatSpeeds))
      : globalPaces.length > 0
        ? median(removeOutliers(globalPaces)) * 1.05 // légère correction plat vs allure globale
        : baseProfile.speedModel.flatSpeed

  const basePaceSecPerKm = Math.round(1000 / flatSpeedMs)

  // ── 3. Calibration modèle vitesse
  const allSpeedGradeSamples = metrics.flatMap((m) => m.speedGradeSamples)
  const speedModelCalibration = calibrateSpeedModel(allSpeedGradeSamples, flatSpeedMs)

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
