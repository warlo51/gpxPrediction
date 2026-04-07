/**
 * Hook de chargement initial des données depuis Supabase
 * - Premium : charge profil + sessions + connexions depuis la DB
 * - Non-premium ou anonyme : charge les données demo
 *
 * La sauvegarde en DB se fait directement dans les composants d'import
 * (GarminConnect) après chaque import réussi.
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { useGarminStore } from '@/stores/garminStore'
import {
  getRunnerProfile,
  getDemoRunnerProfile,
  getSessions,
  getDemoSessions,
  getGarminConnection,
} from '@/services/supabase.service'

export function useSupabaseSync() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const setProfile = useAppStore((s) => s.setProfile)
  const addSession = useAppStore((s) => s.addSession)
  const clearSessions = useAppStore((s) => s.clearSessions)
  const setGarminTokens = useGarminStore((s) => s.setTokens)

  // Track quel user a été synchronisé pour relancer si login/logout
  const lastSyncedUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (loading) return

    const currentUserId = user?.id ?? null
    // Ne pas re-sync si c'est le même utilisateur
    if (lastSyncedUserId.current === currentUserId) return
    lastSyncedUserId.current = currentUserId

    if (!user) {
      // Anonyme ou logout : charger les données demo
      console.log('[SupabaseSync] Anonymous user — loading demo data')
      clearSessions()
      Promise.all([
        getDemoRunnerProfile(),
        getDemoSessions(),
      ]).then(([demoProfile, demoSessions]) => {
        console.log('[SupabaseSync] Demo data loaded:', { profile: !!demoProfile, sessions: demoSessions.length })
        if (demoProfile) setProfile(demoProfile)
        for (const s of demoSessions) addSession(s)
      }).catch((err) =>
        console.error('[SupabaseSync] Error loading demo data:', err),
      )
      return
    }

    // Utilisateur authentifié : charger ses données DB, fallback demo
    console.log('[SupabaseSync] Authenticated user:', user.id, '— loading from DB')
    Promise.all([
      getRunnerProfile(user.id),
      getSessions(user.id),
      getGarminConnection(user.id),
    ]).then(async ([dbProfile, dbSessions, garmin]) => {
      console.log('[SupabaseSync] DB data loaded:', {
        profile: !!dbProfile,
        sessions: dbSessions.length,
        sessionSources: dbSessions.reduce((acc, s) => { acc[s.source] = (acc[s.source] ?? 0) + 1; return acc }, {} as Record<string, number>),
        hasGarmin: !!garmin,
      })

      if (dbSessions.length > 0) {
        // L'utilisateur a ses propres données → les utiliser
        clearSessions()
        if (dbProfile) {
          console.log('[SupabaseSync] Setting profile from DB:', { vo2Max: dbProfile.vo2Max, sessionCount: dbProfile.sessionCount })
          setProfile(dbProfile)
        }
        for (const s of dbSessions) addSession(s)
        console.log('[SupabaseSync] Sessions loaded from DB:', dbSessions.length)
      } else {
        // Pas de données en DB → charger le demo comme fallback
        console.log('[SupabaseSync] No sessions in DB — falling back to demo data')
        const [demoProfile, demoSessions] = await Promise.all([
          getDemoRunnerProfile(),
          getDemoSessions(),
        ])
        if (demoProfile) setProfile(demoProfile)
        for (const s of demoSessions) addSession(s)
      }

      // Restaurer la connexion Garmin
      if (garmin) {
        console.log('[SupabaseSync] Restoring Garmin connection')
        setGarminTokens(garmin.oauth1, garmin.oauth2, garmin.profile)
      }
    }).catch((err) =>
      console.error('[SupabaseSync] Error loading user data:', err),
    )
  }, [loading, user, setProfile, addSession, clearSessions, setGarminTokens])
}
