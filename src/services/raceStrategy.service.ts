/**
 * Service de génération du plan de course
 * Produit un RaceStrategyReport complet (Prudente / Objectif / Ambitieuse)
 * à partir d'un GpxTrack + RunnerProfile, sans appel API externe.
 */

import type { GpxTrack, RunnerProfile, SegmentSimulation } from '@/types'
import type {
  RaceStrategyReport,
  StrategyPlan,
  RacePhase,
  LectureBullet,
  RiskZone,
  NutritionVerdict,
  RaceStrategyId,
} from '@/types/raceStrategy.types'
import { runSimulation, formatDuration, formatPace } from './simulationEngine.service'

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

function detectRiskZones(simSegments: SegmentSimulation[], maxHR: number): RiskZone[] {
  const zones: RiskZone[] = []
  let zoneStart: number | null = null
  let zoneHRs: number[] = []
  let zoneLevel: 'élevé' | 'modéré' = 'modéré'

  const flush = (endKm: number) => {
    if (zoneStart === null || zoneHRs.length === 0) return
    const avgHR = Math.round(zoneHRs.reduce((a, b) => a + b, 0) / zoneHRs.length)
    zones.push({
      label: `Km ${zoneStart.toFixed(1)}–${endKm.toFixed(1)} — FC ~${avgHR} bpm`,
      startKm: zoneStart,
      endKm,
      level: zoneLevel,
    })
    zoneStart = null
    zoneHRs = []
  }

  for (const sim of simSegments) {
    const hr     = sim.heartRateRange.target
    const startKm = (sim.segment.cumulativeDistance - sim.segment.distance) / 1000

    let level: 'élevé' | 'modéré' | null = null
    if (hr > maxHR * 0.92)                        level = 'élevé'
    else if (hr > maxHR * 0.87 || sim.isWalking)  level = 'modéré'

    if (level) {
      if (zoneStart === null) { zoneStart = startKm; zoneLevel = level }
      zoneHRs.push(hr)
    } else {
      flush(startKm)
    }
  }

  const lastSeg = simSegments[simSegments.length - 1]
  if (lastSeg) flush(lastSeg.segment.cumulativeDistance / 1000)

  return zones
}

// ─── Nutrition ─────────────────────────────────────────────────────────────────

function computeNutritionVerdict(
  totalCalories: number,
  totalTimeSeconds: number,
  carbToleranceGPerHour: number,
): NutritionVerdict {
  const durationHours      = totalTimeSeconds / 3600
  const maxAbsorbableKcal  = carbToleranceGPerHour * durationHours * 4
  const deficit            = Math.round(totalCalories - maxAbsorbableKcal)

  // Km estimé où le déficit devient critique (80% du budget carbs épuisé)
  const critKm = Math.round((maxAbsorbableKcal * 0.8 / totalCalories) * (totalCalories / 65))

  if (deficit < 400) {
    return {
      icon: '✅', status: 'Suffisant', deficitKcal: deficit,
      message: `Déficit ~${deficit} kcal — tolérable sur cette durée`,
    }
  } else if (deficit < 800) {
    return {
      icon: '⚠️', status: 'Limite', deficitKcal: deficit,
      message: `Déficit ~${deficit} kcal — surveiller l'énergie à partir de km ${critKm}`,
    }
  } else {
    return {
      icon: '❌', status: 'Insuffisant', deficitKcal: deficit,
      message: `Déficit ~${deficit} kcal — risque de fringale vers km ${critKm}. Envisager de dépasser ta tolérance habituelle`,
    }
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

// ─── Fonction principale ───────────────────────────────────────────────────────

export function generateRaceStrategy(
  track: GpxTrack,
  profile: RunnerProfile,
  carbToleranceGPerHour = 60,
): RaceStrategyReport {
  const maxHR   = profile.heartRateModel.maxHR
  const simMap  = new Map<RaceStrategyId, SegmentSimulation[]>()
  const plans: StrategyPlan[] = []

  for (const config of STRATEGY_CONFIGS) {
    const result = runSimulation(track, profile, {
      strategyId:       config.strategyId,
      effortFactor:     config.effortFactor,
      applyFatigue:     true,
      applyCardiacDrift: true,
    })

    simMap.set(config.id, result.segments)

    const phases = groupSegmentsIntoPhases(result.segments, 6).map((group, idx) =>
      buildPhase(idx, group, maxHR)
    )
    const riskZones = detectRiskZones(result.segments, maxHR)
    const nutrition = computeNutritionVerdict(result.totalCalories, result.totalDuration, carbToleranceGPerHour)

    const avgHR          = Math.round(
      result.segments.reduce((s, seg) => s + seg.heartRateRange.target, 0) / result.segments.length
    )
    const maxHREstimated = Math.round(Math.max(...result.segments.map(s => s.heartRateRange.max)))
    const avgPaceSec     = result.totalDuration / (track.totalDistance / 1000)

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
      phases,
      riskZones,
      nutrition,
      blowupRisk:          config.blowupRisk,
    })
  }

  const lecture = generateLecture(
    track,
    simMap.get('objectif')!,
    simMap.get('ambitieuse')!,
    profile,
  )

  return {
    generatedAt:        new Date(),
    trackName:          track.name,
    totalDistanceKm:    Math.round(track.totalDistance / 100) / 10,
    totalElevationGain: Math.round(track.totalElevationGain),
    totalElevationLoss: Math.round(track.totalElevationLoss),
    strategies:         plans,
    lecture,
    carbToleranceGPerHour,
  }
}
