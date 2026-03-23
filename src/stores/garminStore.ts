/**
 * Store Zustand — connexion Garmin Connect
 * Persiste les tokens OAuth1/2 dans localStorage (jamais le mot de passe)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type GarminOAuth1Token = {
  oauth_token: string
  oauth_token_secret: string
  [key: string]: unknown
}

export type GarminOAuth2Token = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  [key: string]: unknown
}

export type GarminProfile = {
  displayName: string
  profileImageUrl: string | null
}

type GarminState = {
  oauth1: GarminOAuth1Token | null
  oauth2: GarminOAuth2Token | null
  profile: GarminProfile | null
  setTokens: (oauth1: GarminOAuth1Token, oauth2: GarminOAuth2Token, profile: GarminProfile) => void
  disconnect: () => void
  isConnected: () => boolean
}

export const useGarminStore = create<GarminState>()(
  persist(
    (set, get) => ({
      oauth1: null,
      oauth2: null,
      profile: null,

      setTokens: (oauth1, oauth2, profile) => set({ oauth1, oauth2, profile }),
      disconnect: () => set({ oauth1: null, oauth2: null, profile: null }),
      isConnected: () => {
        const { oauth1, oauth2 } = get()
        return !!(oauth1 && oauth2)
      },
    }),
    {
      name: 'garmin-store',
      partialize: (state) => ({
        oauth1: state.oauth1,
        oauth2: state.oauth2,
        profile: state.profile,
      }),
    },
  ),
)
