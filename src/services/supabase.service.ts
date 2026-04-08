/**
 * Service Supabase — CRUD pour profiles, runner_profiles, gpx_tracks
 */

import { supabase } from '@/lib/supabase'
import type { RunnerProfile, GpxTrack, TrainingSession } from '@/types'
import type { GarminOAuth1Token, GarminOAuth2Token, GarminProfile } from '@/stores/garminStore'

// ─── Profil utilisateur (email, poids, âge) ─────────────────────────────────

export type UserProfile = {
  email: string | null
  weight_kg: number | null
  age: number | null
  resting_hr: number | null
}

export async function upsertUserProfile(
  userId: string,
  data: Partial<UserProfile>,
) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...data, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, weight_kg, age')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null
  return { ...data, resting_hr: (data as Record<string, unknown>).resting_hr as number | null ?? null }
}

// ─── Profil coureur demo (pour utilisateurs anonymes) ────────────────────────

export async function getDemoRunnerProfile(): Promise<RunnerProfile | null> {
  const { data, error } = await supabase
    .from('runner_profiles')
    .select('data')
    .eq('name', '__demo__')
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return (data?.data as RunnerProfile) ?? null
}

// ─── Profil coureur calibré ──────────────────────────────────────────────────

export async function saveRunnerProfile(userId: string, profile: RunnerProfile) {
  // Upsert : un seul profil par user pour l'instant
  const { data: existing } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('runner_profiles')
      .update({
        name: profile.name,
        data: profile,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('runner_profiles')
      .insert({
        user_id: userId,
        name: profile.name,
        data: profile,
      })
    if (error) throw error
  }
}

export async function getRunnerProfile(userId: string): Promise<RunnerProfile | null> {
  const { data, error } = await supabase
    .from('runner_profiles')
    .select('data')
    .eq('user_id', userId)
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return (data?.data as RunnerProfile) ?? null
}

// ─── Tracks GPX ──────────────────────────────────────────────────────────────

export type TrackProfile = 'route' | 'trail' | 'mixed'

export async function saveGpxTrack(
  userId: string,
  track: GpxTrack,
  fileHash: string,
  trackProfile: TrackProfile,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('gpx_tracks')
    .upsert(
      {
        user_id: userId,
        name: track.name,
        gpx_data: track,
        total_distance: track.totalDistance,
        total_elevation_gain: track.totalElevationGain,
        file_hash: fileHash,
        track_profile: trackProfile,
      },
      { onConflict: 'user_id,file_hash', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export type GpxTrackRow = {
  id: string
  name: string
  gpx_data: GpxTrack
  total_distance: number
  total_elevation_gain: number
  track_profile: TrackProfile | null
  file_hash: string | null
  created_at: string
}

export async function getGpxTracks(userId: string): Promise<GpxTrackRow[]> {
  const { data, error } = await supabase
    .from('gpx_tracks')
    .select('id, name, gpx_data, total_distance, total_elevation_gain, track_profile, file_hash, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as GpxTrackRow[]
}

export async function getGlobalGpxCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_gpx_tracks_count')
  if (error) throw error
  return (data as number) ?? 0
}

export async function deleteGpxTrack(trackId: string) {
  const { error } = await supabase
    .from('gpx_tracks')
    .delete()
    .eq('id', trackId)
  if (error) throw error
}

// ─── Sessions d'entrainement ─────────────────────────────────────────────────

export async function saveSessions(userId: string, sessions: TrainingSession[]) {
  if (sessions.length === 0) return

  const rows = sessions.map((s) => ({
    id: s.id,
    user_id: userId,
    name: s.name,
    date: s.date,
    source: s.source,
    distance: s.distance,
    duration: s.duration,
    elevation_gain: s.elevationGain,
    avg_pace: s.avgPace,
    avg_heart_rate: s.avgHeartRate ?? null,
    max_heart_rate: s.maxHeartRate ?? null,
    streams: s.streams ?? null,
  }))

  // Upsert par batch de 5 pour éviter de dépasser la limite de payload Supabase
  // (les streams FIT Garmin peuvent être très volumineux)
  const BATCH_SIZE = 5
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('training_sessions')
      .upsert(batch, { onConflict: 'id' })
    if (error) throw error
  }
}

export async function getSessions(userId: string): Promise<TrainingSession[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    date: new Date(r.date),
    source: r.source,
    distance: r.distance,
    duration: r.duration,
    elevationGain: r.elevation_gain,
    avgPace: r.avg_pace,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    maxHeartRate: r.max_heart_rate ?? undefined,
    streams: r.streams ?? undefined,
  }))
}

export async function getDemoSessions(): Promise<TrainingSession[]> {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .is('user_id', null)
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    date: new Date(r.date),
    source: r.source,
    distance: r.distance,
    duration: r.duration,
    elevationGain: r.elevation_gain,
    avgPace: r.avg_pace,
    avgHeartRate: r.avg_heart_rate ?? undefined,
    maxHeartRate: r.max_heart_rate ?? undefined,
    streams: r.streams ?? undefined,
  }))
}

// ─── Connexions Garmin ───────────────────────────────────────────────────────

export type GarminConnectionData = {
  oauth1: GarminOAuth1Token
  oauth2: GarminOAuth2Token
  profile: GarminProfile
}

export async function saveGarminConnection(userId: string, data: GarminConnectionData) {
  const { error } = await supabase
    .from('connections')
    .upsert({
      user_id: userId,
      provider: 'garmin',
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
  if (error) throw error
}

export async function getGarminConnection(userId: string): Promise<GarminConnectionData | null> {
  const { data, error } = await supabase
    .from('connections')
    .select('data')
    .eq('user_id', userId)
    .eq('provider', 'garmin')
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return (data?.data as GarminConnectionData) ?? null
}

export async function deleteGarminConnection(userId: string) {
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'garmin')
  if (error) throw error
}
