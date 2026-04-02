/**
 * Service de calibration automatique du profil coureur
 * Analyse un historique de TrainingSession[] pour générer un RunnerProfile calibré.
 */

import type { TrainingSession, RunnerProfile, SessionMetrics, CalibrationSource } from '@/types'
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

  const { distance: distStream, altitude: altStream, heartrate, velocity_smooth, grade_smooth } =
    session.streams

  const speedGradeSamples: SessionMetrics['speedGradeSamples'] = []
  const hrSpeedSamples: SessionMetrics['hrSpeedSamples'] = []
  const hrGradeSamples: SessionMetrics['hrGradeSamples'] = []

  // Fenêtre glissante sur les streams pour calculer pente et vitesse locale
  const windowSize = 5
  for (let i = windowSize; i < distStream.length; i++) {
    const dDist = distStream[i]! - distStream[i - windowSize]!
    if (dDist < 1) continue

    // Priorité : grade_smooth Strava (déjà lissé, plus précis que le calcul brut)
    const grade = grade_smooth?.[i] !== undefined
      ? grade_smooth[i]!
      : (() => {
          const dAlt = altStream[i]! - altStream[i - windowSize]!
          return (dAlt / dDist) * 100
        })()

    const speedMs = velocity_smooth
      ? velocity_smooth[i] ?? dDist / windowSize
      : dDist / windowSize

    if (speedMs > 0.5 && speedMs < 10 && Math.abs(grade) < 50) {
      speedGradeSamples.push({ grade, speedMs })

      if (heartrate?.[i]) {
        hrSpeedSamples.push({ speedMs, hr: heartrate[i]! })
        hrGradeSamples.push({ grade, hr: heartrate[i]! })
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

  // Dérive cardiaque : comparaison FC début vs fin sur les tiers du parcours,
  // uniquement si la séance dure au moins 1h (stream time requis pour plus de précision).
  let cardiacDrift: number | undefined
  if (heartrate && heartrate.length > 0) {
    const timeStream = session.streams?.time
    if (timeStream && timeStream.length > 10) {
      const totalTime = timeStream[timeStream.length - 1]! - timeStream[0]!
      if (totalTime > 3600) {
        const t0 = timeStream[0]!
        const firstThirdEnd = t0 + totalTime / 3
        const lastThirdStart = t0 + (2 * totalTime) / 3
        const firstThirdIdx = timeStream.findIndex((t) => t >= firstThirdEnd)
        const lastThirdIdx = timeStream.findIndex((t) => t >= lastThirdStart)
        if (firstThirdIdx > 5 && lastThirdIdx > 0 && lastThirdIdx < heartrate.length) {
          const firstHRs = heartrate.slice(0, firstThirdIdx).filter((h) => h > 40)
          const lastHRs = heartrate.slice(lastThirdIdx).filter((h) => h > 40)
          if (firstHRs.length > 10 && lastHRs.length > 10) {
            const hrDiff = mean(lastHRs) - mean(firstHRs)
            // Durée approximative entre milieux des deux tiers
            const hoursDiff = (totalTime * (2 / 3)) / 3600
            cardiacDrift = hrDiff / hoursDiff
          }
        }
      }
    } else {
      // Fallback : utiliser les tiers de l'index (moins précis)
      const startHRs = heartrate.slice(0, third).filter((h) => h > 40)
      const endHRs = heartrate.slice(2 * third).filter((h) => h > 40)
      if (startHRs.length > 5 && endHRs.length > 5 && session.duration > 3600) {
        const hrDiff = mean(endHRs) - mean(startHRs)
        const hoursDiff = (session.duration * (2 / 3)) / 3600
        cardiacDrift = hrDiff / hoursDiff
      }
    }
  }

  // Vitesse de marche réelle : médiane des vitesses sur les segments très raides (> 15%),
  // seuil conservateur pour capturer uniquement la marche forcée.
  const walkingSamples = speedGradeSamples
    .filter((s) => s.grade > 15 && s.speedMs < 2.5)
    .map((s) => s.speedMs)
  const walkingSpeedMs = walkingSamples.length >= 5 ? median(walkingSamples) : undefined

  // Vitesse sur plat (segments avec |grade| < 2%)
  const flatSamples = speedGradeSamples
    .filter((s) => Math.abs(s.grade) < 2)
    .map((s) => s.speedMs)
  const flatAvgSpeedMs = flatSamples.length > 0 ? mean(removeOutliers(flatSamples)) : 0

  // Vitesse médiane par tranche de pente de 2% (granularité fine pour détecter la transition)
  const BUCKETS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40]
  const speedByGradeBucket = BUCKETS.map((gradeMin) => {
    const gradeMax = gradeMin + 2
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
    hrGradeSamples,
    performanceDrift,
    speedByGradeBucket,
    cardiacDrift,
    walkingSpeedMs,
  }
}

/**
 * Détecte automatiquement le seuil de pente à partir duquel le coureur marche.
 *
 * Deux méthodes combinées :
 *
 * 1. Seuil absolu : première tranche où la vitesse médiane < WALKING_SPEED_MS (1.6 m/s)
 *
 * 2. Rupture de régime : détecte une chute brutale de vitesse entre deux buckets
 *    consécutifs (> DROP_THRESHOLD = 35%). Cela capture le passage course→marche
 *    même si la vitesse absolue ne descend pas encore sous 1.6 m/s.
 *    Exemple : 10 km/h à 8% puis 5 km/h à 10% → chute de 50% → seuil = 9%.
 *
 * Retourne null si trop peu de données (< 3 buckets avec données).
 * Prend aussi en compte le grade max réellement observé dans les séances.
 */
function calibrateWalkingThreshold(
  allMetrics: SessionMetrics[],
): number | null {
  const WALKING_SPEED_MS = 1.6   // ~5.8 km/h — vitesse clairement de marche
  const DROP_THRESHOLD = 0.35    // chute de vitesse de 35% entre deux buckets = transition course→marche

  // ── Agréger tous les buckets inter-séances
  const bucketMap = new Map<number, number[]>()
  for (const m of allMetrics) {
    for (const b of m.speedByGradeBucket) {
      if (b.medianSpeedMs <= 0) continue
      const arr = bucketMap.get(b.gradeMin) ?? []
      arr.push(b.medianSpeedMs)
      bucketMap.set(b.gradeMin, arr)
    }
  }

  // ── Construire la courbe vitesse médiane par grade (triée par grade croissant)
  const curve: { grade: number; speed: number; count: number }[] = []
  const sortedGrades = [...bucketMap.keys()].sort((a, b) => a - b)

  for (const grade of sortedGrades) {
    const speeds = bucketMap.get(grade)!
    if (speeds.length < 2) continue // minimum 2 séances pour ce bucket
    curve.push({ grade, speed: median(speeds), count: speeds.length })
  }

  if (curve.length < 2) return null // pas assez de données

  // ── Grade max observé dans les données réelles
  const maxObservedGrade = curve[curve.length - 1]!.grade

  // ── Méthode 1 : seuil absolu (vitesse < 1.6 m/s)
  let absoluteThreshold: number | null = null
  for (const point of curve) {
    if (point.speed < WALKING_SPEED_MS) {
      absoluteThreshold = point.grade
      break
    }
  }

  // ── Méthode 2 : rupture de régime (chute > 35% entre deux buckets consécutifs)
  let dropThreshold: number | null = null
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1]!
    const curr = curve[i]!
    const drop = (prev.speed - curr.speed) / prev.speed
    if (drop > DROP_THRESHOLD) {
      // Le seuil se situe entre le bucket précédent et le bucket courant
      // On prend le milieu des deux gradeMin
      dropThreshold = Math.round((prev.grade + curr.grade) / 2)
      break
    }
  }

  // ── Combiner les deux méthodes
  if (absoluteThreshold !== null && dropThreshold !== null) {
    // Prendre le plus bas (conservative) — si le coureur marche déjà à 10%
    // selon la rupture de régime, on ne va pas dire qu'il marche à 20%
    return Math.min(absoluteThreshold, dropThreshold)
  }

  if (dropThreshold !== null) return dropThreshold
  if (absoluteThreshold !== null) return absoluteThreshold

  // ── Fallback : si le grade max observé est < 15%, on ne peut pas détecter
  // le seuil de marche (on n'a jamais été assez raide).
  // On retourne null plutôt que de donner une valeur erronée.
  if (maxObservedGrade < 15) return null

  return null
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
  allHrGradeSamples: SessionMetrics['hrGradeSamples'],
  allMetrics: SessionMetrics[],
  sessions: TrainingSession[],
): Partial<RunnerProfile['heartRateModel']> {
  const sessionsWithHR = sessions.filter((s) => s.avgHeartRate && s.avgHeartRate > 0)

  if (sessionsWithHR.length === 0 && allHrSamples.length === 0) return {}

  const avgHRs = sessionsWithHR.map((s) => s.avgHeartRate!)
  const maxHRs = sessionsWithHR.map((s) => s.maxHeartRate ?? s.avgHeartRate! * 1.1)

  const calibratedBaseHR = avgHRs.length > 0 ? Math.round(median(removeOutliers(avgHRs))) : undefined
  const calibratedMaxHR =
    maxHRs.length > 0 ? Math.round(Math.max(...removeOutliers(maxHRs))) : undefined

  // ── gradeHRFactor : régression linéaire FC ~ pente sur les segments montants
  // Modèle : FC = a + b × grade → b est le gradeHRFactor
  let gradeHRFactor: number | undefined
  const uphillHrGrade = allHrGradeSamples.filter((s) => s.grade > 3 && s.grade < 25 && s.hr > 60)
  if (uphillHrGrade.length >= 15) {
    const grades = uphillHrGrade.map((s) => s.grade)
    const hrs = uphillHrGrade.map((s) => s.hr)
    const gradeMean = mean(grades)
    const hrMean = mean(hrs)
    const numerator = uphillHrGrade.reduce((acc, s) => acc + (s.grade - gradeMean) * (s.hr - hrMean), 0)
    const denominator = uphillHrGrade.reduce((acc, s) => acc + (s.grade - gradeMean) ** 2, 0)
    if (denominator > 0) {
      const slope = numerator / denominator
      gradeHRFactor = Math.max(0.3, Math.min(3.0, slope))
    }
  }

  // ── cardiacDriftBpmPerHour : médiane des dérives mesurées par séance
  const drifts = allMetrics
    .map((m) => m.cardiacDrift)
    .filter((d): d is number => d !== undefined && d > -1 && d < 12)
  const cardiacDriftBpmPerHour =
    drifts.length >= 2 ? Math.max(0, Math.round(median(removeOutliers(drifts)) * 10) / 10) : undefined

  // ── lactateThresholdHR : priorité à la valeur Garmin existante (Firstbeat),
  // sinon estimation classique FCR repos + 85% FCR
  let lactateThresholdHR: number | undefined = baseProfile.heartRateModel.lactateThresholdHR
  if (!lactateThresholdHR && calibratedBaseHR && calibratedMaxHR) {
    const restingHREstimate = calibratedBaseHR * 0.55 // approximation si FCR repos inconnue
    lactateThresholdHR = Math.round(restingHREstimate + 0.85 * (calibratedMaxHR - restingHREstimate))
  }

  return {
    baseHR: calibratedBaseHR,
    maxHR: calibratedMaxHR,
    ...(gradeHRFactor !== undefined && { gradeHRFactor }),
    ...(cardiacDriftBpmPerHour !== undefined && { cardiacDriftBpmPerHour }),
    ...(lactateThresholdHR !== undefined && { lactateThresholdHR }),
  }
}

// ─── Calibration fatigue / endurance ─────────────────────────────────────────

/**
 * Estime le score d'endurance, le facteur de fatigue horaire et les facteurs
 * de fatigue liés à l'élévation à partir de la dérive de performance.
 */
function calibrateFatigueModel(
  metrics: SessionMetrics[],
  sessions: TrainingSession[],
): {
  enduranceScore: number
  hourlyDecayFactor: number
  fatigueThresholdKm: number
  elevationFatigueFactorPer1000m: number
  downhillFatigueFactorPer1000m: number
} {
  // Séances longues (> 1h)
  const longSessions = sessions.filter((s) => s.duration > 3600)
  const drifts = metrics.map((m) => m.performanceDrift).filter((d) => d > 0.5 && d < 1.5)

  const avgDrift = drifts.length > 0 ? mean(drifts) : 1

  // Score d'endurance : 1 = pas de dérive, 0 = forte dérive
  // Note : suppression du facteur ×0.9 systématique qui pénalisait les bons coureurs
  const enduranceScore = Math.min(1, Math.max(0.1, avgDrift))

  // Facteur de fatigue horaire calibré sur la dérive
  const hourlyDecay = drifts.length > 0 ? (1 - avgDrift) / 2 : 0.015
  const hourlyDecayFactor = Math.max(0.005, Math.min(0.1, hourlyDecay))

  // Seuil de fatigue tardive : distance médiane des longues séances
  const longDistances = longSessions.map((s) => s.distance / 1000)
  const fatigueThresholdKm =
    longDistances.length > 0
      ? Math.round(median(longDistances) * 0.6)
      : DEFAULT_RUNNER_PROFILE.fatigueModel.fatigueThresholdKm

  // ── Facteur de fatigue par élévation
  // Principe : séances avec plus de D+/km tendent à produire plus de dérive,
  // au-delà de ce qu'explique le temps seul.
  // On mesure (1 - drift) / elevPer1000m sur les séances avec D+ significatif.
  const elevPairs = sessions
    .map((s) => {
      const m = metrics.find((mm) => mm.sessionId === s.id)
      if (!m || m.performanceDrift <= 0 || s.elevationGain < 300 || s.distance < 8000) return null
      const elevPer1000m = s.elevationGain / 1000
      // Dérive résiduelle après soustraction de la part temporelle estimée
      const hoursElapsed = s.duration / 3600
      const temporalDrift = hoursElapsed * hourlyDecayFactor
      const residualDrift = Math.max(0, (1 - m.performanceDrift) - temporalDrift)
      return { elevPer1000m, residualDrift }
    })
    .filter((p): p is { elevPer1000m: number; residualDrift: number } => p !== null)

  let elevationFatigueFactorPer1000m = DEFAULT_RUNNER_PROFILE.fatigueModel.elevationFatigueFactorPer1000m
  if (elevPairs.length >= 3) {
    const factors = elevPairs
      .map((p) => (p.elevPer1000m > 0 ? p.residualDrift / p.elevPer1000m : null))
      .filter((f): f is number => f !== null && f >= 0 && f < 0.05)
    if (factors.length >= 3) {
      elevationFatigueFactorPer1000m = Math.max(0.002, Math.min(0.025, median(factors)))
    }
  }

  // Facteur descente : défaut à 1.5× le facteur montée (dommages quad > charge cardio)
  const downhillFatigueFactorPer1000m = Math.min(0.03, elevationFatigueFactorPer1000m * 1.5)

  return {
    enduranceScore,
    hourlyDecayFactor,
    fatigueThresholdKm,
    elevationFatigueFactorPer1000m,
    downhillFatigueFactorPer1000m,
  }
}

// ─── Calibration vitesse de marche ───────────────────────────────────────────

/**
 * Extrait la vitesse de marche réelle depuis les séances avec streams.
 * Prend la médiane des vitesses mesurées sur les segments raides.
 */
function calibrateWalkingSpeed(allMetrics: SessionMetrics[]): number | null {
  const walkingSpeeds = allMetrics
    .map((m) => m.walkingSpeedMs)
    .filter((v): v is number => v !== undefined && v > 0.4 && v < 2.2)
  return walkingSpeeds.length >= 3 ? median(walkingSpeeds) : null
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

  // ── 0. Priorité Garmin > Strava
  // Les données Garmin (FIT files) sont plus complètes que Strava (streams API limités).
  // Si l'utilisateur a des sessions Garmin, on exclut les sessions Strava de la calibration.
  const hasGarminSessions = history.some(s => s.source === 'garmin')
  const calibrationHistory = hasGarminSessions
    ? history.filter(s => s.source !== 'strava')
    : history

  // ── 1. Extraction des métriques
  const metrics = calibrationHistory
    .map(extractSessionMetrics)
    .filter((m): m is SessionMetrics => m !== null)

  // ── 2. Vitesse de base sur plat (médiane des séances avec streams, sinon allure globale)
  const flatSpeeds = metrics
    .map((m) => m.flatAvgSpeedMs)
    .filter((v) => v > 0.5 && v < 8)

  // Allure globale brute depuis les séances (s/km → m/s)
  const globalPaces = calibrationHistory
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
      calibrationHistory
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
  const allHrGradeSamples = metrics.flatMap((m) => m.hrGradeSamples)
  const hrCalibration = calibrateHeartRateModel(allHrSamples, allHrGradeSamples, metrics, calibrationHistory)

  // ── 5. Calibration fatigue
  const fatigueCalibration = calibrateFatigueModel(metrics, calibrationHistory)

  // ── 6. Vitesse de marche réelle
  const calibratedWalkingSpeed = calibrateWalkingSpeed(metrics)

  // ── 7. Assemblage du profil calibré
  const calibrationSource: CalibrationSource = hasGarminSessions
    ? 'garmin'
    : calibrationHistory.some(s => s.source === 'strava')
      ? 'strava'
      : 'mixed'

  return {
    ...baseProfile,
    calibratedAt: new Date(),
    sessionCount: calibrationHistory.length,
    calibrationSource,
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
      // Vitesse de marche réelle mesurée (si données suffisantes)
      ...(calibratedWalkingSpeed !== null && {
        walkingSpeed: calibratedWalkingSpeed,
      }),
    },

    heartRateModel: {
      ...baseProfile.heartRateModel,
      ...(hrCalibration.baseHR && { baseHR: hrCalibration.baseHR }),
      ...(hrCalibration.maxHR && { maxHR: hrCalibration.maxHR }),
      ...(hrCalibration.gradeHRFactor !== undefined && { gradeHRFactor: hrCalibration.gradeHRFactor }),
      ...(hrCalibration.cardiacDriftBpmPerHour !== undefined && { cardiacDriftBpmPerHour: hrCalibration.cardiacDriftBpmPerHour }),
      ...(hrCalibration.lactateThresholdHR !== undefined && { lactateThresholdHR: hrCalibration.lactateThresholdHR }),
    },

    fatigueModel: {
      ...baseProfile.fatigueModel,
      hourlyDecayFactor: fatigueCalibration.hourlyDecayFactor,
      fatigueThresholdKm: fatigueCalibration.fatigueThresholdKm,
      elevationFatigueFactorPer1000m: fatigueCalibration.elevationFatigueFactorPer1000m,
      downhillFatigueFactorPer1000m: fatigueCalibration.downhillFatigueFactorPer1000m,
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
