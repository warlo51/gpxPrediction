/**
 * Hook de synchronisation automatique store → Supabase
 * - Utilisateur connecte : charge et sauvegarde profil + GPX + sessions + connexions
 * - Utilisateur anonyme : charge le profil demo + sessions demo
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { useGarminStore } from '@/stores/garminStore'
import {
  saveRunnerProfile,
  getRunnerProfile,
  getDemoRunnerProfile,
  saveGpxTrack,
  saveSessions,
  getSessions,
  getDemoSessions,
  saveStravaConnection,
  getStravaConnection,
  saveGarminConnection,
  getGarminConnection,
} from '@/services/supabase.service'

export function useSupabaseSync() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const profile = useAppStore((s) => s.profile)
  const track = useAppStore((s) => s.track)
  const sessions = useAppStore((s) => s.sessions)
  const setProfile = useAppStore((s) => s.setProfile)
  const addSession = useAppStore((s) => s.addSession)

  const stravaCredentials = useStravaStore((s) => s.credentials)
  const stravaToken = useStravaStore((s) => s.token)
  const stravaAthlete = useStravaStore((s) => s.athlete)
  const setStravaCredentials = useStravaStore((s) => s.setCredentials)
  const setStravaToken = useStravaStore((s) => s.setToken)
  const setStravaAthlete = useStravaStore((s) => s.setAthlete)

  const garminOauth1 = useGarminStore((s) => s.oauth1)
  const garminOauth2 = useGarminStore((s) => s.oauth2)
  const garminProfile = useGarminStore((s) => s.profile)
  const setGarminTokens = useGarminStore((s) => s.setTokens)

  const initialLoadDone = useRef(false)
  const prevProfileRef = useRef(profile)
  const prevTrackRef = useRef(track)
  const prevSessionsLenRef = useRef(sessions.length)
  const prevStravaRef = useRef({ stravaCredentials, stravaToken, stravaAthlete })
  const prevGarminRef = useRef({ garminOauth1, garminOauth2, garminProfile })

  // ── Anonyme : charger profil demo + sessions demo ──
  useEffect(() => {
    if (loading || user || initialLoadDone.current) return
    initialLoadDone.current = true

    Promise.all([
      getDemoRunnerProfile(),
      getDemoSessions(),
    ]).then(([demoProfile, demoSessions]) => {
      if (demoProfile) setProfile(demoProfile)
      for (const s of demoSessions) addSession(s)
    }).catch((err) =>
      console.error('Erreur chargement donnees demo:', err),
    )
  }, [loading, user, setProfile, addSession])

  // ── Connecte : charger profil + sessions + connexions ──
  useEffect(() => {
    if (!user) return
    initialLoadDone.current = true

    Promise.all([
      getRunnerProfile(user.id),
      getSessions(user.id),
      getStravaConnection(user.id),
      getGarminConnection(user.id),
    ]).then(([dbProfile, dbSessions, strava, garmin]) => {
      if (dbProfile) setProfile(dbProfile)
      for (const s of dbSessions) addSession(s)
      if (strava) {
        setStravaCredentials(strava.credentials)
        setStravaToken(strava.token)
        setStravaAthlete(strava.athlete)
      }
      if (garmin) {
        setGarminTokens(garmin.oauth1, garmin.oauth2, garmin.profile)
      }
    })
  }, [user, setProfile, addSession, setStravaCredentials, setStravaToken, setStravaAthlete, setGarminTokens])

  // ── Sync runner profile ──
  useEffect(() => {
    if (!user || !initialLoadDone.current) return
    if (prevProfileRef.current === profile) return
    prevProfileRef.current = profile
    if (profile.id === 'default' && profile.sessionCount === 0) return

    saveRunnerProfile(user.id, profile).catch((err) =>
      console.error('Erreur sync runner profile:', err),
    )
  }, [user, profile])

  // ── Sync GPX track ──
  useEffect(() => {
    if (!user || !track) return
    if (prevTrackRef.current === track) return
    prevTrackRef.current = track

    saveGpxTrack(user.id, track).catch((err) =>
      console.error('Erreur sync GPX track:', err),
    )
  }, [user, track])

  // ── Sync sessions ──
  useEffect(() => {
    if (!user || !initialLoadDone.current) return
    if (sessions.length <= prevSessionsLenRef.current) {
      prevSessionsLenRef.current = sessions.length
      return
    }
    prevSessionsLenRef.current = sessions.length

    saveSessions(user.id, sessions).catch((err) =>
      console.error('Erreur sync sessions:', err),
    )
  }, [user, sessions])

  // ── Sync Strava connection ──
  useEffect(() => {
    if (!user || !initialLoadDone.current) return
    const prev = prevStravaRef.current
    if (
      prev.stravaCredentials === stravaCredentials &&
      prev.stravaToken === stravaToken &&
      prev.stravaAthlete === stravaAthlete
    ) return
    prevStravaRef.current = { stravaCredentials, stravaToken, stravaAthlete }

    if (stravaCredentials && stravaToken && stravaAthlete) {
      saveStravaConnection(user.id, {
        credentials: stravaCredentials,
        token: stravaToken,
        athlete: stravaAthlete,
      }).catch((err) => console.error('Erreur sync Strava:', err))
    }
  }, [user, stravaCredentials, stravaToken, stravaAthlete])

  // ── Sync Garmin connection ──
  useEffect(() => {
    if (!user || !initialLoadDone.current) return
    const prev = prevGarminRef.current
    if (
      prev.garminOauth1 === garminOauth1 &&
      prev.garminOauth2 === garminOauth2 &&
      prev.garminProfile === garminProfile
    ) return
    prevGarminRef.current = { garminOauth1, garminOauth2, garminProfile }

    if (garminOauth1 && garminOauth2 && garminProfile) {
      saveGarminConnection(user.id, {
        oauth1: garminOauth1,
        oauth2: garminOauth2,
        profile: garminProfile,
      }).catch((err) => console.error('Erreur sync Garmin:', err))
    }
  }, [user, garminOauth1, garminOauth2, garminProfile])
}
