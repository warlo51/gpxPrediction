/**
 * Types liés aux séances d'entraînement
 * (historique Strava ou saisie manuelle)
 */

/** Source de la séance */
export type SessionSource = 'strava' | 'manual' | 'gpx'

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
  /** Dérive de performance (ratio fin/début) */
  performanceDrift: number
  /**
   * Vitesse médiane par tranche de pente (5%, 10%, 15%…)
   * Utilisé pour détecter le seuil de passage à la marche.
   */
  speedByGradeBucket: Array<{ gradeMin: number; gradeMax: number; medianSpeedMs: number; count: number }>
}
