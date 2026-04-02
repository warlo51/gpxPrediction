/**
 * Store global Zustand
 * Gère le profil coureur, le tracé GPX chargé et l'historique des séances.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RunnerProfile, GpxTrack, TrainingSession } from '@/types'

// ─── Profil par défaut ────────────────────────────────────────────────────────

export const DEFAULT_RUNNER_PROFILE: RunnerProfile = {
  id: 'default',
  name: 'Mon profil',
  calibratedAt: new Date(),
  sessionCount: 0,

  basePaceSecPerKm: 360,   // 6:00/km sur plat
  baseHeartRate: 145,
  enduranceScore: 0.6,

  speedModel: {
    flatSpeed: 2.78,             // ~10 km/h
    uphillDecayFactor: 0.045,    // modèle exponentiel : exp(-0.045*grade) → pente 10% = 64% vitesse
    downhillBoostFactor: 0.02,   // +2% de vitesse par % de descente (conservateur)
    walkingThresholdGrade: 25,   // marche au-delà de 25% (réaliste trail)
    walkingSpeed: 1.0,           // ~3.6 km/h en marche
  },

  fatigueModel: {
    hourlyDecayFactor: 0.015,           // -1.5% par heure (réaliste sur 2-4h)
    downhillRecoveryFactor: 0.5,        // récupération cardiovasculaire en descente
    fatigueThresholdKm: 35,             // fatigue accrue après 35 km
    lateFatigueMultiplier: 1.4,
    elevationFatigueFactorPer1000m: 0.008,  // +0.8% de fatigue par 1000m D+ cumulé
    downhillFatigueFactorPer1000m: 0.012,   // +1.2% de fatigue quad par 1000m D- cumulé
  },

  heartRateModel: {
    restingHR: 50,
    maxHR: 185,
    baseHR: 145,
    gradeHRFactor: 1.2,            // +1.2 bpm par % de pente
    cardiacDriftBpmPerHour: 3,     // +3 bpm/heure de dérive
  },

  energyModel: {
    weightKg: 70,
    flatCaloriesPerKm: 65,         // kcal/km sur plat
    uphillCaloriesPer100m: 25,     // kcal/100m D+
  },
}

// ─── Types du store ──────────────────────────────────────────────────────────

type AppState = {
  // Profil coureur
  profile: RunnerProfile
  setProfile: (profile: RunnerProfile) => void
  updateProfile: (partial: Partial<RunnerProfile>) => void

  // Tracé GPX chargé
  track: GpxTrack | null
  setTrack: (track: GpxTrack | null) => void

  // Segment survolé (synchronisation carte ↔ graphique)
  hoveredSegmentId: string | null
  setHoveredSegmentId: (id: string | null) => void

  // Historique des séances
  sessions: TrainingSession[]
  addSession: (session: TrainingSession) => void
  removeSession: (id: string) => void
  clearSessions: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Profil coureur
      profile: DEFAULT_RUNNER_PROFILE,
      setProfile: (profile) => set({ profile }),
      updateProfile: (partial) =>
        set((state) => ({ profile: { ...state.profile, ...partial } })),

      // ── GPX
      track: null,
      setTrack: (track) => set({ track }),

      // ── Segment survolé
      hoveredSegmentId: null,
      setHoveredSegmentId: (id) => set({ hoveredSegmentId: id }),

      // ── Historique
      sessions: [],
      addSession: (session) =>
        set((state) => {
          if (state.sessions.some((s) => s.id === session.id)) return state
          // Dédoublonnage par date (à la minute près) : Garmin prioritaire
          const sessionMinute = new Date(session.date).setSeconds(0, 0)
          const duplicate = state.sessions.find((s) => {
            const sMinute = new Date(s.date).setSeconds(0, 0)
            return Math.abs(sMinute - sessionMinute) < 60_000
          })
          if (duplicate) {
            const isNewGarmin = session.source === 'garmin'
            const isOldGarmin = duplicate.source === 'garmin'
            if (isOldGarmin && !isNewGarmin) return state // garder Garmin existant
            // Remplacer par la nouvelle (Garmin prioritaire, ou même source = mise à jour)
            return { sessions: state.sessions.map((s) => s.id === duplicate.id ? session : s) }
          }
          return { sessions: [...state.sessions, session] }
        }),
      removeSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
      clearSessions: () => set({ sessions: [] }),
    }),
    {
      name: 'gpx-predictor-store',
      partialize: (state) => ({
        profile: state.profile,
        sessions: state.sessions,
      }),
      // Migration : corriger les anciens profils avec uphillDecayFactor trop élevé (modèle linéaire)
      // et injecter les nouveaux champs manquants pour les profils existants.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Dédoublonner les sessions par date (à la minute près), Garmin prioritaire
        if (state.sessions.length > 0) {
          const seen = new Map<number, TrainingSession>()
          for (const s of state.sessions) {
            const minute = new Date(s.date).setSeconds(0, 0)
            const existing = seen.get(minute)
            if (!existing || (s.source === 'garmin' && existing.source !== 'garmin')) {
              seen.set(minute, s)
            }
          }
          if (seen.size < state.sessions.length) {
            state.sessions = Array.from(seen.values())
          }
        }
        if (state.profile.speedModel.uphillDecayFactor >= 0.07) {
          state.profile = {
            ...state.profile,
            speedModel: {
              ...state.profile.speedModel,
              uphillDecayFactor: 0.045,
              downhillBoostFactor: Math.min(state.profile.speedModel.downhillBoostFactor, 0.025),
              walkingThresholdGrade: Math.max(state.profile.speedModel.walkingThresholdGrade, 22),
            },
            fatigueModel: {
              ...state.profile.fatigueModel,
              hourlyDecayFactor: Math.min(state.profile.fatigueModel.hourlyDecayFactor, 0.02),
            },
          }
        }
        // Injecter les nouveaux champs de fatigue si absents (migration v2)
        if (state.profile.fatigueModel.elevationFatigueFactorPer1000m === undefined) {
          state.profile = {
            ...state.profile,
            fatigueModel: {
              ...state.profile.fatigueModel,
              elevationFatigueFactorPer1000m: DEFAULT_RUNNER_PROFILE.fatigueModel.elevationFatigueFactorPer1000m,
              downhillFatigueFactorPer1000m: DEFAULT_RUNNER_PROFILE.fatigueModel.downhillFatigueFactorPer1000m,
            },
          }
        }
      },
    },
  ),
)
