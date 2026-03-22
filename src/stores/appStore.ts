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
    uphillDecayFactor: 0.08,     // -8% de vitesse par % de pente
    downhillBoostFactor: 0.03,   // +3% de vitesse par % de descente
    walkingThresholdGrade: 20,   // marche au-delà de 20%
    walkingSpeed: 1.2,           // ~4.3 km/h en marche
  },

  fatigueModel: {
    hourlyDecayFactor: 0.03,       // -3% par heure
    downhillRecoveryFactor: 0.5,   // récupération à 50% en descente
    fatigueThresholdKm: 30,        // fatigue accrue après 30 km
    lateFatigueMultiplier: 1.5,    // x1.5 la fatigue au-delà
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
        set((state) => ({ sessions: [...state.sessions, session] })),
      removeSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
      clearSessions: () => set({ sessions: [] }),
    }),
    {
      name: 'gpx-predictor-store',
      // On ne persiste pas le tracé GPX (trop lourd)
      partialize: (state) => ({
        profile: state.profile,
        sessions: state.sessions,
      }),
    },
  ),
)
