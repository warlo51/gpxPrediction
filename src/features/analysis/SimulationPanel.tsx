/**
 * Panneau de configuration et résultats de simulation
 */

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAppStore } from '@/stores/appStore'
import { runSimulation, formatDuration, formatPace } from '@/services/simulationEngine.service'
import { STRATEGY_LIST } from '@/models/strategies'
import type { SimulationResult, SimulationParams, StrategyId } from '@/types'

// ─── Sélecteur de stratégie ───────────────────────────────────────────────────

function StrategySelector({
  selected,
  onChange,
}: {
  selected: StrategyId
  onChange: (id: StrategyId) => void
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
      {STRATEGY_LIST.filter((s) => s.id !== 'custom').map((strategy) => (
        <button
          key={strategy.id}
          onClick={() => onChange(strategy.id)}
          className={[
            'text-left p-3 sm:p-4 rounded-xl border-2 transition-all duration-200',
            selected === strategy.id
              ? 'border-current bg-slate-800'
              : 'border-slate-700 bg-white/3 hover:border-slate-500',
          ].join(' ')}
          style={selected === strategy.id ? { borderColor: strategy.color } : {}}
        >
          <div
            className="font-semibold text-sm mb-1"
            style={{ color: strategy.color }}
          >
            {strategy.name}
          </div>
          <div className="text-slate-500 text-xs leading-relaxed hidden sm:block">
            {strategy.description}
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Carte résumé ─────────────────────────────────────────────────────────────

function ResultSummary({ result }: { result: SimulationResult }) {
  const strategy = STRATEGY_LIST.find((s) => s.id === result.strategyId)
  const walkingSegments = result.segments.filter((s) => s.isWalking).length
  const avgFatigue =
    result.segments.reduce((acc, s) => acc + s.fatigueFactor, 0) /
    result.segments.length

  return (
    <div
      className="glass rounded-2xl border p-4 sm:p-5"
      style={{ borderColor: `${strategy?.color ?? '#6366f1'}30` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full inline-block" style={{ backgroundColor: strategy?.color ?? '#6366f1' }} />
        <div className="text-sm font-semibold" style={{ color: strategy?.color ?? '#6366f1' }}>
          Résultats — Stratégie {strategy?.name}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <SummaryCard
          icon="⏱️"
          label="Temps estimé"
          value={formatDuration(result.totalDuration)}
          accent
        />
        <SummaryCard
          icon="🔥"
          label="Calories"
          value={`${Math.round(result.totalCalories)} kcal`}
        />
        <SummaryCard
          icon="😓"
          label="Fatigue finale"
          value={`${(avgFatigue * 100).toFixed(1)} %`}
          warn={avgFatigue > 0.25}
        />
        <SummaryCard
          icon="🚶"
          label="Segments en marche"
          value={`${walkingSegments} / ${result.segments.length}`}
        />
      </div>

      {/* Allure et FC moyennes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white/3 border border-white/6 rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-1">Allure moyenne estimée</div>
          <div className="text-white font-bold">
            {formatPace(
              result.segments.reduce((acc, s) => acc + s.paceRange.target, 0) /
                result.segments.length,
            )}
          </div>
          <div className="text-slate-600 text-xs mt-0.5">
            Plage :{' '}
            {formatPace(Math.min(...result.segments.map((s) => s.paceRange.min)))} →{' '}
            {formatPace(Math.max(...result.segments.map((s) => s.paceRange.max)))}
          </div>
        </div>
        <div className="bg-white/3 border border-white/6 rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-1">FC moyenne estimée</div>
          <div className="text-white font-bold">
            {Math.round(
              result.segments.reduce((acc, s) => acc + s.heartRateRange.target, 0) /
                result.segments.length,
            )}{' '}
            bpm
          </div>
          <div className="text-slate-600 text-xs mt-0.5">
            Plage :{' '}
            {Math.round(Math.min(...result.segments.map((s) => s.heartRateRange.min)))} →{' '}
            {Math.round(Math.max(...result.segments.map((s) => s.heartRateRange.max)))} bpm
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Graphique allure par segment ─────────────────────────────────────────────

function PaceChart({ result }: { result: SimulationResult }) {
  const strategy = STRATEGY_LIST.find((s) => s.id === result.strategyId)
  const color = strategy?.color ?? '#6366f1'

  const data = result.segments.map((s, i) => ({
    name: `S${i + 1}`,
    allure: Math.round(s.paceRange.target),
    allureMin: Math.round(s.paceRange.min),
    allureMax: Math.round(s.paceRange.max),
    km: (s.segment.cumulativeDistance / 1000).toFixed(1),
    type: s.segment.type,
    isWalking: s.isWalking,
  }))

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Allure cible par segment (s/km)
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="km"
            tickFormatter={(v: string) => `${v}km`}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
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
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              fontSize: '12px',
            }}
            labelFormatter={(label) => `📍 ${String(label)} km`}
          />
          <Bar dataKey="allure" radius={[4, 4, 0, 0]}
            fill={color}
            opacity={0.85}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Tableau détaillé ───────────���─────────────────────────────────────────────

function SegmentTable({ result }: { result: SimulationResult }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-5 rounded-full bg-violet-500 inline-block" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Détail par segment
        </h3>
      </div>

      {/* Cartes mobile */}
      <div className="flex flex-col gap-2 sm:hidden">
        {result.segments.map((s, i) => (
          <div key={s.segment.id} className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">Segment {i + 1}</span>
              <span className="text-white font-semibold text-sm">{formatDuration(s.estimatedDuration)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Pente </span>
                <span className="font-medium" style={{ color: s.segment.avgGrade > 0 ? '#f97316' : s.segment.avgGrade < 0 ? '#38bdf8' : '#94a3b8' }}>
                  {s.segment.avgGrade.toFixed(1)} %
                </span>
              </div>
              <div>
                <span className="text-slate-500">Dist. </span>
                <span className="text-white">{(s.segment.distance / 1000).toFixed(2)} km</span>
              </div>
              <div>
                <span className="text-slate-500">Allure </span>
                {s.isWalking
                  ? <span className="text-slate-500 italic">Marche</span>
                  : <span className="text-indigo-300">{formatPace(s.paceRange.target)}</span>
                }
              </div>
              <div>
                <span className="text-slate-500">FC </span>
                <span className="text-rose-300">{Math.round(s.heartRateRange.target)} bpm</span>
              </div>
              <div>
                <span className="text-slate-500">Fatigue </span>
                <FatigueBar value={s.fatigueFactor} />
              </div>
              <div>
                <span className="text-slate-500">Calories </span>
                <span className="text-amber-400">{Math.round(s.caloriesBurned)} kcal</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tableau desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs text-slate-400">
          <thead>
            <tr className="text-slate-500 border-b border-white/6">
              <th className="text-left pb-2 pr-3">#</th>
              <th className="text-right pb-2 pr-3">Dist.</th>
              <th className="text-right pb-2 pr-3">Pente</th>
              <th className="text-right pb-2 pr-3">Durée</th>
              <th className="text-right pb-2 pr-3">Allure cible</th>
              <th className="text-right pb-2 pr-3">FC cible</th>
              <th className="text-right pb-2 pr-3">Fatigue</th>
              <th className="text-right pb-2">Calories</th>
            </tr>
          </thead>
          <tbody>
            {result.segments.map((s, i) => (
              <tr key={s.segment.id} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                <td className="py-1.5 pr-3 text-slate-600">{i + 1}</td>
                <td className="py-1.5 pr-3 text-right">{(s.segment.distance / 1000).toFixed(2)} km</td>
                <td className="py-1.5 pr-3 text-right font-medium" style={{ color: s.segment.avgGrade > 0 ? '#f97316' : s.segment.avgGrade < 0 ? '#38bdf8' : '#94a3b8' }}>
                  {s.segment.avgGrade.toFixed(1)} %
                </td>
                <td className="py-1.5 pr-3 text-right text-white">{formatDuration(s.estimatedDuration)}</td>
                <td className="py-1.5 pr-3 text-right">
                  {s.isWalking ? <span className="text-slate-500 italic">Marche</span>
                    : <span className="text-indigo-300">{formatPace(s.paceRange.min)} – {formatPace(s.paceRange.max)}</span>}
                </td>
                <td className="py-1.5 pr-3 text-right text-rose-300">
                  {Math.round(s.heartRateRange.min)}–{Math.round(s.heartRateRange.max)} bpm
                </td>
                <td className="py-1.5 pr-3 text-right"><FatigueBar value={s.fatigueFactor} /></td>
                <td className="py-1.5 text-right text-amber-400">{Math.round(s.caloriesBurned)} kcal</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Barre de fatigue ─────────────────────────────────────────────────────────

function FatigueBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value < 0.1 ? '#22c55e' : value < 0.25 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct * 2}%`, backgroundColor: color }}
        />
      </div>
      <span style={{ color }}>{pct} %</span>
    </div>
  )
}

// ─── Carte summary ────────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, accent, warn,
}: {
  icon: string; label: string; value: string; accent?: boolean; warn?: boolean
}) {
  return (
    <div className={[
      'rounded-xl p-3 sm:p-4 text-center border transition-all duration-200',
      accent
        ? 'bg-indigo-950/40 border-indigo-800/40'
        : warn
          ? 'bg-amber-950/30 border-amber-800/30'
          : 'bg-white/3 border-white/6',
    ].join(' ')}>
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={[
        'font-bold text-sm sm:text-base',
        accent ? 'text-indigo-300' : warn ? 'text-amber-400' : 'text-white',
      ].join(' ')}>
        {value}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function SimulationPanel() {
  const { track, profile } = useAppStore()

  const [strategyId, setStrategyId] = useState<StrategyId>('performance')
  const [effortFactor, setEffortFactor] = useState(1.0)
  const [applyFatigue, setApplyFatigue] = useState(true)
  const [applyCardiacDrift, setApplyCardiacDrift] = useState(true)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-slate-500">
        <div className="text-5xl">🗺️</div>
        <p className="text-lg">Importez d'abord un fichier GPX pour lancer la simulation.</p>
      </div>
    )
  }

  function handleSimulate() {
    if (!track) return
    setIsRunning(true)

    // Micro-délai pour laisser React mettre à jour l'UI
    setTimeout(() => {
      const params: SimulationParams = {
        strategyId,
        effortFactor,
        applyFatigue,
        applyCardiacDrift,
      }
      const res = runSimulation(track, profile, params)
      setResult(res)
      setIsRunning(false)
    }, 50)
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Configuration */}
      <div className="glass rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1 h-5 rounded-full bg-indigo-500 inline-block" />
          <h2 className="text-white font-bold text-base sm:text-lg">Configuration de la simulation</h2>
        </div>

        {/* Stratégie */}
        <div className="mb-6">
          <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wide mb-3">
            Stratégie de course
          </h3>
          <StrategySelector selected={strategyId} onChange={setStrategyId} />
        </div>

        {/* Paramètres */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
          {/* Effort global */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-2">
              Niveau d'effort global
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.7} max={1.10} step={0.01}
                value={effortFactor}
                onChange={(e) => setEffortFactor(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-white font-semibold w-10 text-right">
                {Math.round(effortFactor * 100)} %
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              70 % = très conservateur · 100 % = allure calibrée · 110 % = effort maximal
            </p>
          </div>

          {/* Fatigue */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-3">
              Modèles activés
            </label>
            <div className="flex flex-col gap-2">
              <Toggle
                label="Fatigue progressive"
                value={applyFatigue}
                onChange={setApplyFatigue}
              />
              <Toggle
                label="Dérive cardiaque"
                value={applyCardiacDrift}
                onChange={setApplyCardiacDrift}
              />
            </div>
          </div>

          {/* Résumé parcours */}
          <div className="bg-black/20 border border-white/4 rounded-xl p-3 text-xs text-slate-400 space-y-1.5">
            <div className="font-medium text-slate-300 mb-2">📋 Parcours chargé</div>
            <div className="flex justify-between">
              <span>Distance</span>
              <span className="text-white">{(track.totalDistance / 1000).toFixed(1)} km</span>
            </div>
            <div className="flex justify-between">
              <span>Dénivelé +</span>
              <span className="text-orange-400">+{Math.round(track.totalElevationGain)} m</span>
            </div>
            <div className="flex justify-between">
              <span>Segments</span>
              <span className="text-white">{track.segments.length}</span>
            </div>
            <div className="border-t border-white/4 pt-1.5 mt-1.5">
              <div className="font-medium text-slate-300 mb-1">👤 Profil utilisé</div>
              <div className="flex justify-between">
                <span>Allure de base</span>
                <span className="text-indigo-300">
                  {Math.floor(profile.basePaceSecPerKm / 60)}:{String(profile.basePaceSecPerKm % 60).padStart(2, '0')} /km
                </span>
              </div>
              <div className="flex justify-between">
                <span>Vitesse plat</span>
                <span className="text-indigo-300">{(profile.speedModel.flatSpeed * 3.6).toFixed(1)} km/h</span>
              </div>
              <div className="flex justify-between">
                <span>Séances calibrées</span>
                <span className="text-orange-400">{profile.sessionCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton lancement */}
        <button
          onClick={handleSimulate}
          disabled={isRunning}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                     text-white font-semibold text-sm transition-all duration-200
                     shadow-lg shadow-indigo-900/30"
        >
          {isRunning ? '⏳ Calcul en cours…' : '🚀 Lancer la simulation'}
        </button>
      </div>

      {/* Résultats */}
      {result && (
        <>
          <ResultSummary result={result} />
          <PaceChart result={result} />
          <SegmentTable result={result} />
        </>
      )}
    </div>
  )
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  label, value, onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
    >
      <div
        className={[
          'w-9 h-5 rounded-full transition-colors duration-200 relative',
          value ? 'bg-indigo-600' : 'bg-slate-700',
        ].join(' ')}
      >
        <div
          className={[
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200',
            value ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </div>
      {label}
    </button>
  )
}
