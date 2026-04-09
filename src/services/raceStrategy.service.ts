/**
 * Service de génération du plan de course
 * Produit un RaceStrategyReport complet (Prudente / Objectif / Ambitieuse)
 * à partir d'un GpxTrack + RunnerProfile, sans appel API externe.
 */

import type { GpxTrack, RunnerProfile, SegmentSimulation, GarminRacePredictions, EnvironmentConditions } from '@/types'
import type {
  RaceStrategyReport,
  StrategyPlan,
  RacePhase,
  LectureBullet,
  RiskZone,
  NutritionVerdict,
  FeasibilityVerdict,
  CheckpointVerdict,
  RaceCheckpoint,
  RaceStrategyId,
  StrategyRecommendation,
  GarminCurveAnchor,
} from '@/types/raceStrategy.types'
import { runSimulation, formatDuration, formatPace } from './simulationEngine.service'
import { predictFromGarminCurve } from './racePredictor.service'

// ─── Configs des 3 stratégies ──────────────────────────────────────────────────

const STRATEGY_CONFIGS: Array<{
  id: RaceStrategyId
  name: string
  emoji: string
  strategyId: string
  effortFactor: number
  blowupRisk: 'Faible' | 'Modéré' | 'Élevé'
}> = [
  { id: 'prudente',   name: 'Prudente',   emoji: '🟢', strategyId: 'conservative', effortFactor: 1.0,  blowupRisk: 'Faible' },
  { id: 'objectif',   name: 'Objectif',   emoji: '🟡', strategyId: 'performance',  effortFactor: 1.0,  blowupRisk: 'Modéré' },
  { id: 'ambitieuse', name: 'Ambitieuse', emoji: '🔴', strategyId: 'performance',  effortFactor: 1.07, blowupRisk: 'Élevé' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function classifyTerrain(avgGrade: number): string {
  const abs = Math.abs(avgGrade)
  if (avgGrade >= 0) {
    if (abs < 2)  return 'Plat'
    if (abs < 5)  return 'Montée douce'
    if (abs < 8)  return 'Montée franche'
    if (abs < 12) return 'Montée raide'
    return 'Marche forcée'
  } else {
    if (abs < 2)  return 'Plat'
    if (abs < 5)  return 'Descente douce'
    if (abs < 8)  return 'Descente franche'
    return 'Descente technique'
  }
}

function rpeFromHRRatio(hr: number, maxHR: number): string {
  const ratio = hr / maxHR
  if (ratio < 0.65) return 'Facile (RPE 3)'
  if (ratio < 0.75) return 'Modéré (RPE 5)'
  if (ratio < 0.82) return 'Soutenu (RPE 7)'
  if (ratio < 0.88) return 'Difficile (RPE 8)'
  if (ratio < 0.93) return 'Très difficile (RPE 9)'
  return 'Maximal (RPE 10)'
}

// ─── Regroupement en phases ────────────────────────────────────────────────────

/**
 * Regroupe les micro-segments en 5–7 phases cohérentes.
 * Stratégie : fusion des segments consécutifs de même type de terrain,
 * puis fusion des plus petits groupes jusqu'à atteindre targetCount.
 */
function groupSegmentsIntoPhases(
  simSegments: SegmentSimulation[],
  targetCount = 6,
): SegmentSimulation[][] {
  if (simSegments.length === 0) return []

  // Étape 1 : grouper les segments consécutifs de même type
  const groups: SegmentSimulation[][] = []
  let current: SegmentSimulation[] = [simSegments[0]!]

  for (let i = 1; i < simSegments.length; i++) {
    const seg = simSegments[i]!
    if (seg.segment.type === current[current.length - 1]!.segment.type) {
      current.push(seg)
    } else {
      groups.push(current)
      current = [seg]
    }
  }
  groups.push(current)

  // Étape 2 : fusionner les groupes les plus courts jusqu'à targetCount
  while (groups.length > targetCount) {
    let minDist = Infinity
    let minIdx = 0
    for (let i = 0; i < groups.length; i++) {
      const dist = groups[i]!.reduce((s, seg) => s + seg.segment.distance, 0)
      if (dist < minDist) { minDist = dist; minIdx = i }
    }
    const mergeWith = minIdx > 0 ? minIdx - 1 : minIdx + 1
    const lo = Math.min(minIdx, mergeWith)
    const hi = Math.max(minIdx, mergeWith)
    groups[lo] = [...groups[lo]!, ...groups[hi]!]
    groups.splice(hi, 1)
  }

  return groups
}

function buildPhase(index: number, segs: SegmentSimulation[], maxHR: number): RacePhase {
  const totalDist    = segs.reduce((s, seg) => s + seg.segment.distance, 0)
  const elevGain     = segs.reduce((s, seg) => s + seg.segment.elevationGain, 0)
  const elevLoss     = segs.reduce((s, seg) => s + seg.segment.elevationLoss, 0)
  const avgGrade     = totalDist > 0
    ? segs.reduce((s, seg) => s + seg.segment.avgGrade * seg.segment.distance, 0) / totalDist
    : 0
  const totalDuration = segs.reduce((s, seg) => s + seg.estimatedDuration, 0)
  const avgPaceSec   = totalDist > 0 ? (totalDuration / totalDist) * 1000 : 360
  const avgHR        = Math.round(
    segs.reduce((s, seg) => s + seg.heartRateRange.target, 0) / segs.length
  )

  const startKm = (segs[0]!.segment.cumulativeDistance - segs[0]!.segment.distance) / 1000
  const endKm   = segs[segs.length - 1]!.segment.cumulativeDistance / 1000

  const hrRatio  = avgHR / maxHR
  const walkingRatio = segs.filter(s => s.isWalking).length / segs.length
  let riskLevel: 'élevé' | 'modéré' | 'faible' = 'faible'
  if (hrRatio > 0.92 || walkingRatio > 0.5)      riskLevel = 'élevé'
  else if (hrRatio > 0.87 || walkingRatio > 0.2) riskLevel = 'modéré'

  const terrainLabel = classifyTerrain(avgGrade)
  const label = index === 0 ? `Départ — ${terrainLabel}` : terrainLabel

  return {
    index,
    label,
    startKm:            Math.round(startKm * 10) / 10,
    endKm:              Math.round(endKm * 10) / 10,
    distanceKm:         Math.round((totalDist / 1000) * 10) / 10,
    elevationGain:      Math.round(elevGain),
    elevationLoss:      Math.round(elevLoss),
    avgGrade:           Math.round(avgGrade * 10) / 10,
    terrainLabel,
    targetPaceFormatted: formatPace(avgPaceSec),
    avgHR,
    rpe:                rpeFromHRRatio(avgHR, maxHR),
    cumulativeTimeFormatted: formatDuration(segs[segs.length - 1]!.cumulativeTime),
    riskLevel,
  }
}

// ─── Zones à risque ────────────────────────────────────────────────────────────

/**
 * Hiérarchie des causes (de la plus sévère à la moins sévère).
 * Lorsqu'une zone agrège plusieurs segments, on retient la cause la plus haute.
 */
const CAUSE_PRIORITY: Record<RiskZone['cause'], number> = {
  'fc-elevee':   3,
  'fc-soutenue': 2,
  'marche':      1,
}

function detectRiskZones(simSegments: SegmentSimulation[], maxHR: number): RiskZone[] {
  const zones: RiskZone[] = []
  let zoneStart: number | null = null
  let zoneHRs: number[] = []
  let zoneCause: RiskZone['cause'] | null = null

  const flush = (endKm: number) => {
    if (zoneStart === null || zoneHRs.length === 0 || zoneCause === null) return
    const avgHR = Math.round(zoneHRs.reduce((a, b) => a + b, 0) / zoneHRs.length)
    const level: RiskZone['level'] = zoneCause === 'fc-elevee' ? 'élevé' : 'modéré'
    zones.push({
      label: `Km ${zoneStart.toFixed(1)}–${endKm.toFixed(1)} — FC ~${avgHR} bpm`,
      startKm: zoneStart,
      endKm,
      level,
      cause: zoneCause,
      avgHR,
    })
    zoneStart = null
    zoneHRs = []
    zoneCause = null
  }

  for (const sim of simSegments) {
    const hr      = sim.heartRateRange.target
    const startKm = (sim.segment.cumulativeDistance - sim.segment.distance) / 1000

    let cause: RiskZone['cause'] | null = null
    if (hr > maxHR * 0.92)      cause = 'fc-elevee'
    else if (hr > maxHR * 0.87) cause = 'fc-soutenue'
    else if (sim.isWalking)     cause = 'marche'

    if (cause) {
      if (zoneStart === null) {
        zoneStart = startKm
        zoneCause = cause
      } else if (CAUSE_PRIORITY[cause] > CAUSE_PRIORITY[zoneCause!]) {
        // Élève la cause de la zone si on rencontre un segment plus sévère
        zoneCause = cause
      }
      zoneHRs.push(hr)
    } else {
      flush(startKm)
    }
  }

  const lastSeg = simSegments[simSegments.length - 1]
  if (lastSeg) flush(lastSeg.segment.cumulativeDistance / 1000)

  return zones
}

// ─── Barrière horaire ──────────────────────────────────────────────────────────

/**
 * Formate une marge en secondes au format compact `+1h05` / `−25 min` / `+12 min`.
 * Exporté pour réutilisation côté UI.
 */
export function formatMargin(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '−'
  const abs  = Math.abs(seconds)
  const h    = Math.floor(abs / 3600)
  const m    = Math.round((abs % 3600) / 60)
  if (h > 0) return `${sign}${h}h${String(m).padStart(2, '0')}`
  return `${sign}${m} min`
}

/**
 * Niveau de confort d'une marge :
 *  - `safe`  : marge > 15 min (confortable)
 *  - `tight` : passe mais marge ≤ 15 min (à surveiller)
 *  - `fail`  : hors-délai
 */
function marginLevel(marginSeconds: number): CheckpointVerdict['level'] {
  if (marginSeconds < 0)    return 'fail'
  if (marginSeconds <= 900) return 'tight'
  return 'safe'
}

/**
 * Interpole le temps cumulé prédit pour une distance donnée (en km), en se
 * basant sur les segments de la simulation. Linéaire à l'intérieur d'un segment.
 */
function predictTimeAtKm(segments: SegmentSimulation[], km: number): number {
  if (segments.length === 0) return 0
  const targetM = km * 1000
  if (targetM <= 0) return 0

  const lastSeg = segments[segments.length - 1]!
  if (targetM >= lastSeg.segment.cumulativeDistance) return lastSeg.cumulativeTime

  for (const seg of segments) {
    const segEndM   = seg.segment.cumulativeDistance
    const segStartM = segEndM - seg.segment.distance
    if (targetM >= segStartM && targetM <= segEndM) {
      const fraction      = seg.segment.distance > 0 ? (targetM - segStartM) / seg.segment.distance : 0
      const segStartTime  = seg.cumulativeTime - seg.estimatedDuration
      return segStartTime + fraction * seg.estimatedDuration
    }
  }
  return lastSeg.cumulativeTime
}

/**
 * Verdict de faisabilité d'une stratégie face à un set de barrières horaires.
 * Pour chaque checkpoint, on interpole le temps prédit et on calcule la marge.
 * Le verdict global = celui du checkpoint avec la plus petite marge (worst).
 */
function computeFeasibility(
  segments: SegmentSimulation[],
  totalTimeSeconds: number,
  cutoffs: RaceCheckpoint[],
): FeasibilityVerdict | null {
  if (cutoffs.length === 0) return null

  const totalKm = segments.length > 0
    ? segments[segments.length - 1]!.segment.cumulativeDistance / 1000
    : 0

  const checkpoints: CheckpointVerdict[] = cutoffs
    .map((cp): CheckpointVerdict => {
      // km >= totalKm → utilise le temps total simulé (évite l'extrapolation)
      const predicted     = cp.km >= totalKm ? totalTimeSeconds : predictTimeAtKm(segments, cp.km)
      const marginSeconds = cp.cutoffSeconds - predicted
      return {
        km: cp.km,
        ...(cp.label !== undefined && { label: cp.label }),
        cutoffSeconds: cp.cutoffSeconds,
        predictedSeconds: predicted,
        marginSeconds,
        level: marginLevel(marginSeconds),
      }
    })
    .sort((a, b) => a.km - b.km)

  const worst = checkpoints.reduce((w, c) => (c.marginSeconds < w.marginSeconds ? c : w), checkpoints[0]!)

  return {
    checkpoints,
    worst,
    passes: checkpoints.every(c => c.marginSeconds >= 0),
    marginSeconds: worst.marginSeconds,
    level: worst.level,
  }
}

// ─── Nutrition ─────────────────────────────────────────────────────────────────

/**
 * Fraction des calories brûlées qui provient du glycogène (vs lipides),
 * estimée à partir de l'intensité relative (% FCmax).
 *
 * Référence : à intensité faible (~50% FCmax) la part lipidique domine (~70%
 * lipides, 30% CHO). Au-delà du seuil lactique, les glucides deviennent
 * majoritaires et atteignent ~95% à intensité maximale.
 *
 * Approximation linéaire entre 50% et 95% FCmax, bornée [0.30, 0.95].
 */
function carbFractionFromIntensity(hrFraction: number): number {
  return Math.max(0.3, Math.min(0.95, 0.3 + (hrFraction - 0.5) * 1.5))
}

/**
 * Verdict nutritionnel basé sur un bilan de glycogène segment par segment :
 *
 *   réserve_initiale = poids × 18 kcal/kg  (glycogène mobilisable)
 *   pour chaque segment :
 *     CHO_brûlés = calories_segment × fractionCHO(% FCmax)
 *     CHO_apportés = (carbToleranceGPerHour × 4 / 3600) × durée_segment
 *     solde += CHO_apportés − CHO_brûlés
 *
 * Le verdict est déterminé par :
 *  - le km où le solde croise zéro (= fringale prédite), s'il y en a un
 *  - la marge de glycogène restante en fin de course sinon
 */
function computeNutritionVerdict(
  segments: SegmentSimulation[],
  totalTimeSeconds: number,
  carbToleranceGPerHour: number,
  profile: RunnerProfile,
): NutritionVerdict {
  const weightKg = profile.energyModel.weightKg
  const maxHR    = profile.heartRateModel.maxHR

  // Réserve glycogène mobilisable au départ (~18 kcal/kg pour un coureur entraîné)
  const initialGlycogenKcal = weightKg * 18

  // Apport exogène en kcal/seconde (g/h × 4 kcal/g ÷ 3600 s/h)
  const exoKcalPerSec = (carbToleranceGPerHour * 4) / 3600

  let glycogenBalance = initialGlycogenKcal
  let crashKm: number | null = null

  for (const seg of segments) {
    const hrFraction   = seg.heartRateRange.target / maxHR
    const fractionCHO  = carbFractionFromIntensity(hrFraction)

    const segCarbBurnKcal = seg.caloriesBurned * fractionCHO
    const segExoKcal      = exoKcalPerSec * seg.estimatedDuration

    glycogenBalance += segExoKcal - segCarbBurnKcal

    if (glycogenBalance <= 0 && crashKm === null) {
      crashKm = Math.round(seg.segment.cumulativeDistance / 1000)
    }
  }

  const lastSeg          = segments[segments.length - 1]
  const totalKm          = lastSeg ? Math.round(lastSeg.segment.cumulativeDistance / 1000) : 0
  const finalBalance     = Math.round(glycogenBalance)
  const finalDeficitKcal = Math.max(0, -finalBalance)

  // Combien de g/h supplémentaires combleraient exactement le déficit
  const durationHours    = totalTimeSeconds / 3600
  const extraCarbsPerHour = finalDeficitKcal > 0 && durationHours > 0
    ? Math.round(finalDeficitKcal / (4 * durationHours))
    : 0

  const recommendedCarbsPerHour = carbToleranceGPerHour + extraCarbsPerHour

  // ── Pas de crash : verdict selon la marge restante ──
  if (crashKm === null) {
    if (finalBalance > 200) {
      return {
        icon: '✅', status: 'Suffisant', deficitKcal: 0,
        extraCarbsPerHour: 0,
        recommendedCarbsPerHour: carbToleranceGPerHour,
        message: `Réserves glycogène OK — marge ~${finalBalance} kcal en fin de course`,
      }
    }
    return {
      icon: '⚠️', status: 'Limite', deficitKcal: 0,
      extraCarbsPerHour: 0,
      recommendedCarbsPerHour: carbToleranceGPerHour,
      message: `Marge glycogène serrée ~${finalBalance} kcal — peu de tolérance si l'effort dépasse ce qui est planifié`,
    }
  }

  // ── Crash en toute fin de course : limite mais finissable ──
  if (totalKm > 0 && crashKm / totalKm > 0.9) {
    return {
      icon: '⚠️', status: 'Limite', deficitKcal: finalDeficitKcal,
      extraCarbsPerHour,
      recommendedCarbsPerHour,
      message: `Réserves limites en fin de course (épuisement vers km ${crashKm}/${totalKm}) — viser ~${extraCarbsPerHour} g/h en plus suffirait`,
    }
  }

  // ── Crash significativement avant l'arrivée : insuffisant ──
  return {
    icon: '❌', status: 'Insuffisant', deficitKcal: finalDeficitKcal,
    extraCarbsPerHour,
    recommendedCarbsPerHour,
    message: `Fringale prédite vers km ${crashKm}/${totalKm} — il faudrait absorber ~${extraCarbsPerHour} g/h en plus, ou réduire l'intensité`,
  }
}

// ─── Lecture du parcours ────────────────────────────────────────────────────────

function generateLecture(
  track: GpxTrack,
  objectifSim: SegmentSimulation[],
  ambitieuseSim: SegmentSimulation[],
  profile: RunnerProfile,
): LectureBullet[] {
  const bullets: LectureBullet[] = []
  const maxHR              = profile.heartRateModel.maxHR
  const fatigueThresholdKm = profile.fatigueModel.fatigueThresholdKm
  const totalKm            = track.totalDistance / 1000

  // 1. Départ
  const startHR = Math.round(objectifSim[0]?.heartRateRange.target ?? 0)
  bullets.push({
    kmRange:   `Km 0–${Math.min(3, totalKm * 0.15).toFixed(1)}`,
    content:   `Départ — tendance naturelle à partir trop vite. Rester sous ${Math.round(startHR * 0.95)} bpm les premiers kilomètres`,
    isWarning: false,
  })

  // 2. Montées raides significatives (max 2)
  let i = 0
  let steepCount = 0
  while (i < objectifSim.length && steepCount < 2) {
    const seg = objectifSim[i]!
    if (seg.segment.type === 'steep_uphill') {
      const groupStart = i
      while (i < objectifSim.length && objectifSim[i]!.segment.type === 'steep_uphill') i++
      const group   = objectifSim.slice(groupStart, i)
      const dist    = group.reduce((s, g) => s + g.segment.distance, 0)
      if (dist > 200) {
        const startKm  = (group[0]!.segment.cumulativeDistance - group[0]!.segment.distance) / 1000
        const endKm    = group[group.length - 1]!.segment.cumulativeDistance / 1000
        const avgGrade = group.reduce((s, g) => s + g.segment.avgGrade, 0) / group.length
        const avgHR    = Math.round(group.reduce((s, g) => s + g.heartRateRange.target, 0) / group.length)
        const walking  = group.some(g => g.isWalking)
        bullets.push({
          kmRange:   `Km ${startKm.toFixed(1)}–${endKm.toFixed(1)}`,
          content:   `Montée raide ~${avgGrade.toFixed(0)}%${walking ? ' — marche active (plus économique que trottiner)' : ''} — FC attendue ~${avgHR} bpm`,
          isWarning: avgHR > maxHR * 0.87,
        })
        steepCount++
      }
    } else {
      i++
    }
  }

  // 3. Seuil de fatigue
  if (fatigueThresholdKm > 2 && fatigueThresholdKm < totalKm) {
    const thresholdSeg = objectifSim.find(
      s => s.segment.cumulativeDistance / 1000 >= fatigueThresholdKm
    )
    const hrAtThreshold = thresholdSeg ? Math.round(thresholdSeg.heartRateRange.target) : undefined
    bullets.push({
      kmRange:   `Km ${fatigueThresholdKm}`,
      content:   `Seuil de fatigue — dérive de performance accélérée${hrAtThreshold ? ` (FC ~${hrAtThreshold} bpm)` : ''}. La gestion de l'effort devient décisive ici`,
      isWarning: true,
    })
  }

  // 4. Descente technique (max 1)
  let j = 0
  while (j < objectifSim.length) {
    const seg = objectifSim[j]!
    if (seg.segment.type === 'steep_downhill') {
      const groupStart = j
      while (j < objectifSim.length && objectifSim[j]!.segment.type === 'steep_downhill') j++
      const group = objectifSim.slice(groupStart, j)
      const dist  = group.reduce((s, g) => s + g.segment.distance, 0)
      if (dist > 300) {
        const startKm = (group[0]!.segment.cumulativeDistance - group[0]!.segment.distance) / 1000
        const endKm   = group[group.length - 1]!.segment.cumulativeDistance / 1000
        bullets.push({
          kmRange:   `Km ${startKm.toFixed(1)}–${endKm.toFixed(1)}`,
          content:   `Descente technique — récupération cardiovasculaire possible, mais préserver les quadriceps pour la suite du parcours`,
          isWarning: false,
        })
        break
      }
    } else {
      j++
    }
  }

  // 5. Risque explosion (stratégie Ambitieuse)
  const firstHighRisk = ambitieuseSim.find(s => s.heartRateRange.target > maxHR * 0.91)
  if (firstHighRisk) {
    const riskKm = firstHighRisk.segment.cumulativeDistance / 1000
    const riskHR = Math.round(firstHighRisk.heartRateRange.target)
    bullets.push({
      kmRange:   `À partir de km ${riskKm.toFixed(1)}`,
      content:   `Stratégie Ambitieuse : FC ~${riskHR} bpm (${Math.round(riskHR / maxHR * 100)}% FCmax) — risque d'explosion si le rythme est maintenu`,
      isWarning: true,
    })
  }

  return bullets.slice(0, 8)
}

// ─── Recommandation ───────────────────────────────────────────────────────────

/**
 * Construit un suffixe d'avertissement nutritionnel quand on est forcé de pousser
 * sur une stratégie qui creuse un déficit glucidique.
 *
 * Exemple de retour : ` Attention : à cette intensité prévoir ~75 g/h au lieu de 60.`
 * Retourne une chaîne vide si la nutrition est désactivée ou suffisante.
 */
function nutritionWarningFor(plan: StrategyPlan): string {
  const n = plan.nutrition
  if (!n) return ''
  if (n.icon === '✅') return ''
  return ` ⚠️ À cette intensité, prévoir ~${n.recommendedCarbsPerHour} g/h pour éviter la fringale.`
}

function computeRecommendation(
  track: GpxTrack,
  profile: RunnerProfile,
  plans: StrategyPlan[],
  cutoffs: RaceCheckpoint[] | null,
): StrategyRecommendation {
  const totalKm      = track.totalDistance / 1000
  const dPlus        = track.totalElevationGain
  const endurance    = profile.enduranceScore
  const ratioD       = dPlus / totalKm // m D+ par km

  const prudente   = plans.find(p => p.id === 'prudente')!
  const objectif   = plans.find(p => p.id === 'objectif')!
  const ambitieuse = plans.find(p => p.id === 'ambitieuse')!

  // ── Branche barrière horaire : si au moins une barrière est renseignée, elle prime
  //    sur les autres règles. On recommande la stratégie la plus prudente qui passe
  //    *tous* les checkpoints avec une marge confortable.
  if (cutoffs !== null && cutoffs.length > 0) {
    const prudentePasses   = prudente.feasibility?.passes ?? false
    const prudenteMargin   = prudente.feasibility?.marginSeconds ?? 0
    const prudenteWorstKm  = prudente.feasibility?.worst.km
    const objectifPasses   = objectif.feasibility?.passes ?? false
    const objectifMargin   = objectif.feasibility?.marginSeconds ?? 0
    const ambitieusePasses = ambitieuse.feasibility?.passes ?? false
    const ambitieuseMargin = ambitieuse.feasibility?.marginSeconds ?? 0

    // Lorsque plusieurs barrières existent, préciser le checkpoint le plus serré
    const checkpointHint = (km: number | undefined): string => {
      if (km === undefined || cutoffs.length <= 1) return ''
      return ` (point critique : km ${km})`
    }

    // Prudente passe confortablement partout (> 15 min de marge sur le worst)
    if (prudentePasses && prudenteMargin > 900) {
      return {
        id: 'prudente',
        reason: `Tu passes toutes les barrières avec au moins ${formatMargin(prudenteMargin)} de marge en Prudente${checkpointHint(prudenteWorstKm)} — pas besoin de pousser, garde la sécurité.`,
      }
    }

    // Prudente trop juste / hors-délai → tenter Objectif (marge > 10 min)
    if (objectifPasses && objectifMargin > 600) {
      const base = prudentePasses
        ? `Prudente est trop tendue sur la barrière la plus serrée${checkpointHint(prudenteWorstKm)} (${formatMargin(prudenteMargin)}) — Objectif te donne ${formatMargin(objectifMargin)} de marge.`
        : `Prudente est hors-délai${checkpointHint(prudenteWorstKm)} (${formatMargin(prudenteMargin)}) — il faut viser Objectif, qui passe avec ${formatMargin(objectifMargin)}.`
      return { id: 'objectif', reason: base + nutritionWarningFor(objectif) }
    }

    // Seule l'Ambitieuse passe → recommandation forcée avec mise en garde
    if (ambitieusePasses) {
      const base = `Les stratégies plus prudentes sont hors-délai ou trop tendues — il faut viser Ambitieuse pour passer toutes les barrières (${formatMargin(ambitieuseMargin)}). Risque d'explosion à surveiller.`
      return { id: 'ambitieuse', reason: base + nutritionWarningFor(ambitieuse) }
    }

    // Aucune stratégie ne respecte les barrières → on pointe la moins pire
    return {
      id: 'ambitieuse',
      reason: `⚠️ Aucune stratégie ne respecte les barrières — même Ambitieuse est hors-délai (${formatMargin(ambitieuseMargin)}). Course non finissable en l'état avec ce profil.`,
    }
  }

  // ── Branche sans barrière : logique d'origine basée sur endurance / nutrition / D+
  // Course ultra/longue (>50 km) ou très montagneux (>60 m D+/km)
  if (totalKm > 50 || ratioD > 60) {
    return {
      id: 'prudente',
      reason: totalKm > 50
        ? `Sur ${Math.round(totalKm)} km, la gestion de l'énergie est critique — une approche prudente maximise les chances de finir fort`
        : `Avec ${Math.round(ratioD)} m de D+/km, le parcours est très exigeant — mieux vaut se préserver pour les montées`,
    }
  }

  // Si faible endurance ou nutrition insuffisante sur objectif
  // (analyse glucidique ignorée si l'utilisateur l'a désactivée — nutrition === null)
  const nutritionInsufficient = objectif.nutrition?.icon === '❌'
  if (endurance < 0.4 || nutritionInsufficient) {
    return {
      id: 'prudente',
      reason: endurance < 0.4
        ? `Ton score d'endurance (${(endurance * 100).toFixed(0)}%) suggère de privilégier la régularité plutôt que la performance`
        : `Le déficit calorique estimé en stratégie Objectif est trop élevé — une approche prudente réduit la dépense et le risque de fringale`,
    }
  }

  // Si bonne endurance et risque modéré sur ambitieuse
  if (endurance > 0.7 && ambitieuse.blowupRisk !== 'Élevé' && ambitieuse.walkingSegments === 0) {
    return {
      id: 'ambitieuse',
      reason: `Ton endurance (${(endurance * 100).toFixed(0)}%) et le profil du parcours permettent de viser l'ambitieuse — le risque d'explosion reste contenu`,
    }
  }

  // Par défaut : objectif
  const prudenteDiff = objectif.totalTimeSeconds - prudente.totalTimeSeconds
  const diffMinutes  = Math.abs(Math.round(prudenteDiff / 60))
  return {
    id: 'objectif',
    reason: `Le meilleur compromis performance/sécurité pour ton profil — ${diffMinutes} min plus rapide que la prudente avec un risque maîtrisé`,
  }
}

// ─── Fonction principale ───────────────────────────────────────────────────────

/**
 * Calcule le profil ajusté pour que la simulation Minetti (stratégie "objectif" neutre)
 * colle au temps prédit par la courbe Garmin + km-effort.
 *
 * L'idée : on garde toute la granularité du modèle Minetti (FC, fatigue, phases…) mais
 * on cale la vitesse de base pour que le temps total reflète les prédictions réelles
 * du Firstbeat (ou Daniels fallback). Les 3 stratégies continuent ensuite de différer
 * via leur courbe d'effort.
 */
function anchorProfileOnGarminCurve(
  track: GpxTrack,
  profile: RunnerProfile,
  garminPredictions: GarminRacePredictions,
): { profile: RunnerProfile; anchor: GarminCurveAnchor } | null {
  // Besoin d'au moins une prédiction Garmin exploitable
  const hasPrediction =
    !!garminPredictions.fiveK ||
    !!garminPredictions.tenK ||
    !!garminPredictions.halfMarathon ||
    !!garminPredictions.marathon
  if (!hasPrediction) return null

  const curvePrediction = predictFromGarminCurve(garminPredictions, track)
  if (curvePrediction.totalTimeSeconds <= 0) return null

  // Baseline Minetti avec stratégie "objectif" neutre (effortFactor 1.0)
  const baseline = runSimulation(track, profile, {
    strategyId: 'performance',
    effortFactor: 1.0,
    applyFatigue: true,
    applyCardiacDrift: true,
  })
  if (baseline.totalDuration <= 0) return null

  // Ratio pour recaler la vitesse : si Minetti prédit plus lent que Garmin,
  // on accélère (scale > 1), sinon on ralentit.
  const flatSpeedScaleFactor = baseline.totalDuration / curvePrediction.totalTimeSeconds

  const adjustedProfile: RunnerProfile = {
    ...profile,
    speedModel: {
      ...profile.speedModel,
      flatSpeed: profile.speedModel.flatSpeed * flatSpeedScaleFactor,
    },
  }

  const anchor: GarminCurveAnchor = {
    totalTimeSeconds: curvePrediction.totalTimeSeconds,
    kmEffortDistanceKm: Math.round(curvePrediction.kmEffortDistanceKm * 10) / 10,
    riegelExponent: Math.round(curvePrediction.riegelExponent * 1000) / 1000,
    confidence: curvePrediction.confidence,
    predictionSource: curvePrediction.predictionSource,
    flatSpeedScaleFactor: Math.round(flatSpeedScaleFactor * 1000) / 1000,
  }

  return { profile: adjustedProfile, anchor }
}

export function generateRaceStrategy(
  track: GpxTrack,
  profile: RunnerProfile,
  carbToleranceGPerHour: number | null = 60,
  garminPredictions?: GarminRacePredictions | null,
  environment?: EnvironmentConditions,
  cutoffs: RaceCheckpoint[] | null = null,
): RaceStrategyReport {
  // Ancrage optionnel sur la courbe Garmin : si les prédictions Firstbeat sont
  // disponibles, on recale le flatSpeed du profil pour que les temps totaux y collent.
  // ⚠️ L'ancrage reste indépendant des conditions météo — c'est une calibration
  // physiologique sur la courbe de prédiction Firstbeat, pas un ajustement climatique.
  const anchoring = garminPredictions
    ? anchorProfileOnGarminCurve(track, profile, garminPredictions)
    : null
  const simProfile = anchoring?.profile ?? profile

  const maxHR   = simProfile.heartRateModel.maxHR
  const simMap  = new Map<RaceStrategyId, SegmentSimulation[]>()
  const plans: StrategyPlan[] = []

  for (const config of STRATEGY_CONFIGS) {
    const result = runSimulation(track, simProfile, {
      strategyId:       config.strategyId,
      effortFactor:     config.effortFactor,
      applyFatigue:     true,
      applyCardiacDrift: true,
      ...(environment && { environment }),
    })

    simMap.set(config.id, result.segments)

    const phases = groupSegmentsIntoPhases(result.segments, 6).map((group, idx) =>
      buildPhase(idx, group, maxHR)
    )
    const riskZones = detectRiskZones(result.segments, maxHR)
    const nutrition = carbToleranceGPerHour !== null
      ? computeNutritionVerdict(result.segments, result.totalDuration, carbToleranceGPerHour, simProfile)
      : null
    const feasibility = cutoffs !== null && cutoffs.length > 0
      ? computeFeasibility(result.segments, result.totalDuration, cutoffs)
      : null

    const avgHR          = Math.round(
      result.segments.reduce((s, seg) => s + seg.heartRateRange.target, 0) / result.segments.length
    )
    const maxHREstimated = Math.round(Math.max(...result.segments.map(s => s.heartRateRange.max)))
    const avgPaceSec     = result.totalDuration / (track.totalDistance / 1000)
    // Moyenne pondérée par la durée de chaque segment : la fatigue impacte
    // la vitesse au cours du temps, donc une moyenne arithmétique simple
    // biaiserait le résultat lorsque les segments sont de tailles inégales.
    const avgFatigue     = result.totalDuration > 0
      ? result.segments.reduce((s, seg) => s + seg.fatigueFactor * seg.estimatedDuration, 0) / result.totalDuration
      : 0
    const walkingSegments = result.segments.filter(s => s.isWalking).length

    const chartData = result.segments.map(seg => ({
      km: Math.round(seg.segment.cumulativeDistance / 100) / 10,
      pace: Math.round(seg.paceRange.target),
      hr: Math.round(seg.heartRateRange.target),
    }))

    plans.push({
      id:                  config.id,
      name:                config.name,
      emoji:               config.emoji,
      totalTimeSeconds:    result.totalDuration,
      totalTimeFormatted:  formatDuration(result.totalDuration),
      avgPaceFormatted:    formatPace(avgPaceSec),
      avgHR,
      maxHREstimated,
      totalCalories:       Math.round(result.totalCalories),
      avgFatigue,
      walkingSegments,
      phases,
      riskZones,
      nutrition,
      feasibility,
      blowupRisk:          config.blowupRisk,
      chartData,
    })
  }

  const lecture = generateLecture(
    track,
    simMap.get('objectif')!,
    simMap.get('ambitieuse')!,
    simProfile,
  )

  const recommendation = computeRecommendation(track, profile, plans, cutoffs)

  return {
    generatedAt:        new Date(),
    trackName:          track.name,
    totalDistanceKm:    Math.round(track.totalDistance / 100) / 10,
    totalElevationGain: Math.round(track.totalElevationGain),
    totalElevationLoss: Math.round(track.totalElevationLoss),
    strategies:         plans,
    lecture,
    carbToleranceGPerHour,
    cutoffs:            cutoffs && cutoffs.length > 0 ? cutoffs : null,
    recommendation,
    ...(anchoring?.anchor && { garminCurveAnchor: anchoring.anchor }),
  }
}
