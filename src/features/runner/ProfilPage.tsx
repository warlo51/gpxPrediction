/**
 * Page Profil Runner — MMA-33
 * Fusion Profil + Settings :
 *  - Lecture seule : données physiologiques synchronisées depuis Garmin
 *  - Édition      : paramètres personnels (poids, FC, allure par défaut, unités)
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import { GarminConnect } from '@/features/history/GarminConnect'
import { PremiumGate } from '@/components/PremiumGate'
import type { RunnerProfile } from '@/types/runner.types'

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

function vo2maxPercentile(vo2max: number): string {
  if (vo2max >= 65) return 'TOP 1%'
  if (vo2max >= 60) return 'TOP 3%'
  if (vo2max >= 55) return 'TOP 5%'
  if (vo2max >= 50) return 'TOP 15%'
  if (vo2max >= 45) return 'TOP 30%'
  if (vo2max >= 40) return 'TOP 50%'
  return ''
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

// ─── Bloc lecture seule (Garmin) ─────────────────────────────────────────────

function Vo2Card({ vo2max }: { vo2max?: number }) {
  const { t } = useTranslation()

  if (!vo2max || vo2max <= 0) {
    return (
      <Card className="flex flex-col justify-between min-h-[180px]">
        <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[#64748b] mb-3">
          {t('profile.vo2max')}
        </p>
        <p className="text-[18px] font-black text-[#cbd5e1] mb-1">—</p>
        <p className="text-[11px] text-[#64748b]">
          {t('profile.noGarminData')}
        </p>
      </Card>
    )
  }

  const percentile = vo2maxPercentile(vo2max)

  return (
    <Card className="flex flex-col justify-between min-h-[180px]">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[#64748b]">
          {t('profile.vo2max')}
        </p>
        {percentile && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#ff6d00', color: '#ffffff' }}>
            {percentile}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-[64px] font-black leading-none text-[#1a2033]">{Math.round(vo2max)}</span>
        <span className="text-[12px] font-medium text-[#64748b] mb-2">mL/kg/min</span>
      </div>
      <p className="text-[11px] text-[#64748b] mt-3">
        {t('profile.garminFirstbeat')}
      </p>
    </Card>
  )
}

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

function GarminStatsCard({ profile }: { profile: RunnerProfile }) {
  const { t } = useTranslation()
  const { lactateThresholdSpeed, heartRateModel } = profile
  const { lactateThresholdHR } = heartRateModel

  // Normalisation de la vitesse au seuil (parfois renvoyée ×10 par l'API Garmin)
  const ltSpeed = lactateThresholdSpeed && lactateThresholdSpeed < 1.0
    ? lactateThresholdSpeed * 10
    : lactateThresholdSpeed
  const lactatePaceStr = ltSpeed && ltSpeed > 0 ? formatPaceSec(1000 / ltSpeed) : undefined

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-[#ff6d00]" />
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-[#1a2033]">
          {t('profile.garminProfile')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={t('profile.lactateThreshold')}
          value={lactatePaceStr}
          unit="/KM"
          available={!!lactatePaceStr}
          hint={t('profile.noGarminData')}
        />
        <StatTile
          label={t('profile.lactateThresholdHR')}
          value={lactateThresholdHR ? String(Math.round(lactateThresholdHR)) : undefined}
          unit="BPM"
          available={!!lactateThresholdHR}
          hint={t('profile.noGarminData')}
        />
      </div>
    </Card>
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

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  suffix: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 px-3 py-1.5 rounded-lg text-[13px] text-right font-medium outline-none
                   focus:ring-2 focus:ring-[#ff6d00]/30"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
      />
      <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{suffix}</span>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ProfilPage() {
  const { t } = useTranslation()
  const { profile, updateProfile } = useAppStore()
  const user = useAuthStore(s => s.user)

  const [unit, setUnit] = useState<DistanceUnit>('km')
  const [saved, setSaved] = useState(false)

  const garminConnected = profile.calibrationSource === 'garmin'
  const runnerName = (profile.name || 'Trail Runner').toUpperCase()
  const level = profile.vo2Max ? vo2maxLevel(profile.vo2Max) : 'Beginner'

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

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
        </div>
      </div>

      {/* ── Section : Physiologie (Garmin) ── */}
      <div>
        <SectionTitle>{t('profile.physiologySection')}</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Vo2Card vo2max={profile.vo2Max} />
          <GarminStatsCard profile={profile} />
        </div>
        {!garminConnected && !profile.vo2Max && (
          <p className="mt-3 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('profile.syncWithGarmin')}
          </p>
        )}
      </div>

      {/* ── Section : Profil physique ── */}
      <div>
        <SectionTitle>{t('settings.physicalProfile')}</SectionTitle>
        <Card>
          <div className="flex flex-col gap-5">
            <FieldRow
              label={t('settings.weight')}
              hint={t('settings.weightHint')}
            >
              <NumberInput
                value={profile.energyModel.weightKg}
                onChange={v => updateProfile({
                  energyModel: { ...profile.energyModel, weightKg: v }
                })}
                min={30}
                max={200}
                suffix="kg"
              />
            </FieldRow>

            <div className="h-px" style={{ background: 'var(--color-border)' }} />

            <FieldRow
              label={t('settings.restingHR')}
              hint={t('settings.restingHRHint')}
            >
              <NumberInput
                value={profile.heartRateModel.restingHR}
                onChange={v => updateProfile({
                  heartRateModel: { ...profile.heartRateModel, restingHR: v }
                })}
                min={30}
                max={100}
                suffix="bpm"
              />
            </FieldRow>

            <div className="h-px" style={{ background: 'var(--color-border)' }} />

            <FieldRow
              label={t('settings.maxHR')}
              hint={t('settings.maxHRHint')}
            >
              <NumberInput
                value={profile.heartRateModel.maxHR}
                onChange={v => updateProfile({
                  heartRateModel: { ...profile.heartRateModel, maxHR: v }
                })}
                min={100}
                max={220}
                suffix="bpm"
              />
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

      {/* ── Section : Connexions (Garmin) — uniquement si utilisateur connecté ── */}
      {user && (
        <div>
          <SectionTitle>{t('account.connections')}</SectionTitle>
          <PremiumGate>
            <GarminConnect />
          </PremiumGate>
        </div>
      )}

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
