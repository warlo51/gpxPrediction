/**
 * Service Supabase — CRUD pour profiles, runner_profiles, gpx_tracks
 */

import { supabase } from '@/lib/supabase'
import type { RunnerProfile, GpxTrack, TrainingSession, StravaToken, StravaAthlete } from '@/types'
import type { StravaCredentials } from '@/stores/stravaStore'
import type { GarminOAuth1Token, GarminOAuth2Token, GarminProfile } from '@/stores/garminStore'

// ─── Profil utilisateur (email, poids, âge) ─────────────────────────────────

export type UserProfile = {
  email: string | null
  weight_kg: number | null
  age: number | null
  resting_hr: number | null
  is_premium: boolean
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
    .select('email, weight_kg, age, is_premium')
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

export async function saveGpxTrack(userId: string, track: GpxTrack) {
  const { data, error } = await supabase
    .from('gpx_tracks')
    .insert({
      user_id: userId,
      name: track.name,
      gpx_data: track,
      total_distance: track.totalDistance,
      total_elevation_gain: track.totalElevationGain,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export type GpxTrackRow = {
  id: string
  name: string
  gpx_data: GpxTrack
  total_distance: number
  total_elevation_gain: number
  created_at: string
}

export async function getGpxTracks(userId: string): Promise<GpxTrackRow[]> {
  const { data, error } = await supabase
    .from('gpx_tracks')
    .select('id, name, gpx_data, total_distance, total_elevation_gain, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as GpxTrackRow[]
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
    strava_id: s.stravaId ?? null,
    streams: s.streams ?? null,
  }))

  const { error } = await supabase
    .from('training_sessions')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw error
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
    stravaId: r.strava_id ?? undefined,
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

// ─── Connexions Strava / Garmin ──────────────────────────────────────────────

export type StravaConnectionData = {
  credentials: StravaCredentials
  token: StravaToken
  athlete: StravaAthlete
}

export type GarminConnectionData = {
  oauth1: GarminOAuth1Token
  oauth2: GarminOAuth2Token
  profile: GarminProfile
}

export async function saveStravaConnection(userId: string, data: StravaConnectionData) {
  const { error } = await supabase
    .from('connections')
    .upsert({
      user_id: userId,
      provider: 'strava',
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
  if (error) throw error
}

export async function getStravaConnection(userId: string): Promise<StravaConnectionData | null> {
  const { data, error } = await supabase
    .from('connections')
    .select('data')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return (data?.data as StravaConnectionData) ?? null
}

export async function deleteStravaConnection(userId: string) {
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'strava')
  if (error) throw error
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
