/**
 * Types liés à l'intégration Strava
 */

/** Token OAuth Strava */
export type StravaToken = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  athleteId: number
}

/** Athlete Strava simplifié */
export type StravaAthlete = {
  id: number
  firstname: string
  lastname: string
  profile: string
  city?: string
  country?: string
}

/** Activité Strava (format API résumé) */
export type StravaActivity = {
  id: number
  name: string
  type: string
  start_date: string
  /** Date locale de l'activité (fuseau horaire du coureur) */
  start_date_local?: string
  /** Distance en mètres */
  distance: number
  /** Durée en secondes */
  moving_time: number
  /** Durée elapsed en secondes */
  elapsed_time: number
  /** D+ en mètres */
  total_elevation_gain: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  map?: { summary_polyline: string }
}

/** État de la connexion Strava */
export type StravaConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; athlete: StravaAthlete; token: StravaToken }
  | { status: 'error'; message: string }
