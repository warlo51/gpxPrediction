/**
 * Moteur de simulation de course
 * Calcule pour chaque segment : durée, allure (plage), FC (plage), fatigue, calories
 */

import type {
  GpxTrack,
  RunnerProfile,
  SimulationResult,
  SegmentSimulation,
  SimulationParams,
  ValueRange,
  RacingStrategy,
  StrategyId,
} from '@/types'
import { RACING_STRATEGIES } from '@/models/strategies'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp une valeur entre min et max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Construit une ValueRange autour d'une valeur cible avec une marge */
function toRange(target: number, marginPercent: number): ValueRange {
  const margin = target * (marginPercent / 100)
  return { min: target - margin, max: target + margin, target }
}

// ─── Calcul vitesse sur un segment ───────────────────────────────────────────

/**
 * Calcule la vitesse de base (m/s) en fonction de la pente et du profil.
 *
 * Modèle corrigé basé sur la formule de Minetti (2002) simplifiée :
 * - Montée : vitesse * exp(-decayFactor * grade)   → plus réaliste qu'une réduction linéaire
 * - Descente : vitesse * (1 + boostFactor * |grade|), plafonné à 1.25x
 *
 * Valeurs réelles observées chez des traileurs :
 *   pente 5%  → ~85% de la vitesse sur plat
 *   pente 10% → ~65% de la vitesse sur plat
 *   pente 20% → ~40% (souvent marche)
 */
function computeBaseSpeed(
  grade: number,
  profile: RunnerProfile,
  effortFactor: number,
): number {
  const { flatSpeed, uphillDecayFactor, downhillBoostFactor, walkingThresholdGrade, walkingSpeed } =
    profile.speedModel

  const baseSpeed = flatSpeed * effortFactor

  // Marche si pente trop raide
  if (grade >= walkingThresholdGrade) return walkingSpeed

  if (grade > 0) {
    // Montée : modèle exponentiel — bien plus réaliste que linéaire
    // uphillDecayFactor ~0.045 → pente 10% donne exp(-0.045*10) = 0.64 ✓
    const speedReduced = baseSpeed * Math.exp(-uphillDecayFactor * grade)
    return Math.max(walkingSpeed, speedReduced)
  } else {
    // Descente légère : petit boost, plafonné à 1.25x
    const boost = downhillBoostFactor * Math.abs(grade)
    return Math.min(baseSpeed * 1.25, baseSpeed * (1 + boost))
  }
}

// ─── Calcul fatigue ───────────────────────────────────────────────────────────

/**
 * Facteur de fatigue cumulé (0 = aucune, 1 = épuisement total).
 *
 * Trois composantes :
 * 1. Temporelle : décroissance horaire (cardiovasculaire/glycogène)
 * 2. D+ cumulé : surcharge musculaire montée (elevationFatigueFactorPer1000m)
 * 3. D- cumulé : dommages quad descente (downhillFatigueFactorPer1000m)
 *
 * En descente, la fatigue temporelle est partiellement récupérée
 * (downhillRecoveryFactor réduit le hourlyDecay effectif).
 */
function computeFatigueFactor(
  elapsedHours: number,
  cumulativeDistanceKm: number,
  cumulativeElevGainM: number,
  cumulativeElevLossM: number,
  profile: RunnerProfile,
  applyFatigue: boolean,
  isDownhill: boolean,
): number {
  if (!applyFatigue) return 0

  const {
    hourlyDecayFactor,
    downhillRecoveryFactor,
    fatigueThresholdKm,
    lateFatigueMultiplier,
    elevationFatigueFactorPer1000m,
    downhillFatigueFactorPer1000m,
  } = profile.fatigueModel

  // Composante temporelle — réduite en descente (récupération cardiovasculaire)
  const effectiveHourlyDecay = isDownhill
    ? hourlyDecayFactor * (1 - downhillRecoveryFactor * 0.4)
    : hourlyDecayFactor
  let fatigue = elapsedHours * effectiveHourlyDecay

  // Fatigue accrue au-delà du seuil kilométrique
  if (cumulativeDistanceKm > fatigueThresholdKm) {
    const extraKm = cumulativeDistanceKm - fatigueThresholdKm
    const extraHours = extraKm / (profile.speedModel.flatSpeed * 3.6) // estimation
    fatigue += extraHours * hourlyDecayFactor * (lateFatigueMultiplier - 1)
  }

  // Composante élévation — charge musculaire montée
  fatigue += (cumulativeElevGainM / 1000) * elevationFatigueFactorPer1000m

  // Composante descente — dommages quad
  fatigue += (cumulativeElevLossM / 1000) * downhillFatigueFactorPer1000m

  return clamp(fatigue, 0, 0.5) // max 50% de perte de perf
}

// ─── Calcul FC ────────────────────────────────────────────────────────────────

/**
 * Estime la FC cible sur un segment.
 * Basée sur la FC de base + ajustement pente + dérive cardiaque.
 */
function computeHeartRate(
  grade: number,
  elapsedHours: number,
  effortFactor: number,
  profile: RunnerProfile,
  applyDrift: boolean,
): number {
  const { maxHR, restingHR, gradeHRFactor, cardiacDriftBpmPerHour } =
    profile.heartRateModel

  // FC de réserve modulée par l'effort
  const hrReserve = maxHR - restingHR
  const baseEffortHR = restingHR + hrReserve * (effortFactor * 0.75)

  // Ajustement pente
  const gradeAdjust = Math.max(0, grade) * gradeHRFactor

  // Dérive cardiaque
  const drift = applyDrift ? elapsedHours * cardiacDriftBpmPerHour : 0

  const hr = baseEffortHR + gradeAdjust + drift
  return clamp(hr, restingHR, maxHR)
}

// ─── Calcul calories ─────────────────────────────────────────────────────────

/**
 * Estime les calories dépensées sur un segment.
 */
function computeCalories(
  distanceM: number,
  elevationGainM: number,
  profile: RunnerProfile,
): number {
  const { weightKg, flatCaloriesPerKm, uphillCaloriesPer100m } = profile.energyModel
  const weightFactor = weightKg / 70 // normalisé sur 70 kg
  const flatCal = (distanceM / 1000) * flatCaloriesPerKm * weightFactor
  const uphillCal = (elevationGainM / 100) * uphillCaloriesPer100m * weightFactor
  return flatCal + uphillCal
}

// ─── Facteur d'effort par phase ───────────────────────────────────────────────

/**
 * Retourne le facteur d'effort selon la progression sur le parcours (0–1)
 * et la courbe d'effort de la stratégie.
 *
 * Les effortCurve représentent des variations relatives à l'effort global :
 *   1.0 = effort nominal, 0.9 = 90% de l'effort nominal, 1.05 = légère sur-allure
 * Le baseEffortFactor (slider UI) est le seul levier de scaling global.
 */
function getPhaseEffortFactor(
  progress: number, // 0 à 1
  strategy: RacingStrategy,
  baseEffortFactor: number,
): number {
  const [start, mid, end] = strategy.effortCurve
  let phaseFactor: number

  if (progress < 0.33) {
    phaseFactor = start!
  } else if (progress < 0.66) {
    phaseFactor = mid!
  } else {
    phaseFactor = end!
  }

  // baseEffortFactor est appliqué directement, phaseFactor module autour de 1.0
  // Exemple : baseEffortFactor=0.95, phaseFactor=1.05 → 0.9975
  return baseEffortFactor * phaseFactor
}

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Simule la performance sur l'ensemble du parcours.
 *
 * @returns SimulationResult avec tous les détails par segment
 */
export function runSimulation(
  track: GpxTrack,
  profile: RunnerProfile,
  params: SimulationParams,
): SimulationResult {
  const strategy = RACING_STRATEGIES[params.strategyId as StrategyId]
  if (!strategy) throw new Error(`Stratégie inconnue : ${params.strategyId}`)

  let cumulativeTime = 0   // secondes
  let cumulativeCalories = 0
  let cumulativeElevGain = 0  // D+ cumulé en mètres
  let cumulativeElevLoss = 0  // D- cumulé en mètres

  const segmentResults: SegmentSimulation[] = track.segments.map((seg) => {
    const progress = seg.cumulativeDistance / track.totalDistance
    const elapsedHours = cumulativeTime / 3600
    const cumulativeKm = seg.cumulativeDistance / 1000
    const isDownhill = seg.avgGrade < -3

    // ── Facteur d'effort de la phase
    let effortFactor = getPhaseEffortFactor(progress, strategy, params.effortFactor)

    // ── Ajustement montée/descente selon la stratégie
    // uphillAggressiveness : 0 = marche prudente, 1 = pousse fort en montée
    // downhillRecovery : 1 = récupère (lent en descente), 0 = exploite la descente
    // Ces ajustements sont FAIBLES (±5%) car computeBaseSpeed gère déjà la physique de la pente
    if (seg.avgGrade > 5) {
      // Montée : agressivité module légèrement l'effort (+5% si agressif, -3% si conservateur)
      const uphillBonus = (strategy.uphillAggressiveness - 0.5) * 0.10
      effortFactor = clamp(effortFactor * (1 + uphillBonus), 0.7, 1.1)
    } else if (seg.avgGrade < -5) {
      // Descente : récupération réduit légèrement l'effort (économise de l'énergie)
      const downhillPenalty = strategy.downhillRecovery * 0.05
      effortFactor = clamp(effortFactor * (1 - downhillPenalty), 0.8, 1.1)
    }

    effortFactor = clamp(effortFactor, 0.6, 1.1)

    // ── Fatigue (inclut D+ et D- cumulés)
    const fatigueFactor = computeFatigueFactor(
      elapsedHours,
      cumulativeKm,
      cumulativeElevGain,
      cumulativeElevLoss,
      profile,
      params.applyFatigue,
      isDownhill,
    )

    // ── Vitesse effective (après fatigue)
    const isWalking = seg.avgGrade >= profile.speedModel.walkingThresholdGrade
    const baseSpeed = computeBaseSpeed(seg.avgGrade, profile, effortFactor)
    const effectiveSpeed = baseSpeed * (1 - fatigueFactor)

    // ── Durée du segment
    const duration = seg.distance / Math.max(effectiveSpeed, 0.1)

    // ── Allure (s/km)
    const paceSecPerKm = 1000 / effectiveSpeed
    const paceRange = toRange(paceSecPerKm, 8) // ±8%

    // ── FC
    const hr = computeHeartRate(
      seg.avgGrade,
      elapsedHours,
      effortFactor,
      profile,
      params.applyCardiacDrift,
    )
    const heartRateRange = toRange(hr, 5) // ±5%

    // ── Calories
    const calories = computeCalories(seg.distance, seg.elevationGain, profile)
    cumulativeCalories += calories
    cumulativeTime += duration
    cumulativeElevGain += seg.elevationGain
    cumulativeElevLoss += seg.elevationLoss

    return {
      segment: seg,
      estimatedDuration: duration,
      paceRange,
      heartRateRange,
      fatigueFactor,
      caloriesBurned: calories,
      cumulativeTime,
      cumulativeCalories,
      isWalking,
    }
  })

  return {
    totalDuration: cumulativeTime,
    totalCalories: cumulativeCalories,
    segments: segmentResults,
    strategyId: params.strategyId,
    generatedAt: new Date(),
  }
}

// ─── Helpers d'affichage ──────────────────────────────────────────────────────

/** Convertit des secondes en format hh:mm:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`
  return `${m}'${String(s).padStart(2, '0')}"`
}

/** Convertit un allure en s/km vers format mm:ss */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.floor(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}
