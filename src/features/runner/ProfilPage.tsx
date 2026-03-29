/**
 * Page Profil Runner — MMA-11
 * Design fidèle à la maquette Figma.
 */

import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { StravaConnect } from '@/features/strava/StravaConnect'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPaceSec(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, accent = '#ff6d00', progress,
}: {
  label: string
  value: string
  unit: string
  accent?: string
  progress?: number // 0–100
}) {
  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.5)] mb-3">
        {label}
      </p>
      <div className="flex items-end gap-2 mb-4">
        <span className="text-[48px] font-black leading-none text-white">{value}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-[1px] uppercase"
          style={{ color: accent }}>
          {unit}
        </span>
        {progress !== undefined && (
          <div className="flex-1 ml-4 h-[3px] rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: accent }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Vo2Card({
  vo2max, trend,
}: {
  vo2max: number
  trend: number
}) {
  const bars = [0.4, 0.55, 0.65, 0.72, 0.8, 0.88, 1.0]
  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.5)]">
          VO2 Max Trend
        </p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: '#ff6d00', color: '#1a0500' }}>
          TOP 1%
        </span>
      </div>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-[48px] font-black leading-none text-white">{vo2max}</span>
      </div>
      <p className="text-[11px] text-[rgba(218,226,253,0.5)] mb-4">
        +{trend.toFixed(1)}% vs last month
      </p>
      {/* Mini bar chart */}
      <div className="flex items-end gap-[3px] h-[40px]">
        {bars.map((h, i) => (
          <div key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h * 100}%`,
              background: i === bars.length - 1 ? '#ff6d00' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

const HR_ZONES = [
  { name: 'Zone 1: Récupération', pctMin: 0.60, pctMax: 0.70, color: '#4b5563' },
  { name: 'Zone 2: Endurance',    pctMin: 0.70, pctMax: 0.80, color: '#3b82f6' },
  { name: 'Zone 3: Aérobie',      pctMin: 0.80, pctMax: 0.90, color: '#22c55e' },
  { name: 'Zone 4: Seuil',        pctMin: 0.90, pctMax: 0.95, color: '#f97316' },
  { name: 'Zone 5: Anaérobie',    pctMin: 0.95, pctMax: 1.00, color: '#ef4444' },
]

function HrZonesCard({ maxHR, restingHR }: { maxHR: number; restingHR: number }) {
  const hrr = maxHR - restingHR
  return (
    <div className="flex flex-col p-6 rounded-2xl h-full"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7h2l2-4 2 8 2-6 1 2h3" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
            Zones de Fréquence Cardiaque
          </span>
        </div>
        <span className="text-[10px] text-[rgba(218,226,253,0.5)]">MAX HR: {maxHR} BPM</span>
      </div>

      <div className="flex flex-col gap-4 flex-1 justify-between">
        {HR_ZONES.map((zone) => {
          const lo = Math.round(restingHR + hrr * zone.pctMin)
          const hi = Math.round(restingHR + hrr * zone.pctMax)
          const barWidth = (zone.pctMax - zone.pctMin) * 5 * 100 // relative width
          return (
            <div key={zone.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium tracking-[0.5px] uppercase"
                  style={{ color: zone.color }}>
                  {zone.name}
                </span>
                <span className="text-[10px] text-[rgba(218,226,253,0.4)]">
                  {lo} – {hi} BPM ({Math.round(zone.pctMin * 100)}-{Math.round(zone.pctMax * 100)}%)
                </span>
              </div>
              <div className="h-[4px] rounded-full bg-white/8">
                <div className="h-full rounded-full"
                  style={{ width: `${barWidth}%`, background: zone.color, maxWidth: '100%' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AiStatsCard({
  lactatePaceSec,
  marathonSec,
  recoveryPct,
  insightText,
}: {
  lactatePaceSec: number
  marathonSec: number
  recoveryPct: number
  insightText: string
}) {
  return (
    <div className="flex flex-col p-6 rounded-2xl h-full relative"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-[#ff6d00]" />
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
          Statistiques IA
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Lactate threshold */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Lactate Threshold
          </p>
          <p className="text-[22px] font-black text-white leading-none">
            {formatPaceSec(lactatePaceSec)}
            <span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-1">/KM</span>
          </p>
          <p className="text-[9px] text-[#22c55e] mt-1 flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M4 6V2M2 4l2-2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            -8s from last test
          </p>
        </div>

        {/* Predicted marathon */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Predicted Marathon
          </p>
          <p className="text-[22px] font-black text-white leading-none">
            {formatDuration(marathonSec)}
          </p>
          <p className="text-[9px] text-[#3b82f6] mt-1 flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1"/>
              <path d="M4 2.5V4l1 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            New PB Projection
          </p>
        </div>

        {/* Recovery */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Recovery Efficiency
          </p>
          <p className="text-[22px] font-black text-white leading-none">
            {recoveryPct}
            <span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-0.5">%</span>
          </p>
          <p className="text-[9px] text-[rgba(218,226,253,0.4)] mt-1">Optimal HRV readiness</p>
        </div>

        {/* AI insight placeholder */}
        <div className="p-3 rounded-xl flex flex-col items-center justify-center gap-2"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L12 7h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5L10 2z"
              stroke="#ff6d00" strokeWidth="1.2" fill="rgba(255,109,0,0.15)" strokeLinejoin="round"/>
          </svg>
          <p className="text-[9px] tracking-[0.5px] uppercase text-[#ff6d00] text-center">
            Generating Insight...
          </p>
        </div>
      </div>

      {/* Quote */}
      <div className="mt-auto p-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[10px] italic text-[rgba(218,226,253,0.4)] leading-relaxed">
          "{insightText}"
        </p>
      </div>

      {/* FAB */}
      <button
        className="absolute bottom-4 right-4 w-9 h-9 rounded-full flex items-center justify-center
                   shadow-[0_4px_20px_rgba(255,109,0,0.4)] hover:brightness-110 transition-all"
        style={{ background: '#ff6d00' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M2 7h10" stroke="#1a0500" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

function PersonalBestsCard({ sessions }: { sessions: Array<{ distance: number; duration: number; date: Date; name: string }> }) {
  const distances: Array<{ label: string; min: number; max: number; unit: string }> = [
    { label: '5 Kilomètre',  min: 4500,  max: 5500,  unit: 'MIN' },
    { label: '10 Kilomètre', min: 9500,  max: 10500, unit: 'MIN' },
    { label: 'Marathon',     min: 40000, max: 44000, unit: 'HRS' },
  ]

  const bests = distances.map(({ label, min, max, unit }) => {
    const matching = sessions.filter(s => s.distance >= min && s.distance <= max)
    const best = matching.sort((a, b) => a.duration - b.duration)[0]
    return { label, unit, best }
  })

  return (
    <div className="flex flex-col p-6 rounded-2xl h-full"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-6">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.5 4H13l-3.5 2.5 1.5 4L7 9 3 11.5l1.5-4L1 5h4.5L7 1z"
            fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5"/>
        </svg>
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
          Personal Bests
        </span>
      </div>

      <div className="flex flex-col gap-5 flex-1 justify-between">
        {bests.map(({ label, unit, best }) => (
          <div key={label} className="flex items-end justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
            <div>
              <p className="text-[13px] font-semibold text-white mb-1">{label}</p>
              {best ? (
                <p className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.35)]">
                  {new Date(best.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                  {' • '}{best.name.slice(0, 20)}
                </p>
              ) : (
                <p className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.25)]">
                  Aucune séance
                </p>
              )}
            </div>
            {best ? (
              <p className="text-[28px] font-black text-white leading-none">
                {formatDuration(best.duration)}
                <span className="text-[10px] font-medium text-[rgba(218,226,253,0.4)] ml-1">{unit}</span>
              </p>
            ) : (
              <p className="text-[18px] font-black text-[rgba(218,226,253,0.2)]">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function GearCard() {
  return (
    <div className="flex flex-col p-6 rounded-2xl h-full"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[9px] tracking-[1.5px] uppercase text-[rgba(218,226,253,0.4)] mb-1">
        Mes Chaussures
      </p>
      <p className="text-[20px] font-black text-white leading-tight mb-0.5">Nike Alphafly 3</p>
      <p className="text-[10px] text-[rgba(218,226,253,0.4)] mb-5">Electric Orange Edition</p>

      {/* Shoe placeholder */}
      <div className="flex-1 rounded-xl mb-5 flex items-center justify-center"
        style={{ background: 'rgba(255,109,0,0.08)', border: '1px solid rgba(255,109,0,0.15)' }}>
        <svg width="80" height="48" viewBox="0 0 80 48" fill="none">
          <path d="M8 36 C8 36 16 28 30 26 C44 24 55 30 66 28 C74 26 78 32 76 36 C74 38 8 40 8 36Z"
            fill="rgba(255,109,0,0.3)" stroke="#ff6d00" strokeWidth="1.2"/>
          <path d="M12 36 C16 32 24 28 36 28 C42 28 50 30 58 30"
            stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Usage */}
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <span className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.4)]">Usage</span>
          <span className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.4)]">Lifespan</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[20px] font-black text-white">342 <span className="text-[10px] font-medium text-[rgba(218,226,253,0.5)]">/ 800 KM</span></span>
        </div>
        <div className="h-[4px] rounded-full bg-white/10 mb-2">
          <div className="h-full rounded-full" style={{ width: '42.75%', background: '#ff6d00' }} />
        </div>
        <p className="text-[9px] text-[#22c55e] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          Performance optimale restante
        </p>
      </div>

      <button className="w-full py-2.5 rounded-xl text-[10px] font-bold tracking-[1px] uppercase
                         text-white text-center flex items-center justify-center gap-2
                         hover:bg-white/8 transition-colors"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
        Gear Details
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5h6M5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

function ConnectionBadge({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[rgba(218,226,253,0.2)]'}`} />
      <div>
        <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">{label}</p>
        <p className={`text-[10px] font-bold tracking-[0.5px] uppercase ${connected ? 'text-[#22c55e]' : 'text-[rgba(218,226,253,0.3)]'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ProfilPage() {
  const { profile, sessions } = useAppStore()
  const { athlete, connectionState } = useStravaStore()

  const stravaConnected = connectionState.status === 'connected'
  const garminConnected = sessions.some(s => s.id.startsWith('garmin-'))

  const currentYear = new Date().getFullYear()
  const yearSessions = sessions.filter(s => new Date(s.date).getFullYear() === currentYear)
  const totalKmYear = yearSessions.reduce((acc, s) => acc + s.distance / 1000, 0)
  const totalElevYear = yearSessions.reduce((acc, s) => acc + s.elevationGain, 0)

  const runnerName = athlete
    ? `${athlete.firstname} ${athlete.lastname ?? ''}`.trim().toUpperCase()
    : (profile.name || 'Trail Runner').toUpperCase()
  const location = athlete?.city ? `${athlete.city}, ${athlete.country ?? ''}`.replace(/, $/, '') : null

  const level =
    profile.enduranceScore >= 0.8 ? 'Elite Level'
    : profile.enduranceScore >= 0.6 ? 'Pro Level'
    : profile.enduranceScore >= 0.4 ? 'Amateur'
    : 'Beginner'

  const vo2max = Math.round(30 + profile.enduranceScore * 40)
  const vo2trend = 2.4

  const lactatePaceSec = profile.basePaceSecPerKm * 0.88
  const marathonSec = profile.basePaceSecPerKm * 42.195 * (1 + profile.fatigueModel.hourlyDecayFactor * 4)
  const recoveryPct = Math.round(70 + profile.enduranceScore * 28)

  const { maxHR, restingHR } = profile.heartRateModel

  const avgWeeklyHrs = (() => {
    if (sessions.length < 2) return 0
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const firstDate = new Date(sorted[0]!.date)
    const lastDate  = new Date(sorted[sorted.length - 1]!.date)
    const weeks = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (7 * 86400000))
    const totalSec = sessions.reduce((acc, s) => acc + s.duration, 0)
    return parseFloat((totalSec / 3600 / weeks).toFixed(1))
  })()

  const paceMin = Math.floor(profile.basePaceSecPerKm / 60)
  const paceSec = Math.round(profile.basePaceSecPerKm % 60)

  const insightText = sessions.length >= 3
    ? `Basé sur vos ${Math.min(sessions.length, 3)} dernières sorties, votre économie de course s'est améliorée de 3.2%.`
    : 'Ajoutez des séances pour générer des insights personnalisés sur vos performances.'

  return (
    <div className="w-full flex flex-col gap-5 pb-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        {/* Left: avatar + name */}
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div className="w-[90px] h-[90px] rounded-2xl overflow-hidden"
              style={{ background: '#111827', border: '2px solid rgba(255,109,0,0.3)' }}>
              {athlete?.profile ? (
                <img src={athlete.profile} alt={runnerName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">🏃</div>
              )}
            </div>
            {/* Status dot */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0b1326] bg-[#22c55e]" />
          </div>

          <div>
            <h1 className="text-[32px] sm:text-[40px] font-black text-white leading-none tracking-tight mb-2">
              {runnerName}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[1px] uppercase"
                style={{ background: '#ff6d00', color: '#1a0500' }}>
                {level}
              </span>
              {location && (
                <span className="flex items-center gap-1 text-[11px] text-[rgba(218,226,253,0.5)]">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                    <path d="M5 1C3.07 1 1.5 2.57 1.5 4.5c0 2.75 3.5 6.5 3.5 6.5s3.5-3.75 3.5-6.5C8.5 2.57 6.93 1 5 1z"
                      stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <circle cx="5" cy="4.5" r="1" fill="currentColor"/>
                  </svg>
                  {location}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: connections */}
        <div className="flex items-center gap-3 shrink-0">
          <ConnectionBadge label="Strava"  connected={stravaConnected} />
          <ConnectionBadge label="Garmin"  connected={garminConnected} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Kilomètre Année"
          value={formatNumber(totalKmYear)}
          unit="KM"
          accent="#ff6d00"
          progress={Math.min(100, (totalKmYear / 3000) * 100)}
        />
        <StatCard
          label="Total Dénivelé Année"
          value={formatNumber(totalElevYear)}
          unit="M"
          accent="#3b82f6"
          progress={Math.min(100, (totalElevYear / 50000) * 100)}
        />
        <Vo2Card vo2max={vo2max} trend={vo2trend} />
      </div>

      {/* ── HR Zones + AI Stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HrZonesCard maxHR={maxHR} restingHR={restingHR} />
        <AiStatsCard
          lactatePaceSec={lactatePaceSec}
          marathonSec={marathonSec}
          recoveryPct={recoveryPct}
          insightText={insightText}
        />
      </div>

      {/* ── Personal Bests + Gear ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PersonalBestsCard sessions={sessions} />
        <GearCard />
      </div>

      {/* ── Sync Strava ── */}
      <StravaConnect />

      {/* ── Footer stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Average Pace',        value: `${paceMin}'${String(paceSec).padStart(2,'0')}"`, unit: '/KM' },
          { label: 'Resting Heart Rate',  value: String(restingHR),  unit: 'BPM' },
          { label: 'Weekly Training Vol', value: String(avgWeeklyHrs || '—'), unit: 'HRS' },
          { label: 'Cadence Avg',         value: '—',                unit: 'SPM' },
          { label: 'Power Output',        value: 'Enabled',          unit: '' },
        ].map(({ label, value, unit }) => (
          <div key={label} className="flex flex-col items-center justify-center py-4 px-3"
            style={{ background: '#0b1326' }}>
            <p className="text-[8px] tracking-[1px] uppercase text-[rgba(218,226,253,0.35)] mb-1">{label}</p>
            <p className="text-[16px] font-black text-white leading-none">
              {value}
              {unit && <span className="text-[9px] font-medium text-[rgba(218,226,253,0.4)] ml-1">{unit}</span>}
            </p>
          </div>
        ))}
      </div>

    </div>
  )
}