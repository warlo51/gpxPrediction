/**
 * Store Strava — persisté dans localStorage par utilisateur
 * Stocke les credentials saisis par l'utilisateur + le token OAuth
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StravaToken, StravaAthlete, StravaConnectionState } from '@/types'

export type StravaCredentials = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

type StravaState = {
  // Credentials saisis par l'utilisateur (persistés)
  credentials: StravaCredentials | null
  setCredentials: (creds: StravaCredentials) => void
  clearCredentials: () => void

  // Token OAuth (persisté)
  token: StravaToken | null
  setToken: (token: StravaToken | null) => void

  // Athlète connecté (persisté)
  athlete: StravaAthlete | null
  setAthlete: (athlete: StravaAthlete | null) => void

  // État de connexion calculé
  connectionState: StravaConnectionState

  // Déconnexion complète
  disconnect: () => void
}

export const useStravaStore = create<StravaState>()(
  persist(
    (set, get) => ({
      credentials: null,
      setCredentials: (creds) => {
        set({ credentials: creds })
      },
      clearCredentials: () => set({ credentials: null }),

      token: null,
      setToken: (token) => set({ token }),

      athlete: null,
      setAthlete: (athlete) => set({ athlete }),

      get connectionState(): StravaConnectionState {
        const { token, athlete } = get()
        if (athlete && token) {
          return { status: 'connected', athlete, token }
        }
        return { status: 'disconnected' }
      },

      disconnect: () =>
        set({ token: null, athlete: null }),
    }),
    {
      name: 'strava-store',
      partialize: (state) => ({
        credentials: state.credentials,
        token: state.token,
        athlete: state.athlete,
      }),
    },
  ),
)
