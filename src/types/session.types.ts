/**
 * Types liés aux séances d'entraînement
 * (historique Strava ou saisie manuelle)
 */

/** Source de la séance */
export type SessionSource = 'strava' | 'garmin' | 'manual' | 'gpx'

/** Streams bruts récupérés depuis l'API Strava */
export type ActivityStreams = {
  distance: number[]
  altitude: number[]
  heartrate?: number[]
  velocity_smooth?: number[]
  grade_smooth?: number[]
  latlng?: [number, number][]
  time?: number[]
}

/** Une séance d'entraînement individuelle */
export type TrainingSession = {
  id: string
  name: string
  date: Date
  source: SessionSource
  /** Distance en mètres */
  distance: number
  /** Durée en secondes */
  duration: number
  /** Dénivelé positif en mètres */
  elevationGain: number
  /** Dénivelé négatif en mètres */
  elevationLoss?: number
  /** Allure moyenne en s/km */
  avgPace: number
  /** FC moyenne en bpm (optionnel) */
  avgHeartRate?: number
  /** FC max en bpm (optionnel) */
  maxHeartRate?: number
  /** Streams détaillés (optionnel, chargement à la demande) */
  streams?: ActivityStreams
  /** ID Strava si la séance vient de Strava */
  stravaId?: number

  // ── Données Garmin enrichies (optionnelles) ──

  /** Type d'activité (ex: "trail_running", "running") */
  activityType?: string
  /** Calories totales */
  calories?: number
  /** VO2max estimé par l'activité */
  vo2Max?: number
  /** Cadence moyenne (pas/min) */
  avgCadence?: number
  /** Cadence max (pas/min) */
  maxCadence?: number
  /** Puissance moyenne (watts) */
  avgPower?: number
  /** Puissance max (watts) */
  maxPower?: number
  /** Puissance normalisée (watts) */
  normalizedPower?: number
  /** Training Effect aérobie (0-5) */
  aerobicTrainingEffect?: number
  /** Training Effect anaérobie (0-5) */
  anaerobicTrainingEffect?: number
  /** Label d'effet d'entraînement (ex: "LACTATE_THRESHOLD", "TEMPO") */
  trainingEffectLabel?: string
  /** Training Load (EPOC) */
  trainingLoad?: number
  /** Temps de contact au sol moyen (ms) */
  avgGroundContactTime?: number
  /** Oscillation verticale moyenne (cm) */
  avgVerticalOscillation?: number
  /** Longueur de foulée moyenne (cm) */
  avgStrideLength?: number
  /** Ratio vertical moyen (%) */
  avgVerticalRatio?: number
  /** Allure ajustée pente (GAP) en s/km */
  gradeAdjustedPace?: number
  /** Meilleur split 1km (secondes) */
  fastestKm?: number
  /** Meilleur split 5km (secondes) */
  fastest5k?: number
  /** Temps par zone FC Garmin (secondes) */
  hrZones?: [number, number, number, number, number]
  /** Vitesse max en m/s */
  maxSpeed?: number
  /** Nombre de pas */
  steps?: number
  /** Température min/max (°C) */
  temperature?: { min: number; max: number }
  /** Fréquence respiratoire moyenne */
  avgRespirationRate?: number
  /** Lieu de départ */
  locationName?: string
  /** Nombre de laps */
  lapCount?: number
  /** Minutes d'intensité modérée */
  moderateIntensityMinutes?: number
  /** Minutes d'intensité vigoureuse */
  vigorousIntensityMinutes?: number
}

/** Métriques calculées depuis les streams d'une séance */
export type SessionMetrics = {
  sessionId: string
  /** Vitesse moyenne sur les segments plats */
  flatAvgSpeedMs: number
  /** Corrélations vitesse/pente échantillonnées */
  speedGradeSamples: Array<{ grade: number; speedMs: number }>
  /** Corrélations FC/vitesse échantillonnées */
  hrSpeedSamples: Array<{ speedMs: number; hr: number }>
  /** Corrélations FC/pente (pour calibrer gradeHRFactor) */
  hrGradeSamples: Array<{ grade: number; hr: number }>
  /** Dérive de performance (ratio fin/début) */
  performanceDrift: number
  /**
   * Vitesse médiane par tranche de pente (5%, 10%, 15%…)
   * Utilisé pour détecter le seuil de passage à la marche.
   */
  speedByGradeBucket: Array<{ gradeMin: number; gradeMax: number; medianSpeedMs: number; count: number }>
  /** Dérive cardiaque mesurée sur la séance en bpm/heure (null si données insuffisantes) */
  cardiacDrift?: number
  /** Vitesse de marche réelle mesurée sur les segments raides (m/s) */
  walkingSpeedMs?: number
}
