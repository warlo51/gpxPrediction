/**
 * Page Planificateur unifiée — Import GPX + Stratégie de course
 * Import → simulation auto → résultats immédiats
 */

import { useCallback, useRef, useState, useMemo } from 'react'
import type { DragEvent } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '@/stores/appStore'
import { parseGpxFile } from '@/services/gpxParser.service'
import { generateRaceStrategy } from '@/services/raceStrategy.service'
import { formatPace } from '@/services/simulationEngine.service'
import { TrackMap } from './TrackMap'
import { Track3DView } from './Track3DView'
import { ElevationChart } from './ElevationChart'
import type { GpxTrack } from '@/types'
import type { RaceStrategyReport, StrategyPlan, RaceStrategyId, StrategyRecommendation } from '@/types/raceStrategy.types'

// ─── Strategy metadata ──────────────────────────────────────────────────────

const STRATEGY_META: Record<RaceStrategyId, { color: string; name: string; emoji: string }> = {
  prudente:   { color: '#22c55e', name: 'Prudente',   emoji: '🟢' },
  objectif:   { color: '#f97316', name: 'Objectif',   emoji: '🟡' },
  ambitieuse: { color: '#ef4444', name: 'Ambitieuse', emoji: '🔴' },
}

// ─── Drop zone (état initial) ────────────────────────────────────────────────

function DropZone({
  onFile,
  isDragging,
  isParsing,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onFile: (f: File) => void
  isDragging: boolean
  isParsing: boolean
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 sm:py-32">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !isParsing && inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer w-full max-w-lg mx-auto',
          'transition-all duration-200 px-8 py-16',
          isDragging
            ? 'border-2 border-dashed border-[#ff6d00] bg-[rgba(255,109,0,0.08)]'
            : 'border-2 border-dashed border-white/10 hover:border-white/20 hover:bg-white/[0.02]',
          isParsing ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        style={{ background: isDragging ? undefined : '#0d1829' }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".gpx"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />

        {isParsing ? (
          <>
            <div className="w-12 h-12 border-2 border-[#ff6d00] border-t-transparent rounded-full animate-spin" />
            <p className="text-[rgba(218,226,253,0.6)] text-sm">Analyse du parcours…</p>
          </>
        ) : (
          <>
            <div className="w-[64px] h-[64px] rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,109,0,0.15)', border: '1px solid rgba(255,109,0,0.3)' }}>
              <svg width="28" height="32" viewBox="0 0 28 32" fill="none">
                <rect x="1" y="1" width="20" height="28" rx="3" stroke="rgba(255,182,146,0.8)" strokeWidth="1.5"/>
                <path d="M21 1l6 6v1h-6V1z" stroke="rgba(255,182,146,0.8)" strokeWidth="1.5" fill="rgba(255,109,0,0.2)"/>
                <path d="M5 11h12M5 15h12M5 19h8" stroke="rgba(255,182,146,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M21 8h6" stroke="rgba(255,182,146,0.8)" strokeWidth="1.5"/>
                <path d="M19 14l3 3-3 3M22 17l5-5" stroke="#ff6d00" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-2">
                {isDragging ? 'Relâchez pour importer' : 'Importer un fichier GPX'}
              </p>
              <p className="text-[13px] text-[rgba(218,226,253,0.45)] max-w-[280px] leading-relaxed">
                Glissez votre trace GPX ici pour lancer l'analyse et générer votre plan de course.
              </p>
            </div>

            <button
              type="button"
              className="px-6 py-2.5 rounded-xl text-[11px] font-bold tracking-[1.5px] uppercase
                         text-[rgba(218,226,253,0.8)] transition-all
                         hover:border-white/30 hover:text-white"
              style={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.12)' }}
              onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
            >
              Parcourir
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Track header compact ────────────────────────────────────────────────────

function TrackHeader({
  track,
  onChangeFile,
}: {
  track: GpxTrack
  onChangeFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChangeFile(f) }}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,109,0,0.15)', border: '1px solid rgba(255,109,0,0.3)' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4.5L6 3L12 6L16 4.5V14L12 15.5L6 12.5L2 14V4.5Z" stroke="#ff6d00" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M6 3V12.5M12 6V15.5" stroke="#ff6d00" strokeWidth="1.4"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{track.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
              <span className="text-slate-300 font-medium">{(track.totalDistance / 1000).toFixed(1)} km</span>
              <span className="text-orange-300">+{Math.round(track.totalElevationGain)} m</span>
              <span className="text-sky-300">-{Math.round(track.totalElevationLoss)} m</span>
              <span className="text-slate-500">{track.segments.length} seg.</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 px-3 py-2 rounded-lg text-[10px] font-semibold tracking-wider uppercase
                     text-slate-400 hover:text-white border border-white/[0.08] hover:border-white/20
                     bg-white/[0.03] transition-all"
        >
          Changer GPX
        </button>
      </div>
    </div>
  )
}

// ─── Track visualization (collapsible) ──────────────────────────────────────

function TrackVisualization({ track }: { track: GpxTrack }) {
  const [expanded, setExpanded] = useState(true)
  const [viewMode, setViewMode] = useState<'map' | '3d'>('map')

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5"
      >
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[#ff6d00] shrink-0" />
          <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Parcours</h3>
        </div>
        <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 flex flex-col gap-3">
          {/* View mode tabs */}
          <div className="flex gap-2">
            {(['map', '3d'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                  viewMode === mode
                    ? 'bg-[#ff6d00]/15 border-[#ff6d00]/40 text-[#ffb692]'
                    : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'map' ? 'Carte 2D' : 'Vue 3D'}
              </button>
            ))}
          </div>

          {viewMode === 'map' ? (
            <div className="relative rounded-xl overflow-hidden" style={{ height: '320px' }}>
              <TrackMap track={track} />
            </div>
          ) : (
            <Track3DView track={track} height="320px" />
          )}

          <ElevationChart track={track} />
        </div>
      )}
    </div>
  )
}

// ─── Recommendation banner ──────────────────────────────────────────────────

function RecommendationBanner({
  recommendation,
  onSelect,
}: {
  recommendation: StrategyRecommendation
  onSelect: (id: RaceStrategyId) => void
}) {
  const meta = STRATEGY_META[recommendation.id]

  return (
    <button
      onClick={() => onSelect(recommendation.id)}
      className="w-full flex items-start gap-4 px-4 sm:px-5 py-4 rounded-2xl border-2 text-left transition-all hover:brightness-110"
      style={{
        borderColor: `${meta.color}40`,
        background: `${meta.color}08`,
      }}
    >
      <div
        className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
        style={{ background: `${meta.color}20` }}
      >
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: meta.color }}>
            Stratégie recommandée
          </span>
          <span className="text-xs font-semibold text-white">{meta.name}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{recommendation.reason}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-1">
        <path d="M6 4l4 4-4 4" stroke={meta.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

// ─── Strategy selector pills ─────────────────────────────────────────────────

function StrategyPills({
  strategies,
  active,
  recommendedId,
  onSelect,
}: {
  strategies: StrategyPlan[]
  active: RaceStrategyId
  recommendedId: RaceStrategyId
  onSelect: (id: RaceStrategyId) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {strategies.map((s) => {
        const meta = STRATEGY_META[s.id]
        const isActive = active === s.id
        const isRecommended = s.id === recommendedId
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
            {isRecommended && (
              <span className="absolute top-1.5 right-1.5 text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md"
                style={{ background: `${meta.color}25`, color: meta.color }}>
                Conseillé
              </span>
            )}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'FC moy',     value: `${plan.avgHR}`, unit: 'bpm' },
            { label: 'FC max est', value: `${plan.maxHREstimated}`, unit: 'bpm' },
            { label: 'Calories',   value: `${plan.totalCalories}`, unit: 'kcal' },
            { label: 'Deficit',    value: `${plan.nutrition.deficitKcal}`, unit: 'kcal' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center">
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-100">
                {value} <span className="text-[9px] text-slate-400">{unit}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Phases */}
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

        {/* Risk zones */}
        {plan.riskZones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plan.riskZones.map((zone, i) => (
              <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
                zone.level === 'élevé'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                <span>{zone.level === 'élevé' ? '⚠️' : '↑'}</span>
                <span>{zone.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Nutrition */}
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
      </div>
    </div>
  )
}

// ─── Charts ──────────────────────────────────────────────────────────────────

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
        <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">Allures (s/km)</h3>
      </div>
      <ResponsiveContainer width="100%" height={220}>
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
        <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider">FC cible (bpm)</h3>
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

// ─── Page principale ──────────────────────────────────────────────────────────

export function PlanificateurPage() {
  const { track, setTrack, profile } = useAppStore()

  const [isDragging, setIsDragging] = useState(false)
  const [isParsing,  setIsParsing]  = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [carbTolerance, setCarbTolerance] = useState(60)
  const [activeStrategy, setActiveStrategy] = useState<RaceStrategyId | null>(null)

  // Simulation auto dès qu'un track est chargé
  const report = useMemo<RaceStrategyReport | null>(() => {
    if (!track) return null
    return generateRaceStrategy(track, profile, carbTolerance)
  }, [track, profile, carbTolerance])

  // Sélection auto de la stratégie recommandée quand le report change
  const effectiveStrategy = activeStrategy ?? report?.recommendation.id ?? 'objectif'

  const activePlan = useMemo(
    () => report?.strategies.find((s) => s.id === effectiveStrategy) ?? null,
    [report, effectiveStrategy],
  )

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.gpx')) {
      setParseError('Le fichier doit être au format .gpx')
      return
    }
    setParseError(null)
    setIsParsing(true)
    setActiveStrategy(null)
    try {
      const parsed = await parseGpxFile(file)
      setTrack(parsed)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erreur lors du parsing GPX')
    } finally {
      setIsParsing(false)
    }
  }, [setTrack])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  // ── Pas de track → drop zone plein écran ──
  if (!track) {
    return (
      <div
        className="w-full min-h-[60vh]"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <DropZone
          onFile={handleFile}
          isDragging={isDragging}
          isParsing={isParsing}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
        {parseError && (
          <div className="max-w-lg mx-auto mt-3 px-4 py-3 rounded-xl text-[12px] text-red-400"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            ⚠️ {parseError}
          </div>
        )}
      </div>
    )
  }

  // ── Track chargé → résultats immédiats ──
  return (
    <div className="w-full flex flex-col gap-4">

      {/* Header compact : nom + stats + bouton changer */}
      <TrackHeader track={track} onChangeFile={handleFile} />

      {/* Parcours (carte + élévation, repliable) */}
      <TrackVisualization track={track} />

      {/* Stratégie */}
      {report && (
        <>
          {/* Titre section + slider glucides */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-3">
              <span className="w-1 h-8 rounded-full bg-[#ff6d00] shrink-0" />
              <h2 className="text-xl font-bold text-white">Plan de course</h2>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider whitespace-nowrap">Glucides</label>
              <input type="range" min={30} max={120} step={5} value={carbTolerance}
                onChange={(e) => setCarbTolerance(Number(e.target.value))}
                className="w-20 sm:w-28 accent-[#ff6d00]" />
              <span className="text-xs font-mono text-slate-200 w-12 shrink-0">{carbTolerance} g/h</span>
            </div>
          </div>

          {/* Recommandation */}
          <RecommendationBanner
            recommendation={report.recommendation}
            onSelect={setActiveStrategy}
          />

          {/* Pills */}
          <StrategyPills
            strategies={report.strategies}
            active={effectiveStrategy}
            recommendedId={report.recommendation.id}
            onSelect={setActiveStrategy}
          />

          {/* Tableau comparatif */}
          <ComparatifTable report={report} />

          {/* Détail stratégie active */}
          {activePlan && <StrategyDetail plan={activePlan} />}

          {/* Graphiques */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PaceChart strategies={report.strategies} />
            <HRChart strategies={report.strategies} />
          </div>

          {/* Lecture du parcours */}
          <LectureSection report={report} />
        </>
      )}
    </div>
  )
}
