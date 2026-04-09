/**
 * Page Stratégie — Plan de course + comparaison + graphiques
 * Fusionne RacePlanPage + StrategyComparison en une seule page.
 */

import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '@/stores/appStore'
import { generateRaceStrategy } from '@/services/raceStrategy.service'
import { formatPace } from '@/services/simulationEngine.service'
import type { RaceStrategyReport, StrategyPlan, RaceStrategyId } from '@/types/raceStrategy.types'

// ─── Metadata ────────────────────────────────────────────────────────────────

const STRATEGY_META: Record<RaceStrategyId, { color: string; name: string; emoji: string }> = {
  prudente:   { color: '#22c55e', name: 'Prudente',   emoji: '🟢' },
  objectif:   { color: '#f97316', name: 'Objectif',   emoji: '🟡' },
  ambitieuse: { color: '#ef4444', name: 'Ambitieuse', emoji: '🔴' },
}

// ─── Strategy selector pills ─────────────────────────────────────────────────

function StrategyPills({
  strategies,
  active,
  onSelect,
}: {
  strategies: StrategyPlan[]
  active: RaceStrategyId
  onSelect: (id: RaceStrategyId) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {strategies.map((s) => {
        const meta = STRATEGY_META[s.id]
        const isActive = active === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="relative flex flex-col gap-2 px-3 sm:px-4 py-3 rounded-xl transition-all border-2 text-left overflow-hidden"
            style={{
              borderColor: isActive ? meta.color : 'rgba(255,255,255,0.06)',
              background:  isActive ? `${meta.color}12` : 'rgba(255,255,255,0.02)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{meta.emoji}</span>
              <span className="text-xs font-semibold" style={{ color: isActive ? meta.color : '#94a3b8' }}>
                {meta.name}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-lg sm:text-xl font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>
                {s.totalTimeFormatted}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500">{s.avgPaceFormatted}</span>
              <span className={
                s.blowupRisk === 'Élevé'  ? 'text-red-400'   :
                s.blowupRisk === 'Modéré' ? 'text-amber-400' : 'text-green-400'
              }>
                {s.blowupRisk}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Comparative table ───────────────────────────────────────────────────────

function ComparatifTable({ report }: { report: RaceStrategyReport }) {
  const rows: Array<{ label: string; key: string; format: (s: StrategyPlan) => string; highlight?: boolean }> = [
    { label: 'Temps total',       key: 'time',    format: (s) => s.totalTimeFormatted, highlight: true },
    { label: 'Allure moy.',       key: 'pace',    format: (s) => s.avgPaceFormatted },
    { label: 'FC moy.',           key: 'hr',      format: (s) => `${s.avgHR} bpm` },
    { label: 'FC max estimee',    key: 'maxhr',   format: (s) => `${s.maxHREstimated} bpm` },
    { label: 'Fatigue moy.',      key: 'fatigue', format: (s) => `${(s.avgFatigue * 100).toFixed(1)}%` },
    { label: 'Seg. marche',       key: 'walk',    format: (s) => `${s.walkingSegments}` },
    { label: 'Calories',          key: 'cal',     format: (s) => `${s.totalCalories} kcal` },
    { label: 'Risque explosion',  key: 'risk',    format: (s) => s.blowupRisk },
  ]

  return (
    <div className="glass rounded-2xl overflow-x-auto">
      <table className="w-full text-xs min-w-[320px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left px-4 py-3 text-slate-500 font-medium w-2/5" />
            {report.strategies.map((s) => (
              <th key={s.id} className="text-center px-3 py-3 font-semibold text-xs"
                style={{ color: STRATEGY_META[s.id].color }}>
                {s.emoji} {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-slate-500">{row.label}</td>
              {report.strategies.map((s) => (
                <td key={s.id} className={`text-center px-3 py-2.5 font-mono ${
                  row.highlight ? 'text-white font-bold' : 'text-slate-300'
                }`}>
                  {row.key === 'risk' ? (
                    <span className={
                      s.blowupRisk === 'Élevé'  ? 'text-red-400'   :
                      s.blowupRisk === 'Modéré' ? 'text-amber-400' : 'text-green-400'
                    }>{s.blowupRisk}</span>
                  ) : row.key === 'fatigue' ? (
                    <span className={
                      s.avgFatigue < 0.1 ? 'text-green-400' :
                      s.avgFatigue < 0.25 ? 'text-amber-400' : 'text-red-400'
                    }>{row.format(s)}</span>
                  ) : row.format(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Strategy detail card ────────────────────────────────────────────────────

function StrategyDetail({ plan }: { plan: StrategyPlan }) {
  const meta = STRATEGY_META[plan.id]

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="h-1 w-full" style={{ background: meta.color }} />
      <div className="p-4 sm:p-5 flex flex-col gap-5">

        {/* Stats strip */}
        <div className={`grid grid-cols-2 gap-2 ${plan.nutrition ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {[
            { label: 'FC moy',     value: `${plan.avgHR}`, unit: 'bpm' },
            { label: 'FC max est', value: `${plan.maxHREstimated}`, unit: 'bpm' },
            { label: 'Calories',   value: `${plan.totalCalories}`, unit: 'kcal' },
            ...(plan.nutrition ? [{ label: 'Deficit', value: `${plan.nutrition.deficitKcal}`, unit: 'kcal' }] : []),
          ].map(({ label, value, unit }) => (
            <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-100">
                {value} <span className="text-[9px] text-slate-400">{unit}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Phases table */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Phases</h3>
          </div>

          {/* Mobile */}
          <div className="flex flex-col gap-2 sm:hidden">
            {plan.phases.map((phase) => (
              <div key={phase.index} className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {phase.riskLevel === 'élevé'  && <span className="text-red-400 text-[10px]">⚠</span>}
                      {phase.riskLevel === 'modéré' && <span className="text-amber-400 text-[10px]">↑</span>}
                      <span className="text-slate-200 font-semibold text-xs">{phase.label}</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">km {phase.startKm}–{phase.endKm}</span>
                  </div>
                  <span className="text-white font-bold text-sm shrink-0">{phase.cumulativeTimeFormatted}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
                  <div><div className="text-slate-500">Allure</div><div className="text-slate-200 font-mono">{phase.targetPaceFormatted}</div></div>
                  <div><div className="text-slate-500">FC</div><div className="text-slate-200">{phase.avgHR} bpm</div></div>
                  <div><div className="text-slate-500">D+/D-</div><div><span className="text-orange-300">+{phase.elevationGain}</span>/<span className="text-sky-300">-{phase.elevationLoss}</span></div></div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden sm:table w-full text-xs text-slate-300">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-500 text-[10px] uppercase tracking-wider">
                <th className="text-left pb-2 pr-3 font-medium">Phase</th>
                <th className="text-right pb-2 px-2 font-medium">D+</th>
                <th className="text-right pb-2 px-2 font-medium">D-</th>
                <th className="text-right pb-2 px-2 font-medium">Allure</th>
                <th className="text-right pb-2 px-2 font-medium">FC</th>
                <th className="text-left pb-2 px-2 font-medium">RPE</th>
                <th className="text-right pb-2 pl-2 font-medium">Cumul</th>
              </tr>
            </thead>
            <tbody>
              {plan.phases.map((phase) => (
                <tr key={phase.index} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      {phase.riskLevel === 'élevé'  && <span className="text-red-400 text-[10px]">⚠</span>}
                      {phase.riskLevel === 'modéré' && <span className="text-amber-400 text-[10px]">↑</span>}
                      <span className="font-medium text-slate-200">{phase.label}</span>
                    </div>
                    <div className="text-slate-500 text-[10px] mt-0.5">km {phase.startKm}–{phase.endKm}</div>
                  </td>
                  <td className="text-right py-2.5 px-2 text-orange-300">+{phase.elevationGain}m</td>
                  <td className="text-right py-2.5 px-2 text-sky-300">-{phase.elevationLoss}m</td>
                  <td className="text-right py-2.5 px-2 font-mono text-slate-200">{phase.targetPaceFormatted}</td>
                  <td className="text-right py-2.5 px-2">{phase.avgHR} bpm</td>
                  <td className="py-2.5 px-2 text-slate-400 text-[10px]">{phase.rpe}</td>
                  <td className="text-right py-2.5 pl-2 font-mono text-slate-400 text-[10px]">{phase.cumulativeTimeFormatted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Zones à surveiller — regroupées par cause */}
        {plan.riskZones.length > 0 && (() => {
          const groupDefs = [
            { cause: 'fc-elevee'   as const, label: 'FC élevée',    sublabel: '> 92 % FCmax', icon: '⚠️', severity: 'high' as const },
            { cause: 'fc-soutenue' as const, label: 'FC soutenue',  sublabel: '> 87 % FCmax', icon: '↑',  severity: 'mid'  as const },
            { cause: 'marche'      as const, label: 'Marche forcée', sublabel: 'Pente trop raide', icon: '🚶', severity: 'mid' as const },
          ]
          const groups = groupDefs
            .map(g => ({ ...g, zones: plan.riskZones.filter(z => z.cause === g.cause) }))
            .filter(g => g.zones.length > 0)
          if (groups.length === 0) return null

          return (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Zones à surveiller</h3>
              </div>
              <div className="flex flex-col gap-1.5">
                {groups.map((group) => {
                  const totalKm = group.zones.reduce((sum, z) => sum + (z.endKm - z.startKm), 0)
                  const avgHR   = Math.round(group.zones.reduce((s, z) => s + z.avgHR, 0) / group.zones.length)
                  const colorClasses = group.severity === 'high'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  return (
                    <div key={group.cause} className={`rounded-xl border px-3 py-2 ${colorClasses}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm shrink-0">{group.icon}</span>
                          <span className="font-semibold text-xs">{group.label}</span>
                          <span className="text-[10px] text-slate-500 truncate">· {group.sublabel}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 shrink-0">
                          {group.zones.length} {group.zones.length > 1 ? 'zones' : 'zone'} · {totalKm.toFixed(1)} km · ~{avgHR} bpm
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                        {group.zones.map((z, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300">
                            km {z.startKm.toFixed(1)}–{z.endKm.toFixed(1)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Nutrition */}
        {plan.nutrition && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
            plan.nutrition.icon === '✅' ? 'bg-green-500/10 border-green-500/30' :
            plan.nutrition.icon === '⚠️' ? 'bg-amber-500/10 border-amber-500/30' :
                                           'bg-red-500/10 border-red-500/30'
          }`}>
            <span className="text-base shrink-0">{plan.nutrition.icon}</span>
            <div>
              <div className={`text-xs font-semibold ${
                plan.nutrition.icon === '✅' ? 'text-green-400' :
                plan.nutrition.icon === '⚠️' ? 'text-amber-400' : 'text-red-400'
              }`}>
                Nutrition — {plan.nutrition.status}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{plan.nutrition.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Overlay charts ──────────────────────────────────────────────────────────

function PaceChart({ strategies }: { strategies: StrategyPlan[] }) {
  const data = useMemo(() => {
    const maxLen = Math.max(...strategies.map((s) => s.chartData.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, number | string> = {
        km: strategies[0]?.chartData[i]?.km.toFixed(1) ?? '0',
      }
      for (const s of strategies) {
        if (s.chartData[i]) point[s.id] = s.chartData[i].pace
      }
      return point
    })
  }, [strategies])

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-indigo-500 shrink-0" />
        <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Allures par segment (s/km)</h3>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="km" tickFormatter={(v: string) => `${v}km`}
            tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => { const m = Math.floor(v / 60); const s = Math.floor(v % 60); return `${m}:${String(s).padStart(2, '0')}` }}
            tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} width={45} reversed />
          <Tooltip
            formatter={(value) => { const v = typeof value === 'number' ? value : parseFloat(String(value ?? 0)); return [formatPace(v), 'Allure'] }}
            labelFormatter={(label) => `${String(label)} km`}
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
          />
          <Legend formatter={(value: string) => {
            const meta = STRATEGY_META[value as RaceStrategyId]
            return meta ? <span style={{ color: meta.color, fontSize: 11 }}>{meta.name}</span> : value
          }} />
          {strategies.map((s) => (
            <Line key={s.id} type="monotone" dataKey={s.id} stroke={STRATEGY_META[s.id].color}
              strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function HRChart({ strategies }: { strategies: StrategyPlan[] }) {
  const data = useMemo(() => {
    const maxLen = Math.max(...strategies.map((s) => s.chartData.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, number | string> = {
        km: strategies[0]?.chartData[i]?.km.toFixed(1) ?? '0',
      }
      for (const s of strategies) {
        if (s.chartData[i]) point[s.id] = s.chartData[i].hr
      }
      return point
    })
  }, [strategies])

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-rose-500 shrink-0" />
        <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">FC cible par segment (bpm)</h3>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="km" tickFormatter={(v: string) => `${v}km`}
            tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => `${v}`}
            tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} width={38} />
          <Tooltip
            formatter={(value) => [`${String(value)} bpm`, 'FC']}
            labelFormatter={(label) => `${String(label)} km`}
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
          />
          <Legend formatter={(value: string) => {
            const meta = STRATEGY_META[value as RaceStrategyId]
            return meta ? <span style={{ color: meta.color, fontSize: 11 }}>{meta.name}</span> : value
          }} />
          {strategies.map((s) => (
            <Line key={s.id} type="monotone" dataKey={s.id} stroke={STRATEGY_META[s.id].color}
              strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Lecture du parcours ─────────────────────────────────────────────────────

function LectureSection({ report }: { report: RaceStrategyReport }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-indigo-500 shrink-0" />
          <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Lecture du parcours</h3>
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-3 px-4 sm:px-5 pb-4">
          {report.lecture.map((bullet, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`shrink-0 mt-0.5 text-xs font-mono px-2 py-0.5 rounded-md whitespace-nowrap ${
                bullet.isWarning
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-white/[0.04] text-slate-500 border border-white/[0.06]'
              }`}>{bullet.kmRange}</span>
              <span className={`text-xs leading-relaxed ${bullet.isWarning ? 'text-slate-200' : 'text-slate-400'}`}>
                {bullet.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function RacePlanPage() {
  const { track, profile } = useAppStore()
  const [carbTolerance, setCarbTolerance] = useState(60)
  const [activeStrategy, setActiveStrategy] = useState<RaceStrategyId>('objectif')

  const report = useMemo<RaceStrategyReport | null>(() => {
    if (!track) return null
    return generateRaceStrategy(track, profile, carbTolerance)
  }, [track, profile, carbTolerance])

  const activePlan = useMemo(
    () => report?.strategies.find((s) => s.id === activeStrategy) ?? null,
    [report, activeStrategy],
  )

  if (!track) {
    return (
      <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-4xl">🗺️</div>
        <p className="text-slate-400 text-sm max-w-xs">
          Importe d'abord un fichier GPX depuis le{' '}
          <span className="text-[#ffb692] font-medium">Planificateur</span>{' '}
          pour generer ton plan de course.
        </p>
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="flex flex-col gap-4">

      {/* Track header */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white truncate max-w-[260px] sm:max-w-none">
              {track.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
              <span className="text-slate-300 font-medium">{(track.totalDistance / 1000).toFixed(1)} km</span>
              <span className="text-orange-300">+{Math.round(track.totalElevationGain)} m D+</span>
              <span className="text-sky-300">-{Math.round(track.totalElevationLoss)} m D-</span>
              <span className="text-slate-500">{track.segments.length} segments</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-wider whitespace-nowrap">Glucides</label>
            <input type="range" min={30} max={120} step={5} value={carbTolerance}
              onChange={(e) => setCarbTolerance(Number(e.target.value))}
              className="w-20 sm:w-28 accent-[#ff6d00]" />
            <span className="text-xs font-mono text-slate-200 w-12 shrink-0">{carbTolerance} g/h</span>
          </div>
        </div>
      </div>

      {/* Strategy pills */}
      <StrategyPills strategies={report.strategies} active={activeStrategy} onSelect={setActiveStrategy} />

      {/* Comparative table */}
      <ComparatifTable report={report} />

      {/* Active strategy detail */}
      {activePlan && <StrategyDetail plan={activePlan} />}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PaceChart strategies={report.strategies} />
        <HRChart strategies={report.strategies} />
      </div>

      {/* Lecture du parcours */}
      <LectureSection report={report} />
    </div>
  )
}
