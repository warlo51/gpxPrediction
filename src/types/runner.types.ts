/**
 * Types liés au profil coureur et à ses statistiques
 */

/** Plage de valeurs (min/max) pour une estimation probabiliste */
export type ValueRange = {
  min: number
  max: number
  /** Valeur centrale (médiane ou moyenne) */
  target: number
}

/** Relation vitesse ↔ pente calibrée sur l'historique */
export type SpeedGradeModel = {
  /** Vitesse sur plat en m/s */
  flatSpeed: number
  /** Coefficient de réduction vitesse par % de pente positive (0 à 1) */
  uphillDecayFactor: number
  /** Coefficient d'accélération sur pente négative (0 à 1) */
  downhillBoostFactor: number
  /** Au-delà de cette pente (%), le coureur marche */
  walkingThresholdGrade: number
  /** Vitesse de marche en m/s */
  walkingSpeed: number
}

/** Modèle de fatigue / dérive de performance */
export type FatigueModel = {
  /** Facteur de dérive par heure (ex: 0.03 = 3% de ralentissement/h) */
  hourlyDecayFactor: number
  /** Facteur de récupération sur descente (réduit la fatigue) */
  downhillRecoveryFactor: number
  /** Seuil de distance (km) à partir duquel la fatigue s'accélère */
  fatigueThresholdKm: number
  /** Coefficient de fatigue supplémentaire au-delà du seuil */
  lateFatigueMultiplier: number
}

/** Modèle FC (fréquence cardiaque) */
export type HeartRateModel = {
  /** FC au repos en bpm */
  restingHR: number
  /** FC maximale en bpm */
  maxHR: number
  /** FC à l'allure de base sur plat en bpm */
  baseHR: number
  /** Coefficient de hausse FC avec la pente */
  gradeHRFactor: number
  /** Dérive cardiaque progressive en bpm/heure */
  cardiacDriftBpmPerHour: number
}

/** Modèle énergétique */
export type EnergyModel = {
  /** Poids du coureur en kg */
  weightKg: number
  /** Coût énergétique sur plat en kcal/km */
  flatCaloriesPerKm: number
  /** Surcoût pour le D+ en kcal/100m */
  uphillCaloriesPer100m: number
}

/** Profil coureur complet, calibré sur l'historique */
export type RunnerProfile = {
  id: string
  name: string
  /** Date de dernière calibration */
  calibratedAt: Date
  /** Nombre de séances utilisées pour la calibration */
  sessionCount: number

  speedModel: SpeedGradeModel
  fatigueModel: FatigueModel
  heartRateModel: HeartRateModel
  energyModel: EnergyModel

  /** Allure de base (plat) en s/km */
  basePaceSecPerKm: number
  /** FC moyenne à l'allure de base */
  baseHeartRate: number
  /** Score d'endurance (0 à 1) — capacité à maintenir l'effort dans le temps */
  enduranceScore: number
}

/** Stats agrégées calculées depuis l'historique */
export type RunnerStats = {
  totalSessions: number
  totalDistanceKm: number
  totalElevationGain: number
  avgPaceSecPerKm: number
  avgHeartRate?: number
  longestRunKm: number
  biggestElevationGain: number
}
