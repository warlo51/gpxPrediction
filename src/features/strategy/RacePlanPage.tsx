/**
 * RacePlanPage — Plan de course généré localement
 * Produit un rapport Prudente / Objectif / Ambitieuse sans appel API.
 */

import { useState, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { generateRaceStrategy } from '@/services/raceStrategy.service'
import type { RaceStrategyReport, StrategyPlan, RaceStrategyId } from '@/types/raceStrategy.types'

// ─── Metadata stratégies (couleurs inline pour éviter les purges Tailwind) ────

const STRATEGY_META: Record<RaceStrategyId, { color: string; name: string; emoji: string }> = {
  prudente:   { color: '#22c55e', name: 'Prudente',   emoji: '🟢' },
  objectif:   { color: '#f97316', name: 'Objectif',   emoji: '🟡' },
  ambitieuse: { color: '#ef4444', name: 'Ambitieuse', emoji: '🔴' },
}

// ─── Section header helper ────────────────────────────────────────────────────

function SectionHeader({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
      <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">{children}</h3>
    </div>
  )
}

// ─── Phases : cartes mobile, table desktop ────────────────────────────────────

function PhasesMobile({ plan }: { plan: StrategyPlan }) {
  return (
    <div className="flex flex-col gap-2">
      {plan.phases.map((phase) => (
        <div
          key={phase.index}
          className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-1.5">
                {phase.riskLevel === 'élevé'  && <span className="text-red-400   text-[10px]">⚠</span>}
                {phase.riskLevel === 'modéré' && <span className="text-amber-400 text-[10px]">↑</span>}
                <span className="text-slate-200 font-semibold text-xs">{phase.label}</span>
              </div>
              <span className="text-slate-500 text-[10px]">km {phase.startKm}–{phase.endKm}</span>
            </div>
            <span className="text-white font-bold text-sm shrink-0">{phase.cumulativeTimeFormatted}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
            <div>
              <div className="text-slate-500 mb-0.5">Allure</div>
              <div className="text-slate-200 font-mono">{phase.targetPaceFormatted}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">FC moy</div>
              <div className="text-slate-200">{phase.avgHR} bpm</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">D+ / D-</div>
              <div>
                <span className="text-orange-300">+{phase.elevationGain}</span>
                <span className="text-slate-600 mx-0.5">/</span>
                <span className="text-sky-300">-{phase.elevationLoss}</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">{phase.rpe}</div>
        </div>
      ))}
    </div>
  )
}

function PhasesDesktop({ plan }: { plan: StrategyPlan }) {
  return (
    <table className="w-full text-xs text-slate-300">
      <thead>
        <tr className="border-b border-white/[0.06] text-slate-500 text-[10px] uppercase tracking-wider">
          <th className="text-left pb-2 pr-3 font-medium">Phase</th>
          <th className="text-right pb-2 px-2 font-medium">D+</th>
          <th className="text-right pb-2 px-2 font-medium">D-</th>
          <th className="text-right pb-2 px-2 font-medium whitespace-nowrap">Allure</th>
          <th className="text-right pb-2 px-2 font-medium">FC</th>
          <th className="text-left  pb-2 px-2 font-medium">RPE</th>
          <th className="text-right pb-2 pl-2 font-medium">Cumul</th>
        </tr>
      </thead>
      <tbody>
        {plan.phases.map((phase) => (
          <tr key={phase.index} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
            <td className="py-2.5 pr-3">
              <div className="flex items-center gap-1.5">
                {phase.riskLevel === 'élevé'  && <span className="text-red-400   text-[10px]">⚠</span>}
                {phase.riskLevel === 'modéré' && <span className="text-amber-400 text-[10px]">↑</span>}
                <span className="font-medium text-slate-200">{phase.label}</span>
              </div>
              <div className="text-slate-500 text-[10px] mt-0.5">km {phase.startKm}–{phase.endKm}</div>
            </td>
            <td className="text-right py-2.5 px-2 text-orange-300 whitespace-nowrap">+{phase.elevationGain}m</td>
            <td className="text-right py-2.5 px-2 text-sky-300 whitespace-nowrap">-{phase.elevationLoss}m</td>
            <td className="text-right py-2.5 px-2 font-mono text-slate-200 whitespace-nowrap">{phase.targetPaceFormatted}</td>
            <td className="text-right py-2.5 px-2 whitespace-nowrap">{phase.avgHR} bpm</td>
            <td className="py-2.5 px-2 text-slate-400 text-[10px]">{phase.rpe}</td>
            <td className="text-right py-2.5 pl-2 font-mono text-slate-400 whitespace-nowrap text-[10px]">{phase.cumulativeTimeFormatted}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Card stratégie ───────────────────────────────────────────────────────────

function StrategyCard({ plan }: { plan: StrategyPlan }) {
  const meta = STRATEGY_META[plan.id]

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Bande de couleur en haut */}
      <div className="h-1 w-full" style={{ background: meta.color }} />

      <div className="p-4 sm:p-5 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: meta.color }}
            >
              {meta.emoji} {meta.name}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-white">{plan.totalTimeFormatted}</span>
              <span className="text-sm text-slate-400 font-mono">{plan.avgPaceFormatted}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Risque explosion</div>
            <div className={`text-sm font-semibold mt-0.5 ${
              plan.blowupRisk === 'Élevé'  ? 'text-red-400'   :
              plan.blowupRisk === 'Modéré' ? 'text-amber-400' : 'text-green-400'
            }`}>{plan.blowupRisk}</div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'FC moy',     value: `${plan.avgHR} bpm` },
            { label: 'FC max est', value: `${plan.maxHREstimated} bpm` },
            { label: 'Calories',   value: `${plan.totalCalories}` , sub: 'kcal' },
            { label: 'Déficit',    value: `${plan.nutrition.icon} ${plan.nutrition.deficitKcal}`, sub: 'kcal' },
          ].map(({ label, value, sub }) => (
            <div
              key={label}
              className="flex flex-col gap-0.5 px-2 sm:px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center"
            >
              <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-100 leading-tight">
                {value}
                {sub && <span className="text-[9px] text-slate-400 ml-0.5">{sub}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Phases — responsive */}
        <div>
          <SectionHeader accent={meta.color}>Analyse par phase</SectionHeader>
          <div className="sm:hidden">
            <PhasesMobile plan={plan} />
          </div>
          <div className="hidden sm:block">
            <PhasesDesktop plan={plan} />
          </div>
        </div>

        {/* Zones à risque */}
        {plan.riskZones.length > 0 && (
          <div>
            <SectionHeader accent="#f97316">Zones à risque</SectionHeader>
            <div className="flex flex-col gap-2">
              {plan.riskZones.map((zone, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
                    zone.level === 'élevé'
                      ? 'bg-red-500/10   border-red-500/30   text-red-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <span>{zone.level === 'élevé' ? '⚠️' : '↑'}</span>
                  <span>{zone.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nutrition */}
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
          plan.nutrition.icon === '✅' ? 'bg-green-500/10 border-green-500/30' :
          plan.nutrition.icon === '⚠️' ? 'bg-amber-500/10 border-amber-500/30' :
                                         'bg-red-500/10   border-red-500/30'
        }`}>
          <span className="text-base leading-none mt-0.5 shrink-0">{plan.nutrition.icon}</span>
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

// ─── Tableau comparatif ───────────────────────────────────────────────────────

function ComparatifTable({ report }: { report: RaceStrategyReport }) {
  const rows: Array<{ label: string; values: string[]; highlight?: boolean }> = [
    { label: 'Temps total',       values: report.strategies.map(s => s.totalTimeFormatted), highlight: true },
    { label: 'Allure moy.',       values: report.strategies.map(s => s.avgPaceFormatted) },
    { label: 'FC moy.',           values: report.strategies.map(s => `${s.avgHR} bpm`) },
    { label: 'FC max estimée',    values: report.strategies.map(s => `${s.maxHREstimated} bpm`) },
    { label: 'Calories',          values: report.strategies.map(s => `${s.totalCalories} kcal`) },
    { label: 'Déficit calorique', values: report.strategies.map(s => `${s.nutrition.deficitKcal} kcal`) },
    { label: 'Zones risque élevé',values: report.strategies.map(s => String(s.riskZones.filter(z => z.level === 'élevé').length)) },
    { label: 'Risque explosion',  values: report.strategies.map(s => s.blowupRisk) },
  ]

  return (
    <div className="glass rounded-2xl overflow-x-auto">
      <table className="w-full text-xs min-w-[320px]">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left px-4 py-3 text-slate-500 font-medium w-2/5" />
            {report.strategies.map(s => (
              <th
                key={s.id}
                className="text-center px-3 py-3 font-semibold text-xs"
                style={{ color: STRATEGY_META[s.id].color }}
              >
                {s.emoji} {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="px-4 py-2.5 text-slate-500">{row.label}</td>
              {row.values.map((val, j) => (
                <td
                  key={j}
                  className={`text-center px-3 py-2.5 font-mono ${
                    row.highlight ? 'text-white font-bold' : 'text-slate-300'
                  }`}
                >
                  {row.label === 'Risque explosion' ? (
                    <span className={
                      val === 'Élevé'  ? 'text-red-400'   :
                      val === 'Modéré' ? 'text-amber-400' : 'text-green-400'
                    }>{val}</span>
                  ) : val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function RacePlanPage() {
  const { track, profile } = useAppStore()
  const [carbTolerance, setCarbTolerance] = useState(60)
  const [report, setReport] = useState<RaceStrategyReport | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeStrategy, setActiveStrategy] = useState<RaceStrategyId>('objectif')

  const handleGenerate = () => {
    if (!track) return
    setIsGenerating(true)
    setTimeout(() => {
      setReport(generateRaceStrategy(track, profile, carbTolerance))
      setIsGenerating(false)
    }, 50)
  }

  const activePlan = useMemo(
    () => report?.strategies.find(s => s.id === activeStrategy) ?? report?.strategies[1] ?? null,
    [report, activeStrategy],
  )

  // ── Pas de GPX ──
  if (!track) {
    return (
      <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-4xl">🗺️</div>
        <p className="text-slate-400 text-sm max-w-xs">
          Importe d'abord un fichier GPX depuis le{' '}
          <span className="text-[#ffb692] font-medium">Course Planner</span>{' '}
          pour générer ton plan de course.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Config ── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

          {/* Infos parcours */}
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

          {/* Contrôles */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Tolérance glucides
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={30} max={120} step={5}
                  value={carbTolerance}
                  onChange={e => { setCarbTolerance(Number(e.target.value)); setReport(null) }}
                  className="w-20 sm:w-28 accent-[#ff6d00]"
                />
                <span className="text-xs font-mono text-slate-200 w-12 shrink-0">{carbTolerance} g/h</span>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold text-[#1a0800]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         hover:brightness-110 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)' }}
            >
              {isGenerating ? '…' : report ? '↻ Recalculer' : 'Générer le plan'}
            </button>
          </div>
        </div>
      </div>

      {report && (
        <>
          {/* ── Lecture du parcours ── */}
          <div className="glass rounded-2xl p-4 sm:p-5">
            <SectionHeader accent="#6366f1">Lecture du parcours</SectionHeader>
            <ul className="flex flex-col gap-3">
              {report.lecture.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className={`shrink-0 mt-0.5 text-xs font-mono px-2 py-0.5 rounded-md whitespace-nowrap ${
                    bullet.isWarning
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-white/[0.04] text-slate-500 border border-white/[0.06]'
                  }`}>
                    {bullet.kmRange}
                  </span>
                  <span className={`text-xs leading-relaxed ${bullet.isWarning ? 'text-slate-200' : 'text-slate-400'}`}>
                    {bullet.content}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Sélecteur de stratégie ── */}
          <div className="flex gap-2 sm:gap-3">
            {report.strategies.map(s => {
              const meta = STRATEGY_META[s.id]
              const isActive = activeStrategy === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStrategy(s.id)}
                  className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3
                             px-3 sm:px-4 py-2.5 rounded-xl text-left transition-all border-2"
                  style={{
                    borderColor: isActive ? meta.color : 'rgba(255,255,255,0.06)',
                    background:  isActive ? `${meta.color}18` : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{meta.emoji}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isActive ? meta.color : undefined }}
                    >
                      {meta.name}
                    </span>
                  </div>
                  <span className={`font-mono text-xs sm:text-sm font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>
                    {s.totalTimeFormatted}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Détail stratégie active ── */}
          {activePlan && <StrategyCard plan={activePlan} />}

          {/* ── Comparatif ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-5 rounded-full shrink-0 bg-slate-500" />
              <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Comparatif</h3>
            </div>
            <ComparatifTable report={report} />
          </div>
        </>
      )}
    </div>
  )
}
