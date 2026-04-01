/**
 * Hook de chargement initial des données depuis Supabase
 * - Premium : charge profil + sessions + connexions depuis la DB
 * - Non-premium ou anonyme : charge les données demo
 *
 * La sauvegarde en DB se fait directement dans les composants d'import
 * (StravaConnect, GarminConnect) après chaque import réussi.
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { useGarminStore } from '@/stores/garminStore'
import {
  getRunnerProfile,
  getDemoRunnerProfile,
  getSessions,
  getDemoSessions,
  getStravaConnection,
  getGarminConnection,
} from '@/services/supabase.service'

export function useSupabaseSync() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const isPremium = useAuthStore((s) => s.isPremium)
  const setProfile = useAppStore((s) => s.setProfile)
  const addSession = useAppStore((s) => s.addSession)
  const setStravaCredentials = useStravaStore((s) => s.setCredentials)
  const setStravaToken = useStravaStore((s) => s.setToken)
  const setStravaAthlete = useStravaStore((s) => s.setAthlete)
  const setGarminTokens = useGarminStore((s) => s.setTokens)

  const initialLoadDone = useRef(false)

  // ── Non-premium (anonyme ou connecte sans premium) : charger donnees demo ──
  useEffect(() => {
    if (loading || initialLoadDone.current) return
    if (user && isPremium) return
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
  }, [loading, user, isPremium, setProfile, addSession])

  // ── Premium : charger profil + sessions + connexions depuis la DB ──
  useEffect(() => {
    if (!user || !isPremium || initialLoadDone.current) return
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
    }).catch((err) =>
      console.error('Erreur chargement donnees premium:', err),
    )
  }, [user, isPremium, setProfile, addSession, setStravaCredentials, setStravaToken, setStravaAthlete, setGarminTokens])
}
