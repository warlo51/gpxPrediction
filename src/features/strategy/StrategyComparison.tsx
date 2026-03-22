/**
 * Comparaison côte à côte des 4 stratégies de course
 * Tableau récapitulatif + graphique de superposition des allures + recommandation
 */

import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '@/stores/appStore'
import { runSimulation, formatDuration, formatPace } from '@/services/simulationEngine.service'
import { STRATEGY_LIST } from '@/models/strategies'
import type { SimulationResult, StrategyId } from '@/types'

// ─── Types internes ───────────────────────────────────────────────────────────

type StrategyComparison = {
  strategy: (typeof STRATEGY_LIST)[number]
  result: SimulationResult
  avgPaceSec: number
  avgHR: number
  avgFatigue: number
  walkingSegments: number
}

// ─── Recommandation automatique ───────────────────────────────────────────────

function getRecommendation(comparisons: StrategyComparison[]): StrategyComparison {
  // Score : pénalise la fatigue élevée et les segments de marche, récompense l'endurance
  const scored = comparisons.map((c) => ({
    ...c,
    score:
      c.result.totalDuration +
      c.avgFatigue * 3600 * 2 +
      c.walkingSegments * 120,
  }))
  return scored.sort((a, b) => a.score - b.score)[0]!
}

// ─── Tableau comparatif ───────────────────────────────────────────────────────

function ComparisonTable({
  comparisons,
  recommended,
}: {
  comparisons: StrategyComparison[]
  recommended: StrategyComparison
}) {
  const fastest = comparisons.reduce((a, b) =>
    a.result.totalDuration < b.result.totalDuration ? a : b,
  )

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-indigo-500 inline-block" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Comparaison des stratégies
        </h3>
      </div>

      {/* Cartes mobile */}
      <div className="flex flex-col gap-3 sm:hidden">
        {comparisons
          .sort((a, b) => a.result.totalDuration - b.result.totalDuration)
          .map((c) => {
            const isRecommended = c.strategy.id === recommended.strategy.id
            return (
              <div
                key={c.strategy.id}
                className={['rounded-xl p-3 border-2 transition-colors', isRecommended ? 'bg-slate-800' : 'bg-slate-900/40 border-slate-700'].join(' ')}
                style={isRecommended ? { borderColor: c.strategy.color } : {}}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.strategy.color }} />
                    <span className="text-slate-200 font-semibold text-sm">{c.strategy.name}</span>
                    {isRecommended && <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300">✨</span>}
                  </div>
                  <span className="text-white font-bold">{formatDuration(c.result.totalDuration)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div>
                    <div className="text-slate-500">Allure</div>
                    <div className="text-indigo-300 font-medium">{formatPace(c.avgPaceSec)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Fatigue</div>
                    <FatigueIndicator value={c.avgFatigue} />
                  </div>
                  <div>
                    <div className="text-slate-500">Calories</div>
                    <div className="text-amber-400 font-medium">{Math.round(c.result.totalCalories)} kcal</div>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {/* Tableau desktop */}
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs border-b border-white/[0.06]">
            <th className="text-left pb-3 pr-4">Stratégie</th>
            <th className="text-right pb-3 pr-4">Temps estimé</th>
            <th className="text-right pb-3 pr-4">Allure moy.</th>
            <th className="text-right pb-3 pr-4">FC moy.</th>
            <th className="text-right pb-3 pr-4">Fatigue finale</th>
            <th className="text-right pb-3 pr-4">Marche</th>
            <th className="text-right pb-3">Calories</th>
          </tr>
        </thead>
        <tbody>
          {comparisons
            .sort((a, b) => a.result.totalDuration - b.result.totalDuration)
            .map((c) => {
              const isRecommended = c.strategy.id === recommended.strategy.id
              const isFastest = c.strategy.id === fastest.strategy.id

              return (
                <tr
                  key={c.strategy.id}
                  className={[
                    'border-b border-white/[0.04] transition-colors',
                    isRecommended ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]',
                  ].join(' ')}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.strategy.color }}
                      />
                      <span className="text-slate-200 font-medium">{c.strategy.name}</span>
                      {isRecommended && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300">
                          ✨ Recommandée
                        </span>
                      )}
                      {isFastest && !isRecommended && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-900/40 text-orange-400">
                          ⚡ Plus rapide
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5 max-w-55 truncate">
                      {c.strategy.description}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-bold text-white">
                    {formatDuration(c.result.totalDuration)}
                  </td>
                  <td className="py-3 pr-4 text-right text-indigo-300">
                    {formatPace(c.avgPaceSec)}
                  </td>
                  <td className="py-3 pr-4 text-right text-rose-300">
                    {Math.round(c.avgHR)} bpm
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <FatigueIndicator value={c.avgFatigue} />
                  </td>
                  <td className="py-3 pr-4 text-right text-slate-400">
                    {c.walkingSegments} seg.
                  </td>
                  <td className="py-3 text-right text-amber-400">
                    {Math.round(c.result.totalCalories)} kcal
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Graphique de superposition ───────────────────────────────────────────────

function PaceOverlayChart({ comparisons }: { comparisons: StrategyComparison[] }) {
  // Construire les données : une ligne par stratégie, une colonne par segment
  const maxSegments = Math.max(...comparisons.map((c) => c.result.segments.length))

  const data = Array.from({ length: maxSegments }, (_, i) => {
    const point: Record<string, number | string> = {
      km: comparisons[0]
        ? ((comparisons[0].result.segments[i]?.segment.cumulativeDistance ?? 0) / 1000).toFixed(1)
        : '0',
    }
    for (const c of comparisons) {
      const seg = c.result.segments[i]
      if (seg) {
        point[c.strategy.id] = Math.round(seg.paceRange.target)
      }
    }
    return point
  })

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-indigo-500 inline-block shrink-0" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Superposition des allures par segment (s/km)
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="km"
            tickFormatter={(v: string) => `${v}km`}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => {
              const m = Math.floor(v / 60)
              const s = Math.floor(v % 60)
              return `${m}:${String(s).padStart(2, '0')}`
            }}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            width={45}
            reversed
          />
          <Tooltip
            formatter={(value) => {
              const v = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
              return [formatPace(v), 'Allure']
            }}
            labelFormatter={(label) => `📍 ${String(label)} km`}
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              fontSize: '12px',
            }}
          />
          <Legend
            formatter={(value: string) => {
              const s = STRATEGY_LIST.find((s) => s.id === value)
              return <span style={{ color: s?.color, fontSize: 11 }}>{s?.name ?? value}</span>
            }}
          />
          {comparisons.map((c) => (
            <Line
              key={c.strategy.id}
              type="monotone"
              dataKey={c.strategy.id}
              stroke={c.strategy.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Graphique FC ─────────────────────────────────────────────────────────────

function HROverlayChart({ comparisons }: { comparisons: StrategyComparison[] }) {
  const maxSegments = Math.max(...comparisons.map((c) => c.result.segments.length))

  const data = Array.from({ length: maxSegments }, (_, i) => {
    const point: Record<string, number | string> = {
      km: comparisons[0]
        ? ((comparisons[0].result.segments[i]?.segment.cumulativeDistance ?? 0) / 1000).toFixed(1)
        : '0',
    }
    for (const c of comparisons) {
      const seg = c.result.segments[i]
      if (seg) {
        point[c.strategy.id] = Math.round(seg.heartRateRange.target)
      }
    }
    return point
  })

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-rose-500 inline-block shrink-0" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Superposition des FC cibles par segment (bpm)
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="km"
            tickFormatter={(v: string) => `${v}km`}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => `${v}`}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            width={38}
          />
          <Tooltip
            formatter={(value) => [`${String(value)} bpm`, 'FC']}
            labelFormatter={(label) => `📍 ${String(label)} km`}
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              fontSize: '12px',
            }}
          />
          <Legend
            formatter={(value: string) => {
              const s = STRATEGY_LIST.find((s) => s.id === value)
              return <span style={{ color: s?.color, fontSize: 11 }}>{s?.name ?? value}</span>
            }}
          />
          {comparisons.map((c) => (
            <Line
              key={c.strategy.id}
              type="monotone"
              dataKey={c.strategy.id}
              stroke={c.strategy.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Carte recommandation ─────────────────────────────────────��───────────────

function RecommendationCard({
  recommended,
  comparisons,
}: {
  recommended: StrategyComparison
  comparisons: StrategyComparison[]
}) {
  const fastest = comparisons.reduce((a, b) =>
    a.result.totalDuration < b.result.totalDuration ? a : b,
  )
  const timeDiff = recommended.result.totalDuration - fastest.result.totalDuration
  const isAlsoFastest = recommended.strategy.id === fastest.strategy.id

  return (
    <div
      className="glass rounded-2xl border p-4 sm:p-5 relative overflow-hidden"
      style={{ borderColor: `${recommended.strategy.color}40` }}
    >
      {/* Halo coloré en fond */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ backgroundColor: recommended.strategy.color }}
      />

      <div className="relative flex flex-col sm:flex-row items-start justify-between gap-4 mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full mb-2"
            style={{ backgroundColor: `${recommended.strategy.color}20`, color: recommended.strategy.color }}>
            <span>✨</span> Recommandée pour votre profil
          </div>
          <h3 className="text-xl font-bold" style={{ color: recommended.strategy.color }}>
            {recommended.strategy.name}
          </h3>
          <p className="text-slate-400 text-sm mt-1">{recommended.strategy.description}</p>
        </div>
        <div className="text-center shrink-0 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-3">
          <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            {formatDuration(recommended.result.totalDuration)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">temps estimé</div>
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-2 sm:gap-3 text-sm">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-slate-500 text-xs mb-1">Allure moyenne</div>
          <div className="text-indigo-300 font-semibold">
            {formatPace(recommended.avgPaceSec)}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-slate-500 text-xs mb-1">Fatigue estimée</div>
          <div className="text-amber-400 font-semibold">
            {(recommended.avgFatigue * 100).toFixed(1)} %
          </div>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-slate-500 text-xs mb-1">vs. plus rapide</div>
          <div className="text-slate-300 font-semibold">
            {isAlsoFastest ? '—' : `+${formatDuration(timeDiff)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Indicateur de fatigue ────────────────────────────────────────────────────

function FatigueIndicator({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value < 0.1 ? '#22c55e' : value < 0.25 ? '#f59e0b' : '#ef4444'
  const label = value < 0.1 ? 'Faible' : value < 0.25 ? 'Modérée' : 'Elevée'
  return (
    <span className="font-semibold text-xs" style={{ color }}>
      {label} ({pct} %)
    </span>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

const STRATEGIES_TO_COMPARE: StrategyId[] = [
  'conservative',
  'performance',
  'negative_split',
  'positive_split',
]

export function StrategyComparison() {
  const { track, profile } = useAppStore()

  const comparisons = useMemo<StrategyComparison[]>(() => {
    if (!track) return []
    return STRATEGIES_TO_COMPARE.map((strategyId) => {
      const strategy = STRATEGY_LIST.find((s) => s.id === strategyId)!
      const result = runSimulation(track, profile, {
        strategyId,
        effortFactor: 0.92,
        applyFatigue: true,
        applyCardiacDrift: true,
      })
      const avgPaceSec =
        result.segments.reduce((acc, s) => acc + s.paceRange.target, 0) /
        result.segments.length
      const avgHR =
        result.segments.reduce((acc, s) => acc + s.heartRateRange.target, 0) /
        result.segments.length
      const avgFatigue =
        result.segments.reduce((acc, s) => acc + s.fatigueFactor, 0) /
        result.segments.length
      const walkingSegments = result.segments.filter((s) => s.isWalking).length

      return { strategy, result, avgPaceSec, avgHR, avgFatigue, walkingSegments }
    })
  }, [track, profile])

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
        <div className="text-5xl">🗺️</div>
        <p className="text-lg">Importez un fichier GPX pour comparer les stratégies.</p>
      </div>
    )
  }

  const recommended = getRecommendation(comparisons)

  return (
    <div className="w-full flex flex-col gap-6">
      <RecommendationCard recommended={recommended} comparisons={comparisons} />
      <ComparisonTable comparisons={comparisons} recommended={recommended} />
      <PaceOverlayChart comparisons={comparisons} />
      <HROverlayChart comparisons={comparisons} />
    </div>
  )
}
