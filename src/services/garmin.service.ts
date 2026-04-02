/**
 * Service Garmin Connect — appels vers les Vercel API Routes
 * Toutes les opérations Garmin passent par le backend /api/garmin/*
 */

import type { GarminOAuth1Token, GarminOAuth2Token, GarminProfile } from '@/stores/garminStore'
import type { TrainingSession, ActivityStreams } from '@/types'
import { parseFitFile } from './fitParser.service'

const API_BASE = '/api/garmin'

// ─── Types Garmin Activity ────────────────────────────────────────────────────

export type GarminActivity = {
  activityId: number
  activityName: string
  startTimeLocal: string
  startTimeGMT: string
  distance: number            // mètres
  duration: number            // secondes
  movingDuration?: number
  elevationGain?: number
  elevationLoss?: number
  averageSpeed?: number       // m/s
  averageHR?: number
  maxHR?: number
  averageRunningCadenceInStepsPerMinute?: number
  maxRunningCadenceInStepsPerMinute?: number
  avgPower?: number           // watts (Epix Pro Running Power)
  maxPower?: number
  normPower?: number
  calories?: number
  vO2MaxValue?: number   // casse originale retournée par l'API Garmin Connect
  aerobicTrainingEffect?: number
  anaerobicTrainingEffect?: number
  activityType?: { typeKey: string; typeId: number }
  // Métriques HRM-Pro/HRM-Run
  avgGroundContactTime?: number      // ms
  avgVerticalOscillation?: number    // cm
  avgStrideLength?: number           // cm
  avgVerticalRatio?: number          // %
  groundContactBalance?: number      // % gauche
  trainingStressScore?: number
  intensityFactor?: number
}

// ─── Auth headers ─────────────────────────────────────────────────────────────

function garminHeaders(oauth1: GarminOAuth1Token, oauth2: GarminOAuth2Token): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-garmin-oauth1': JSON.stringify(oauth1),
    'x-garmin-oauth2': JSON.stringify(oauth2),
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function garminLogin(
  username: string,
  password: string,
  mfaCode?: string,
  mfaState?: unknown,
): Promise<
  | { mfa_required: true; state: unknown }
  | { oauth1: GarminOAuth1Token; oauth2: GarminOAuth2Token; profile: GarminProfile }
> {
  const body: Record<string, unknown> = { username, password }
  if (mfaCode) body.mfaCode = mfaCode
  if (mfaState) body.state = mfaState

  console.log('[Garmin] Login request:', { username, hasMfa: !!mfaCode })
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  console.log('[Garmin] Login response status:', res.status)

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string; debug?: string }
    console.error('[Garmin] Login error:', data)
    const msg = data.error ?? `Erreur ${res.status}`
    throw new Error(data.debug ? `${msg}\n\n[Debug] ${data.debug}` : msg)
  }

  const data = await res.json() as {
    mfa_required?: boolean
    state?: unknown
    oauth1Token?: GarminOAuth1Token
    oauth2Token?: GarminOAuth2Token
    displayName?: string
    profileImageUrl?: string | null
    error?: string
    debug?: string
  }

  console.log('[Garmin] Login response data:', { mfa_required: data.mfa_required, hasOauth1: !!data.oauth1Token, hasOauth2: !!data.oauth2Token, displayName: data.displayName, error: data.error })

  if (data.error) throw new Error(data.debug ? `${data.error} — ${data.debug}` : data.error)
  if (data.mfa_required) return { mfa_required: true, state: data.state }

  return {
    oauth1: data.oauth1Token!,
    oauth2: data.oauth2Token!,
    profile: {
      displayName: data.displayName ?? username,
      profileImageUrl: data.profileImageUrl ?? null,
    },
  }
}

// ─── Récupérer les activités ──────────────────────────────────────────────────

export async function fetchGarminActivities(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GarminActivity[]> {
  const all: GarminActivity[] = []
  const batchSize = 100
  let start = 0

  while (true) {
    console.log(`[Garmin] Fetching activities: start=${start}, limit=${batchSize}`)
    const res = await fetch(
      `${API_BASE}/activities?start=${start}&limit=${batchSize}`,
      { headers: garminHeaders(oauth1, oauth2) },
    )

    console.log(`[Garmin] Activities response status: ${res.status}`)

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      console.error('[Garmin] Activities error:', data)
      throw new Error(data.error ?? `Erreur ${res.status}`)
    }

    const data = await res.json() as { activities: GarminActivity[]; total: number }
    console.log(`[Garmin] Activities batch: ${data.activities.length} activities, total=${data.total}`)
    if (data.activities.length > 0) {
      console.log('[Garmin] Sample activity:', JSON.stringify(data.activities[0], null, 2))
    }
    all.push(...data.activities)
    onProgress?.(all.length, data.total)

    if (data.activities.length < batchSize) break
    start += batchSize

    // Anti rate-limit
    await new Promise(r => setTimeout(r, 300))
  }

  return all
}

// ─── Télécharger le fichier FIT d'une activité ───────────────────────────────

export async function fetchGarminFit(
  activityId: number,
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
): Promise<ArrayBuffer | null> {
  console.log(`[Garmin] Fetching FIT for activity ${activityId}`)
  const res = await fetch(
    `${API_BASE}/fit?activityId=${activityId}`,
    { headers: garminHeaders(oauth1, oauth2) },
  )

  console.log(`[Garmin] FIT response status: ${res.status} for activity ${activityId}`)

  if (res.status === 404) return null
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    console.error(`[Garmin] FIT error for ${activityId}:`, data)
    throw new Error(data.error ?? `Erreur FIT ${res.status}`)
  }

  const buffer = await res.arrayBuffer()
  console.log(`[Garmin] FIT downloaded: ${buffer.byteLength} bytes for activity ${activityId}`)
  return buffer
}

// ─── Récupérer les stats utilisateur (VO2max, seuil lactate…) ────────────────

export type GarminUserStats = {
  vo2MaxRunning: number | null
  vo2MaxCycling: number | null
  lactateThresholdSpeed: number | null
  lactateThresholdHeartRate: number | null
  runningTrainingSpeed: number | null
  userLevel: string | null
}

export async function fetchGarminUserStats(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
): Promise<GarminUserStats> {
  console.log('[Garmin] Fetching user-stats (VO2max, lactate threshold…)')
  const res = await fetch(`${API_BASE}/user-stats`, {
    headers: garminHeaders(oauth1, oauth2),
  })

  console.log(`[Garmin] User-stats response status: ${res.status}`)

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    console.error('[Garmin] User-stats error:', data)
    throw new Error(data.error ?? `Erreur user-stats ${res.status}`)
  }

  const data = await res.json() as GarminUserStats
  console.log('[Garmin] User-stats:', JSON.stringify(data, null, 2))
  return data
}

// ─── Mapper GarminActivity → TrainingSession ──────────────────────────────────

export function mapGarminActivityToSession(
  activity: GarminActivity,
  streams?: ActivityStreams,
): TrainingSession {
  const distance = activity.distance ?? 0
  const duration = activity.movingDuration ?? activity.duration ?? 0
  const avgSpeed = activity.averageSpeed ?? (duration > 0 ? distance / duration : 0)
  const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0

  return {
    id: `garmin-${activity.activityId}`,
    name: activity.activityName,
    date: new Date(activity.startTimeLocal ?? activity.startTimeGMT),
    source: 'garmin',
    distance,
    duration,
    elevationGain: activity.elevationGain ?? 0,
    avgPace,
    avgHeartRate: activity.averageHR,
    maxHeartRate: activity.maxHR,
    streams,
  }
}

// ─── Import complet avec FIT ──────────────────────────────────────────────────

export type GarminImportProgress =
  | { phase: 'activities'; loaded: number; total: number }
  | { phase: 'fit'; current: number; total: number; activityName: string }
  | { phase: 'calibrating' }
  | { phase: 'done'; imported: number; skipped: number; withFit: number }
  | { phase: 'error'; message: string }

/**
 * Import complet :
 * 1. Récupère la liste des activités via /api/garmin/activities
 * 2. Pour chaque nouvelle activité → télécharge le FIT via /api/garmin/fit
 * 3. Parse le FIT pour extraire streams + métriques Garmin avancées
 * 4. Retourne les sessions avec toutes les données
 */
export async function importGarminActivities(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
  existingIds: Set<string>,
  onProgress: (state: GarminImportProgress) => void,
): Promise<{ sessions: TrainingSession[]; withFit: number; skipped: number }> {
  // 1. Liste des activités
  console.log('[Garmin] Starting import — existing session IDs:', [...existingIds])
  const activities = await fetchGarminActivities(oauth1, oauth2, (loaded, total) => {
    onProgress({ phase: 'activities', loaded, total })
  })

  console.log(`[Garmin] Total activities fetched: ${activities.length}`)

  const newActivities = activities.filter(
    a => !existingIds.has(`garmin-${a.activityId}`)
  )

  console.log(`[Garmin] New activities to import: ${newActivities.length}, skipped: ${activities.length - newActivities.length}`)

  if (newActivities.length === 0) {
    console.log('[Garmin] No new activities — import complete')
    return { sessions: [], withFit: 0, skipped: activities.length }
  }

  // 2. FIT + parsing pour chaque nouvelle activité
  const sessions: TrainingSession[] = []
  let withFit = 0

  for (let i = 0; i < newActivities.length; i++) {
    const activity = newActivities[i]!
    onProgress({
      phase: 'fit',
      current: i + 1,
      total: newActivities.length,
      activityName: activity.activityName,
    })

    try {
      const fitBuffer = await fetchGarminFit(activity.activityId, oauth1, oauth2)

      if (fitBuffer) {
        // Parser le FIT pour extraire les streams détaillés
        const fitResult = await parseFitFile(fitBuffer, activity.activityName)
        // Enrichir la session avec les données Garmin de l'activité (plus complètes que le FIT summary)
        const session: TrainingSession = {
          ...fitResult.session,
          id: `garmin-${activity.activityId}`,
          name: activity.activityName,
          date: new Date(activity.startTimeLocal ?? activity.startTimeGMT),
          source: 'garmin',
          // Préférer les métriques agrégées de l'API (plus fiables que le FIT summary)
          avgHeartRate: activity.averageHR ?? fitResult.session.avgHeartRate,
          maxHeartRate: activity.maxHR ?? fitResult.session.maxHeartRate,
          elevationGain: activity.elevationGain ?? fitResult.session.elevationGain,
        }
        sessions.push(session)
        withFit++
      } else {
        // Pas de FIT dispo → utiliser les métriques agrégées uniquement
        sessions.push(mapGarminActivityToSession(activity))
      }
    } catch {
      // En cas d'erreur sur un FIT → fallback sur les métriques agrégées
      sessions.push(mapGarminActivityToSession(activity))
    }

    // Anti rate-limit entre chaque FIT
    if (i < newActivities.length - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  console.log(`[Garmin] Import complete: ${sessions.length} sessions, ${withFit} with FIT, ${activities.length - newActivities.length} skipped`)
  console.log('[Garmin] Imported session IDs:', sessions.map(s => s.id))
  return { sessions, withFit, skipped: activities.length - newActivities.length }
}
