/**
 * Page Profil Runner — MMA-33
 * Fusion Profil + Settings :
 *  - Lecture seule : données physiologiques synchronisées depuis Garmin
 *  - Édition      : paramètres personnels (poids, FC, allure par défaut, unités)
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import { useGarminStore } from '@/stores/garminStore'
import { GarminLoginForm } from './GarminLoginForm'
import { syncGarminProfile, buildProfileFromGarminStats } from '@/services/garmin.service'
import { saveRunnerProfile } from '@/services/supabase.service'

type DistanceUnit = 'km' | 'miles'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPaceSec(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function vo2maxLevel(vo2max: number): string {
  if (vo2max >= 60) return 'Elite Level'
  if (vo2max >= 52) return 'Pro Level'
  if (vo2max >= 45) return 'Advanced'
  if (vo2max >= 38) return 'Amateur'
  return 'Beginner'
}

// ─── Sous-composants partagés ────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[1px] mb-4"
        style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </h2>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 ${className}`}
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      {children}
    </div>
  )
}

// ─── Stat tile (carte compacte) ──────────────────────────────────────────────

function StatTile({
  label,
  value,
  unit,
  available,
  hint,
}: {
  label: string
  value?: string
  unit?: string
  available: boolean
  hint?: string
}) {
  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
      <p className="text-[9px] tracking-[1px] uppercase text-[#64748b] mb-2">
        {label}
      </p>
      {available && value ? (
        <p className="text-[22px] font-black text-[#1a2033] leading-none">
          {value}
          {unit && <span className="text-[11px] font-medium text-[#64748b] ml-1">{unit}</span>}
        </p>
      ) : (
        <>
          <p className="text-[16px] font-black text-[#cbd5e1] leading-none">—</p>
          {hint && <p className="text-[9px] text-[#94a3b8] mt-1">{hint}</p>}
        </>
      )}
    </div>
  )
}

function ConnectionBadge({ label, connected }: { label: string; connected: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[#cbd5e1]'}`} />
      <div>
        <p className="text-[9px] tracking-[1px] uppercase text-[#64748b]">{label}</p>
        <p className={`text-[10px] font-bold tracking-[0.5px] uppercase ${connected ? 'text-[#22c55e]' : 'text-[#94a3b8]'}`}>
          {connected ? t('common.connected') : t('common.disconnected')}
        </p>
      </div>
    </div>
  )
}

// ─── Bloc éditable (paramètres personnels) ───────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
        {hint && <span className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ProfilPage() {
  const { t } = useTranslation()
  const {
    profile,
    setProfile,
    setGarminRacePredictions,
  } = useAppStore()
  const user = useAuthStore(s => s.user)
  const { oauth1, oauth2, isConnected: isGarminConnected } = useGarminStore()

  const [unit, setUnit] = useState<DistanceUnit>('km')
  const [weightKg, setWeightKg] = useState<number>(profile.energyModel.weightKg)
  const [walkingThreshold, setWalkingThreshold] = useState<number>(profile.speedModel.walkingThresholdGrade)
  const [saved, setSaved] = useState(false)

  // Resync locale si le profil est mis à jour depuis l'extérieur (sync Garmin…)
  useEffect(() => {
    setWeightKg(profile.energyModel.weightKg)
  }, [profile.energyModel.weightKg])
  useEffect(() => {
    setWalkingThreshold(profile.speedModel.walkingThresholdGrade)
  }, [profile.speedModel.walkingThresholdGrade])
  const [showGarminForm, setShowGarminForm] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const garminConnected = isGarminConnected() || profile.calibrationSource === 'garmin'
  const runnerName = (profile.name || 'Trail Runner').toUpperCase()
  const level = profile.vo2Max ? vo2maxLevel(profile.vo2Max) : 'Beginner'

  // 4 stats physiologiques (depuis profile) affichées en haut
  const ltSpeed = profile.lactateThresholdSpeed && profile.lactateThresholdSpeed < 1.0
    ? profile.lactateThresholdSpeed * 10
    : profile.lactateThresholdSpeed
  const lactatePaceStr = ltSpeed && ltSpeed > 0 ? formatPaceSec(1000 / ltSpeed) : undefined
  const basePaceStr = profile.basePaceSecPerKm > 0 ? formatPaceSec(profile.basePaceSecPerKm) : undefined

  const topStats: Array<{ label: string; value?: string; unit: string }> = [
    {
      label: t('profile.vo2max'),
      value: profile.vo2Max ? profile.vo2Max.toFixed(1) : undefined,
      unit: 'ml/kg/min',
    },
    {
      label: t('profile.lactateThresholdHR'),
      value: profile.heartRateModel.lactateThresholdHR
        ? String(Math.round(profile.heartRateModel.lactateThresholdHR))
        : undefined,
      unit: 'bpm',
    },
    {
      label: t('profile.restingHR'),
      value: profile.heartRateModel.restingHR ? String(profile.heartRateModel.restingHR) : undefined,
      unit: 'bpm',
    },
    {
      label: t('profile.lactateThreshold'),
      value: lactatePaceStr ?? basePaceStr,
      unit: '/km',
    },
  ]

  const handleSave = () => {
    const updatedProfile = {
      ...profile,
      energyModel: { ...profile.energyModel, weightKg },
      speedModel: { ...profile.speedModel, walkingThresholdGrade: walkingThreshold },
    }
    setProfile(updatedProfile)
    if (user) {
      saveRunnerProfile(user.id, updatedProfile).catch(err => {
        console.error('[ProfilPage] Error saving profile to DB:', err)
      })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSync = useCallback(async () => {
    if (!oauth1 || !oauth2) return
    setSyncing(true)
    setSyncError(null)
    try {
      const syncResult = await syncGarminProfile(oauth1, oauth2)
      const updatedProfile = buildProfileFromGarminStats(syncResult, profile)
      setProfile(updatedProfile)
      setGarminRacePredictions(syncResult.racePredictions)
      if (user) {
        saveRunnerProfile(user.id, updatedProfile).catch(err => {
          console.error('[GarminSync] Error saving profile to DB:', err)
        })
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setSyncing(false)
    }
  }, [oauth1, oauth2, profile, setProfile, setGarminRacePredictions, user])

  return (
    <div className="w-full flex flex-col gap-8 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div className="w-[90px] h-[90px] rounded-2xl overflow-hidden"
              style={{ background: 'var(--color-surface-2)', border: '2px solid rgba(255,109,0,0.3)' }}>
              <div className="w-full h-full flex items-center justify-center text-4xl">🏃</div>
            </div>
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${garminConnected ? 'bg-[#22c55e]' : 'bg-[#cbd5e1]'}`} />
          </div>

          <div>
            <h1 className="text-[32px] sm:text-[40px] font-black text-[#1a2033] leading-none tracking-tight mb-2">
              {runnerName}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[1px] uppercase"
                style={{ background: '#ff6d00', color: '#ffffff' }}>
                {level}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ConnectionBadge label="Garmin" connected={garminConnected} />
          {garminConnected && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              title={t('profile.syncGarmin')}
              aria-label={t('profile.syncGarmin')}
              className="w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1a2033"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={syncing ? 'animate-spin' : ''}
              >
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Erreur sync ── */}
      {syncError && (
        <div className="px-4 py-3 rounded-xl text-[12px] flex items-start gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#b91c1c' }}>
          <span className="shrink-0">⚠️</span>
          <span>{syncError}</span>
        </div>
      )}

      {/* ── Formulaire de connexion Garmin (inline) ── */}
      {showGarminForm && user && !garminConnected && (
        <div className="rounded-2xl p-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <GarminLoginForm onConnected={() => setShowGarminForm(false)} />
        </div>
      )}

      {/* ── 4 stats physiologiques (si Garmin connecté) ── */}
      {garminConnected ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {topStats.map(stat => (
            <StatTile
              key={stat.label}
              label={stat.label}
              value={stat.value}
              unit={stat.unit}
              available={!!stat.value}
              hint={t('profile.noGarminData')}
            />
          ))}
        </div>
      ) : !showGarminForm && user ? (
        /* ── Gros bouton Garmin Connexion (si pas connecté) ── */
        <button
          type="button"
          onClick={() => setShowGarminForm(true)}
          className="w-full flex flex-col items-center justify-center gap-4 py-12 px-6 rounded-2xl transition-all hover:brightness-110"
          style={{
            background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
            color: '#341100',
            boxShadow: '0 4px 24px rgba(255,109,0,0.25)',
          }}
        >
          <span className="text-5xl">🏔️</span>
          <span className="text-[22px] font-black tracking-tight">
            {t('profile.connectGarmin')}
          </span>
          <span className="text-[12px] font-medium opacity-80 max-w-md text-center">
            {t('profile.syncWithGarmin')}
          </span>
        </button>
      ) : null}

      {/* ── Section : Profil physique ── */}
      <div>
        <SectionTitle>{t('settings.physicalProfile')}</SectionTitle>
        <Card>
          <div className="flex flex-col gap-5">
            <FieldRow
              label={t('settings.weight')}
              hint={t('settings.weightHint')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={weightKg}
                  min={30}
                  max={150}
                  step={0.5}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!Number.isNaN(v)) setWeightKg(v)
                  }}
                  className="w-20 px-3 py-1.5 text-[13px] font-medium text-right rounded-lg outline-none transition-colors focus:border-[#ff6d00]"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <span className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>kg</span>
              </div>
            </FieldRow>

            <FieldRow
              label="Seuil de marche"
              hint="Pente à partir de laquelle vous marchez en course"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={walkingThreshold}
                  min={5}
                  max={50}
                  step={1}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!Number.isNaN(v)) setWalkingThreshold(v)
                  }}
                  className="w-20 px-3 py-1.5 text-[13px] font-medium text-right rounded-lg outline-none transition-colors focus:border-[#ff6d00]"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <span className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>% pente</span>
              </div>
            </FieldRow>
          </div>
        </Card>
      </div>

      {/* ── Section : Affichage ── */}
      <div>
        <SectionTitle>{t('settings.display')}</SectionTitle>
        <Card>
          <FieldRow
            label={t('settings.distanceUnit')}
            hint={t('settings.distanceUnitHint')}
          >
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              {(['km', 'miles'] as DistanceUnit[]).map(u => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className="px-4 py-1.5 text-[12px] font-medium transition-colors"
                  style={unit === u
                    ? { background: '#ff6d00', color: '#ffffff' }
                    : { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }
                  }
                >
                  {u}
                </button>
              ))}
            </div>
          </FieldRow>
        </Card>
      </div>

      {/* ── Save button ── */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110"
          style={{
            background: saved
              ? '#22c55e'
              : 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
            color: saved ? '#ffffff' : '#341100',
          }}
        >
          {saved ? t('settings.saved') : t('settings.save')}
        </button>
      </div>

    </div>
  )
}
