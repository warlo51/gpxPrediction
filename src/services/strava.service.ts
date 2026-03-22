/**
 * Service Strava
 * - Génération de l'URL d'autorisation OAuth
 * - Échange code → token
 * - Refresh token
 * - Récupération des activités + streams
 * - Mapping vers TrainingSession
 */

import type {
  StravaToken,
  StravaAthlete,
  StravaActivity,
  ActivityStreams,
  TrainingSession,
} from '@/types'
import type { StravaCredentials } from '@/stores/stravaStore'

const STRAVA_API = 'https://www.strava.com/api/v3'
const STRAVA_AUTH = 'https://www.strava.com/oauth'

// ─── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Génère l'URL d'autorisation Strava.
 * Le redirectUri est toujours calculé depuis window.location.origin
 * pour fonctionner en localhost ET en production (Vercel, etc.)
 */
export function buildStravaAuthUrl(creds: StravaCredentials): string {
  const redirectUri = `${window.location.origin}/strava/callback`
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  })
  return `${STRAVA_AUTH}/authorize?${params.toString()}`
}

/**
 * Échange le code d'autorisation contre un token d'accès.
 * Le redirectUri doit être identique à celui utilisé lors de l'autorisation.
 */
export async function exchangeCodeForToken(
  code: string,
  creds: StravaCredentials,
): Promise<{ token: StravaToken; athlete: StravaAthlete }> {
  // Toujours recalculé depuis l'origine courante
  const redirectUri = `${window.location.origin}/strava/callback`

  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Erreur Strava (${res.status}) : ${(err as { message?: string }).message ?? 'token invalide'}`,
    )
  }

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
    athlete: {
      id: number
      firstname: string
      lastname: string
      profile: string
      city?: string
      country?: string
    }
  }

  const token: StravaToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete.id,
  }

  const athlete: StravaAthlete = {
    id: data.athlete.id,
    firstname: data.athlete.firstname,
    lastname: data.athlete.lastname,
    profile: data.athlete.profile,
    city: data.athlete.city,
    country: data.athlete.country,
  }

  return { token, athlete }
}

/**
 * Rafraîchit le token s'il est expiré.
 * Retourne le token actuel s'il est encore valide.
 */
export async function refreshTokenIfNeeded(
  token: StravaToken,
  creds: StravaCredentials,
): Promise<StravaToken> {
  const now = Math.floor(Date.now() / 1000)
  // Marge de 5 minutes
  if (token.expiresAt > now + 300) return token

  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: token.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) throw new Error('Impossible de rafraîchir le token Strava.')

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_at: number
  }

  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  }
}

// ─── API Strava ───────────────────────────────────────────────────────────────

/** Helper fetch authentifié */
async function stravaFetch<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Strava API ${res.status} : ${path}`)
  }
  return res.json() as Promise<T>
}

/**
 * Récupère toutes les activités de running avec pagination automatique.
 * Filtre sur les types Run/TrailRun uniquement.
 */
export async function fetchStravaActivities(
  accessToken: string,
  onProgress?: (loaded: number) => void,
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = []
  let page = 1
  const perPage = 50

  while (true) {
    const batch = await stravaFetch<StravaActivity[]>(
      `/athlete/activities?per_page=${perPage}&page=${page}`,
      accessToken,
    )

    if (batch.length === 0) break

    const runs = batch.filter((a) =>
      ['Run', 'TrailRun', 'VirtualRun'].includes(a.type),
    )
    all.push(...runs)
    onProgress?.(all.length)

    if (batch.length < perPage) break
    page++

    // Sécurité anti-boucle : max 20 pages (1000 activités)
    if (page > 20) break
  }

  return all
}

/**
 * Récupère les streams d'une activité (altitude, distance, FC, vitesse).
 * Retourne null si les streams ne sont pas disponibles.
 */
export async function fetchActivityStreams(
  activityId: number,
  accessToken: string,
): Promise<ActivityStreams | null> {
  try {
    const keys = 'distance,altitude,heartrate,velocity_smooth,grade_smooth,latlng,time'
    const data = await stravaFetch<Array<{ type: string; data: number[] | [number, number][] }>>(
      `/activities/${activityId}/streams?keys=${keys}&key_by_type=false`,
      accessToken,
    )

    const streams: ActivityStreams = { distance: [], altitude: [] }

    for (const stream of data) {
      switch (stream.type) {
        case 'distance':
          streams.distance = stream.data as number[]
          break
        case 'altitude':
          streams.altitude = stream.data as number[]
          break
        case 'heartrate':
          streams.heartrate = stream.data as number[]
          break
        case 'velocity_smooth':
          streams.velocity_smooth = stream.data as number[]
          break
        case 'grade_smooth':
          streams.grade_smooth = stream.data as number[]
          break
        case 'latlng':
          streams.latlng = stream.data as [number, number][]
          break
        case 'time':
          streams.time = stream.data as number[]
          break
      }
    }

    return streams.distance.length > 0 ? streams : null
  } catch {
    return null
  }
}

// ─── Mapping Strava → TrainingSession ────────────────────────────────────────

/**
 * Convertit une activité Strava en TrainingSession interne.
 */
export function mapActivityToSession(
  activity: StravaActivity,
  streams?: ActivityStreams,
): TrainingSession {
  const avgPace =
    activity.average_speed > 0
      ? 1000 / activity.average_speed
      : activity.moving_time / (activity.distance / 1000)

  return {
    id: `strava-${activity.id}`,
    name: activity.name,
    date: new Date(activity.start_date),
    source: 'strava',
    distance: activity.distance,
    duration: activity.moving_time,
    elevationGain: activity.total_elevation_gain,
    avgPace,
    avgHeartRate: activity.average_heartrate,
    maxHeartRate: activity.max_heartrate,
    stravaId: activity.id,
    streams,
  }
}
