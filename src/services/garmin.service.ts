/**
 * Service Garmin Connect — appels vers les Vercel API Routes
 * Toutes les opérations Garmin passent par le backend /api/garmin/*
 */

import type { GarminOAuth1Token, GarminOAuth2Token, GarminProfile } from '@/stores/garminStore'
import type { GarminRacePredictions, RunnerProfile } from '@/types'

const API_BASE = '/api/garmin'

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

// ─── Helpers anti rate-limit ─────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Fetch avec retry automatique sur 429 (Too Many Requests).
 * Backoff exponentiel : 2s → 4s → 8s (3 retries max).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastRes: Response | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 429) return res
    lastRes = res
    if (attempt < maxRetries) {
      const wait = Math.pow(2, attempt + 1) * 1000 // 2s, 4s, 8s
      console.warn(`[Garmin] 429 rate-limited — retry ${attempt + 1}/${maxRetries} in ${wait}ms`)
      await delay(wait)
    }
  }
  return lastRes!
}

// ─── Récupérer les activités (historique) ───────────────────────────────────

/**
 * Résumé d'une activité Garmin — champs utiles pour la calibration du profil.
 * Coordonnées GPS exclues volontairement (données sensibles).
 */
export type GarminActivitySummary = {
  activityId: number
  activityType: unknown
  activityName: string | null
  startTimeLocal: string
  distance: number | null
  duration: number | null
  elevationGain: number | null
  elevationLoss: number | null
  averageSpeed: number | null
  averageHR: number | null
  maxHR: number | null
  calories: number | null
  steps: number | null
  trainingEffect: number | null
  aerobicTrainingEffect: number | null
  anaerobicTrainingEffect: number | null
}

export type GarminActivitiesResponse = {
  count: number
  durationMs: number
  pages: number
  activities: GarminActivitySummary[]
}

/**
 * Récupère l'historique complet des activités running Garmin via l'endpoint
 * Vercel /api/garmin/activities. La pagination est gérée côté backend.
 */
export async function fetchGarminActivities(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
): Promise<GarminActivitiesResponse> {
  console.log('[Garmin Activities] Fetching activities from API…')
  const t0 = Date.now()

  const res = await fetchWithRetry(`${API_BASE}/activities`, {
    headers: garminHeaders(oauth1, oauth2),
  })

  console.log(`[Garmin Activities] Response status: ${res.status}`)

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    console.error('[Garmin Activities] Error:', data)
    throw new Error(data.error ?? `Erreur activities ${res.status}`)
  }

  const data = await res.json() as GarminActivitiesResponse
  const clientDuration = Date.now() - t0

  console.log(`[Garmin Activities] Fetched ${data.count} activities in ${clientDuration}ms (backend: ${data.durationMs}ms, ${data.pages} pages)`)
  console.log('[Garmin Activities] Activities:', data.activities)

  return data
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
  const res = await fetchWithRetry(`${API_BASE}/user-stats`, {
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

// ─── Prédictions de course Garmin ─────────────────────────────────────────────

export async function fetchGarminRacePredictions(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
): Promise<GarminRacePredictions> {
  console.log('[Garmin] Fetching race predictions…')
  const res = await fetchWithRetry(`${API_BASE}/race-predictions`, {
    headers: garminHeaders(oauth1, oauth2),
  })

  console.log(`[Garmin] Race predictions response status: ${res.status}`)

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    console.error('[Garmin] Race predictions error:', data)
    throw new Error(data.error ?? `Erreur race-predictions ${res.status}`)
  }

  const data = await res.json() as GarminRacePredictions
  console.log('[Garmin] Race predictions:', JSON.stringify(data, null, 2))
  return data
}

// ─── Calcul prédictions depuis VO2max (Jack Daniels) ────────────────────────

/**
 * Calcule la vitesse à VO2max (m/s) en inversant la formule de Jack Daniels :
 *   VO2 = 0.000104 × v² + 0.182258 × v - 4.60   (v en m/min)
 * Résolution quadratique → v en m/s
 */
function vVo2maxFromVo2max(vo2max: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -(vo2max + 4.60)
  const vMperMin = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  return vMperMin / 60 // m/s
}

/**
 * Estime les temps de course depuis le VO2max via la table VDOT de Daniels.
 * Pourcentages d'utilisation : 5K=98%, 10K=90%, HM=84%, M=76% de vVO2max.
 */
function computeRacePredictionsFromVo2max(vo2max: number): GarminRacePredictions {
  const vVo2max = vVo2maxFromVo2max(vo2max)
  return {
    fiveK: Math.round(5000 / (vVo2max * 0.98)),
    tenK: Math.round(10000 / (vVo2max * 0.90)),
    halfMarathon: Math.round(21097 / (vVo2max * 0.84)),
    marathon: Math.round(42195 / (vVo2max * 0.76)),
    source: 'computed',
    updatedAt: new Date().toISOString(),
  }
}

// ─── Sync Garmin profile (stats + prédictions + wellness) ────────────────────

export type GarminSyncResult = {
  userStats: GarminUserStats
  racePredictions: GarminRacePredictions
  restingHR: number | null
  hrv: number | null
}

/**
 * Synchronise en une seule passe les données physiologiques Garmin :
 * VO2max, seuil lactate, prédictions de course, FC repos et HRV.
 * Les trois appels sont lancés en parallèle.
 */
export async function syncGarminProfile(
  oauth1: GarminOAuth1Token,
  oauth2: GarminOAuth2Token,
): Promise<GarminSyncResult> {
  console.log('[Garmin] Starting profile sync…')

  const [userStatsResult, racePredictionsResult, wellnessRes] = await Promise.allSettled([
    fetchGarminUserStats(oauth1, oauth2),
    fetchGarminRacePredictions(oauth1, oauth2),
    fetchWithRetry(`${API_BASE}/wellness`, { headers: garminHeaders(oauth1, oauth2) }),
  ])

  const userStats: GarminUserStats = userStatsResult.status === 'fulfilled'
    ? userStatsResult.value
    : { vo2MaxRunning: null, vo2MaxCycling: null, lactateThresholdSpeed: null, lactateThresholdHeartRate: null, runningTrainingSpeed: null, userLevel: null }

  let racePredictions: GarminRacePredictions = racePredictionsResult.status === 'fulfilled'
    ? racePredictionsResult.value
    : { fiveK: null, tenK: null, halfMarathon: null, marathon: null, source: 'unavailable', updatedAt: null }

  let restingHR: number | null = null
  let hrv: number | null = null
  if (wellnessRes.status === 'fulfilled' && wellnessRes.value.ok) {
    try {
      const wellness = await wellnessRes.value.json() as {
        heartRate?: { restingHeartRate?: number }
        sleep?: { averageHRV?: number }
      }
      restingHR = wellness.heartRate?.restingHeartRate ?? null
      hrv = wellness.sleep?.averageHRV ?? null
    } catch {
      // wellness data non critique
    }
  }

  // ── Fallback client-side : si le backend race-predictions n'a pas pu fournir
  // de données mais qu'on a un VO2max, on calcule les prédictions ici
  if (racePredictions.source === 'unavailable' && userStats.vo2MaxRunning && userStats.vo2MaxRunning > 20) {
    racePredictions = computeRacePredictionsFromVo2max(userStats.vo2MaxRunning)
    console.log('[Garmin] Race predictions computed client-side from VO2max:', racePredictions)
  }

  console.log('[Garmin] Sync complete:', {
    vo2Max: userStats.vo2MaxRunning,
    racePredictions: racePredictions.source,
    restingHR,
    hrv,
  })

  return { userStats, racePredictions, restingHR, hrv }
}

// ─── Construire le profil coureur depuis les stats Garmin directes ────────────

/**
 * Construit (ou met à jour) un RunnerProfile à partir des données Garmin
 * sans nécessiter l'historique d'activités.
 *
 * Priorités :
 * 1. Prédictions de course Garmin → vitesse de base (plus fiable car calibrée par Firstbeat)
 * 2. VO2max → fallback si pas de prédictions
 * 3. Valeurs du profil existant si aucune donnée Garmin disponible
 */
export function buildProfileFromGarminStats(
  syncResult: GarminSyncResult,
  baseProfile: RunnerProfile,
): RunnerProfile {
  const { userStats, racePredictions, restingHR } = syncResult

  // ── Vitesse de base sur plat
  // Priorité 1 : depuis la prédiction 10K de Garmin (distance la plus représentative)
  // Formule : v10K correspond à ~93% vVO2max → vitesse "course de base" ≈ v10K / 0.87
  //           (on remonte légèrement pour avoir la vitesse à 100% effort, ni sprint ni endurance)
  let flatSpeed = baseProfile.speedModel.flatSpeed
  let basePaceSecPerKm = baseProfile.basePaceSecPerKm

  if (racePredictions.tenK && racePredictions.tenK > 0) {
    const v10K = 10000 / racePredictions.tenK // m/s
    flatSpeed = v10K / 0.87   // remonte vers vVO2max depuis vitesse 10K
    basePaceSecPerKm = Math.round(1000 / v10K)
    console.log('[buildProfile] flatSpeed from 10K prediction:', { v10K, flatSpeed, basePaceSecPerKm })
  } else if (racePredictions.fiveK && racePredictions.fiveK > 0) {
    const v5K = 5000 / racePredictions.fiveK
    flatSpeed = v5K / 0.92
    basePaceSecPerKm = Math.round(1000 / (flatSpeed * 0.87))
    console.log('[buildProfile] flatSpeed from 5K prediction:', { v5K, flatSpeed })
  } else if (userStats.vo2MaxRunning && userStats.vo2MaxRunning > 20) {
    const vVo2max = vVo2maxFromVo2max(userStats.vo2MaxRunning)
    flatSpeed = vVo2max * 0.87  // vitesse à ~87% vVO2max (allure marathon ~80%, 10K ~90%, plat moyen ≈ 87%)
    basePaceSecPerKm = Math.round(1000 / (vVo2max * 0.90))
    console.log('[buildProfile] flatSpeed from VO2max:', { vo2max: userStats.vo2MaxRunning, vVo2max, flatSpeed })
  }

  // ── Seuil lactate (vitesse)
  // L'API Garmin renvoie parfois la valeur ×10 (bug connu)
  let lactateThresholdSpeed = userStats.lactateThresholdSpeed
  if (lactateThresholdSpeed && lactateThresholdSpeed > 0 && lactateThresholdSpeed < 1.0) {
    lactateThresholdSpeed = lactateThresholdSpeed * 10
  }

  // ── FC max : inchangée (pas de source directe Garmin — utiliser le profil existant)
  // ── FC repos : depuis wellness si disponible
  const updatedRestingHR = restingHR ?? baseProfile.heartRateModel.restingHR

  // ── FC seuil lactate
  const lactateThresholdHR = userStats.lactateThresholdHeartRate
    ?? baseProfile.heartRateModel.lactateThresholdHR

  return {
    ...baseProfile,
    calibratedAt: new Date(),
    calibrationSource: 'garmin',
    basePaceSecPerKm,
    ...(userStats.vo2MaxRunning && { vo2Max: userStats.vo2MaxRunning }),
    ...(lactateThresholdSpeed && { lactateThresholdSpeed }),

    speedModel: {
      ...baseProfile.speedModel,
      flatSpeed,
    },

    heartRateModel: {
      ...baseProfile.heartRateModel,
      restingHR: updatedRestingHR,
      ...(lactateThresholdHR && { lactateThresholdHR }),
    },
  }
}
