/**
 * Types pour le plan de course généré en local
 * (équivalent du skill /race-strategy, sans appel API Claude)
 */

export type RaceStrategyId = 'prudente' | 'montagnard' | 'objectif' | 'ambitieuse' | 'all_out'

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

export type RiskZoneCause = 'fc-elevee' | 'fc-soutenue' | 'marche'

export interface RiskZone {
  label: string
  startKm: number
  endKm: number
  level: 'élevé' | 'modéré'
  /** Cause dominante de la zone (la plus sévère observée sur ses segments) */
  cause: RiskZoneCause
  /** FC moyenne (bpm) sur la zone, utile pour l'affichage groupé */
  avgHR: number
}

export interface NutritionVerdict {
  icon: '✅' | '⚠️' | '❌'
  status: 'Suffisant' | 'Limite' | 'Insuffisant'
  deficitKcal: number
  message: string
  /** g/h supplémentaires nécessaires pour combler le déficit (0 si pas de déficit) */
  extraCarbsPerHour: number
  /** g/h totaux recommandés pour finir sans crash (= tolérance courante + extra) */
  recommendedCarbsPerHour: number
}

/** Une barrière horaire (km cible + temps cumulé maximum depuis le départ) */
export interface RaceCheckpoint {
  /** Distance depuis le départ en km */
  km: number
  /** Temps cumulé maximum en secondes pour atteindre ce point */
  cutoffSeconds: number
  /** Libellé optionnel (ex. nom du ravito) */
  label?: string
}

/** Verdict de faisabilité pour un checkpoint donné */
export interface CheckpointVerdict {
  km: number
  label?: string
  cutoffSeconds: number
  /** Temps prédit par la simulation pour atteindre ce point (s) */
  predictedSeconds: number
  /** Marge en secondes (positive = avance, négative = hors-délai) */
  marginSeconds: number
  level: 'safe' | 'tight' | 'fail'
}

/** Verdict de faisabilité global pour une stratégie face à un set de barrières */
export interface FeasibilityVerdict {
  /** Détail par checkpoint, trié par km croissant */
  checkpoints: CheckpointVerdict[]
  /** Le checkpoint avec la plus petite marge (= verdict global) */
  worst: CheckpointVerdict
  /** True si tous les checkpoints passent */
  passes: boolean
  /** Marge globale = celle du worst checkpoint (rétro-compat affichage) */
  marginSeconds: number
  /** Niveau global = celui du worst checkpoint */
  level: 'safe' | 'tight' | 'fail'
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
  /** Verdict nutrition — `null` quand l'utilisateur a désactivé l'analyse glucidique */
  nutrition: NutritionVerdict | null
  /** Verdict de faisabilité barrière horaire — `null` si aucune barrière n'est renseignée */
  feasibility: FeasibilityVerdict | null
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

export interface GarminCurveAnchor {
  /** Temps total prédit par la courbe Garmin + km-effort (secondes) */
  totalTimeSeconds: number
  /** Distance km-effort en km (plat + majoration D+/D-) */
  kmEffortDistanceKm: number
  /** Exposant de Riegel calibré sur les données Garmin du coureur */
  riegelExponent: number
  /** Fiabilité selon le nombre de prédictions Garmin disponibles */
  confidence: 'high' | 'medium' | 'low'
  /** Source des prédictions Garmin (garmin / computed / unavailable) */
  predictionSource: 'garmin' | 'computed' | 'unavailable'
  /** Facteur appliqué au flatSpeed du profil pour caler la simulation sur la courbe */
  flatSpeedScaleFactor: number
}

export interface RaceStrategyReport {
  generatedAt: Date
  trackName: string
  totalDistanceKm: number
  totalElevationGain: number
  totalElevationLoss: number
  strategies: StrategyPlan[]
  lecture: LectureBullet[]
  /** Tolérance glucidique en g/h utilisée pour l'analyse — `null` si l'utilisateur l'a désactivée */
  carbToleranceGPerHour: number | null
  /** Liste des barrières horaires utilisées — `null` si aucune n'a été renseignée */
  cutoffs: RaceCheckpoint[] | null
  recommendation: StrategyRecommendation
  /** Ancrage sur la courbe Garmin — présent si des prédictions Garmin étaient disponibles */
  garminCurveAnchor?: GarminCurveAnchor
}