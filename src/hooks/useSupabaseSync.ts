/**
 * Hook de chargement initial des données depuis Supabase
 * - Authentifié : charge profil + connexion Garmin depuis la DB
 * - Anonyme : charge le profil demo
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import { useGarminStore } from '@/stores/garminStore'
import {
  getRunnerProfile,
  getDemoRunnerProfile,
  getGarminConnection,
} from '@/services/supabase.service'

export function useSupabaseSync() {
  const user = useAuthStore((s) => s.user)
  const loading = useAuthStore((s) => s.loading)
  const setProfile = useAppStore((s) => s.setProfile)
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
      // Anonyme ou logout : charger le profil demo
      console.log('[SupabaseSync] Anonymous user — loading demo profile')
      getDemoRunnerProfile()
        .then((demoProfile) => {
          if (demoProfile) setProfile(demoProfile)
        })
        .catch((err) => console.error('[SupabaseSync] Error loading demo profile:', err))
      return
    }

    // Utilisateur authentifié : charger ses données DB, fallback demo
    console.log('[SupabaseSync] Authenticated user:', user.id, '— loading from DB')
    Promise.all([
      getRunnerProfile(user.id),
      getGarminConnection(user.id),
    ]).then(async ([dbProfile, garmin]) => {
      console.log('[SupabaseSync] DB data loaded:', {
        profile: !!dbProfile,
        hasGarmin: !!garmin,
      })

      if (dbProfile) {
        setProfile(dbProfile)
      } else {
        // Pas de profil en DB → charger le demo comme fallback
        const demoProfile = await getDemoRunnerProfile()
        if (demoProfile) setProfile(demoProfile)
      }

      // Restaurer la connexion Garmin
      if (garmin) {
        console.log('[SupabaseSync] Restoring Garmin connection')
        setGarminTokens(garmin.oauth1, garmin.oauth2, garmin.profile)
      }
    }).catch((err) =>
      console.error('[SupabaseSync] Error loading user data:', err),
    )
  }, [loading, user, setProfile, setGarminTokens])
}
