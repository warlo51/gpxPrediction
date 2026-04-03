/**
 * Hook de sauvegarde GPX
 * Calcule le hash du fichier, infère le profil et sauvegarde en DB.
 * Silencieux si l'utilisateur n'est pas connecté.
 */

import { useCallback } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { saveGpxTrack } from '@/services/supabase.service'
import { computeFileHash, inferTrackProfile } from '@/services/gpxParser.service'
import type { GpxTrack } from '@/types'

export function useGpxSave() {
  const userId = useAuthStore((s) => s.user?.id)

  const saveTrack = useCallback(async (file: File, track: GpxTrack): Promise<string | null> => {
    if (!userId) return null
    const [hash, profile] = await Promise.all([
      computeFileHash(file),
      Promise.resolve(inferTrackProfile(track)),
    ])
    return saveGpxTrack(userId, track, hash, profile)
  }, [userId])

  return { saveTrack }
}
