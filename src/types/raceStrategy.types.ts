/**
 * Types pour le plan de course généré en local
 * (équivalent du skill /race-strategy, sans appel API Claude)
 */

export type RaceStrategyId = 'prudente' | 'objectif' | 'ambitieuse'

export interface RacePhase {
  index: number
  label: string
  startKm: number
  endKm: number
  distanceKm: number
  elevationGain: number
  elevationLoss: number
  avgGrade: number
  terrainLabel: string
  targetPaceFormatted: string
  avgHR: number
  rpe: string
  cumulativeTimeFormatted: string
  riskLevel: 'élevé' | 'modéré' | 'faible'
}

export interface RiskZone {
  label: string
  startKm: number
  endKm: number
  level: 'élevé' | 'modéré'
}

export interface NutritionVerdict {
  icon: '✅' | '⚠️' | '❌'
  status: 'Suffisant' | 'Limite' | 'Insuffisant'
  deficitKcal: number
  message: string
}

export interface StrategyChartPoint {
  km: number
  pace: number  // s/km
  hr: number    // bpm
}

export interface StrategyPlan {
  id: RaceStrategyId
  name: string
  emoji: string
  totalTimeSeconds: number
  totalTimeFormatted: string
  avgPaceFormatted: string
  avgHR: number
  maxHREstimated: number
  totalCalories: number
  avgFatigue: number
  walkingSegments: number
  phases: RacePhase[]
  riskZones: RiskZone[]
  nutrition: NutritionVerdict
  blowupRisk: 'Faible' | 'Modéré' | 'Élevé'
  chartData: StrategyChartPoint[]
}

export interface LectureBullet {
  kmRange: string
  content: string
  isWarning: boolean
}

export interface StrategyRecommendation {
  id: RaceStrategyId
  reason: string
}

export interface RaceStrategyReport {
  generatedAt: Date
  trackName: string
  totalDistanceKm: number
  totalElevationGain: number
  totalElevationLoss: number
  strategies: StrategyPlan[]
  lecture: LectureBullet[]
  carbToleranceGPerHour: number
  recommendation: StrategyRecommendation
}