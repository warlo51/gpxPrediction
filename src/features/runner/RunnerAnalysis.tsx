/**
 * Analyse poussée du profil coureur
 * Graphiques et insights générés depuis l'historique Strava
 */

import { useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { useAppStore } from '@/stores/appStore'
import { analyzeRunner } from '@/services/runnerAnalysis.service'
import type { RunnerAnalysis as RunnerAnalysisType, StrengthWeakness } from '@/services/runnerAnalysis.service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '--'
  const m = Math.floor(secPerKm / 60)
  const s = Math.floor(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

// ─── Composant score circulaire ───────────────────────────────────────────────

function ScoreRing({ value, label, color, size = 80 }: {
  value: number; label: string; color: string; size?: number
}) {
  const r = (size / 2) - 8
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={7} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="text-center -mt-1">
        <div className="font-bold text-white text-sm" style={{ color }}>{value}</div>
        <div className="text-slate-500 text-[10px] leading-tight">{label}</div>
      </div>
    </div>
  )
}

// ─── Tooltip personnalisé ─────────────────────────────────────────────────────

function PaceTip({ active, payload, label }: { active?: boolean; payload?: {value: number; name: string}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-white font-medium">
          {p.name === 'paceSecPerKm' ? formatPace(p.value) + ' /km' : p.value}
        </div>
      ))}
    </div>
  )
}

// ─── Carte stat ───────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'text-white' }: {
  icon: string; label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white/3 border border-white/6 rounded-xl p-3 sm:p-4">
      <div className="text-xl mb-2">{icon}</div>
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className={`font-bold text-sm sm:text-base ${color}`}>{value}</div>
      {sub && <div className="text-slate-600 text-xs mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Carte force/faiblesse ────────────────────────────────────────────────────

function InsightCard({ item }: { item: StrengthWeakness }) {
  const colors = {
    force: 'border-emerald-800/40 bg-emerald-950/20',
    faiblesse: 'border-red-800/40 bg-red-950/20',
    neutre: 'border-white/6 bg-white/3',
  }
  const textColors = {
    force: 'text-emerald-400',
    faiblesse: 'text-red-400',
    neutre: 'text-slate-400',
  }
  const badges = {
    force: '✅ Force',
    faiblesse: '⚠️ À travailler',
    neutre: 'ℹ️ Info',
  }

  return (
    <div className={`rounded-xl border p-3 flex items-start gap-3 ${colors[item.type]}`}>
      <span className="text-2xl shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold text-sm">{item.label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
            item.type === 'force' ? 'border-emerald-700/50 bg-emerald-900/30 text-emerald-400'
            : item.type === 'faiblesse' ? 'border-red-700/50 bg-red-900/30 text-red-400'
            : 'border-white/10 bg-white/5 text-slate-400'
          }`}>
            {badges[item.type]}
          </span>
          {item.value && (
            <span className={`ml-auto font-bold text-sm ${textColors[item.type]}`}>{item.value}</span>
          )}
        </div>
        <p className="text-slate-500 text-xs mt-1 leading-relaxed">{item.detail}</p>
      </div>
    </div>
  )
}

// ─── Section : Tendance allure ────────────────────────────────────────────────

function PaceTrendChart({ data }: { data: RunnerAnalysisType['performanceTrend'] }) {
  if (!data.length) return null

  const chartData = data.map(p => ({
    date: formatDate(p.date),
    paceSecPerKm: p.paceSecPerKm,
    effort: p.effortScore,
    distanceKm: p.distanceKm.toFixed(1),
    hr: p.avgHR,
  }))

  // Calcul de la tendance linéaire (régression simple)
  const n = chartData.length
  const xMean = (n - 1) / 2
  const yMean = chartData.reduce((a, p) => a + p.paceSecPerKm, 0) / n
  let num = 0, den = 0
  chartData.forEach((p, i) => { num += (i - xMean) * (p.paceSecPerKm - yMean); den += (i - xMean) ** 2 })
  const slope = den ? num / den : 0
  const intercept = yMean - slope * xMean
  const trendStart = Math.round(intercept)
  const trendEnd = Math.round(intercept + slope * (n - 1))
  const improving = trendEnd < trendStart

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-indigo-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Évolution de l'allure
          </h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          improving
            ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40'
            : 'bg-amber-900/30 text-amber-400 border border-amber-800/40'
        }`}>
          {improving ? '📈 Progression détectée' : '➡️ Allure stable'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} />
          <YAxis
            reversed
            tickFormatter={formatPace}
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<PaceTip />} />
          <Line
            type="monotone" dataKey="paceSecPerKm" name="paceSecPerKm"
            stroke="#6366f1" strokeWidth={2} dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
          {/* Ligne de tendance */}
          <ReferenceLine
            segment={[
              { x: chartData[0]?.date, y: trendStart },
              { x: chartData[chartData.length - 1]?.date, y: trendEnd },
            ]}
            stroke={improving ? '#22c55e' : '#f59e0b'}
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 mt-2 text-center">
        Axe Y inversé : une valeur plus basse = une allure plus rapide
      </p>
    </div>
  )
}

// ─── Section : Courbe vitesse/pente ─────��────────────────────────────────────

function GradePaceChart({ data }: { data: RunnerAnalysisType['gradePaceCurve'] }) {
  if (!data.length) return (
    <div className="glass rounded-2xl p-4 sm:p-5 flex items-center justify-center text-slate-600 text-sm h-40">
      Pas assez de streams GPS pour la courbe vitesse/pente
    </div>
  )

  const chartData = data.map(p => ({
      grade: `${p.grade > 0 ? '+' : ''}${p.grade}%`,
      gradeRaw: p.grade,
      vitesse: p.speedKmh,
      allure: p.paceSecPerKm,
      samples: p.sampleCount,
  }))

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-orange-500 inline-block" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Vitesse réelle par pente
        </h3>
        <span className="text-xs text-slate-600 ml-auto">données GPS réelles</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="grade" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={{ stroke: '#334155' }} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} unit=" km/h" width={52} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
            formatter={(v: unknown, name?: unknown) => {
              const num = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
              return String(name) === 'vitesse' ? [`${num} km/h`, 'Vitesse'] : [`${formatPace(num)} /km`, 'Allure']
            }}
            labelFormatter={(l) => `Pente ${l}`}
          />
          <Bar dataKey="vitesse" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.gradeRaw < -5 ? '#6366f1'
                  : entry.gradeRaw < 0 ? '#818cf8'
                  : entry.gradeRaw === 0 ? '#22c55e'
                  : entry.gradeRaw <= 10 ? '#f59e0b'
                  : '#ef4444'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-3 mt-2 flex-wrap text-[10px] text-slate-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />Descente forte</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Plat</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />Montée modérée</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Montée raide</span>
      </div>
    </div>
  )
}

// ─── Section : Charge hebdomadaire ────────────────────────────────────────────

function WeeklyLoadChart({ data }: { data: RunnerAnalysisType['weeklyLoad'] }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-emerald-500 inline-block" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Charge hebdomadaire — 12 semaines
        </h3>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={{ stroke: '#334155' }} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={{ stroke: '#334155' }} tickLine={false} unit=" km" width={40} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
            formatter={(v: unknown, name?: unknown) => {
              const num = typeof v === 'number' ? v : parseFloat(String(v ?? 0))
              return String(name) === 'distanceKm' ? [`${num} km`, 'Distance'] : [`${num} m`, 'D+']
            }}
            labelFormatter={(l) => `Semaine du ${l}`}
          />
          <Bar dataKey="distanceKm" radius={[4, 4, 0, 0]} fill="#6366f1" opacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Section : Zones FC (composant réutilisable) ──────────────────────────────

function ZoneList({
  zones,
  hasHR,
  title,
  subtitle,
  accentColor,
  showPct = true,
}: {
  zones: { zone: number; label: string; color: string; minHR: number; maxHR: number; pct: number; minPct?: number; maxPct?: number }[]
  hasHR: boolean
  title: string
  subtitle: string
  accentColor: string
  showPct?: boolean
}) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1 h-5 rounded-full inline-block" style={{ backgroundColor: accentColor }} />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">{title}</h3>
        {!hasHR && (
          <span className="text-xs text-slate-600 ml-auto">Estimées</span>
        )}
      </div>
      <p className="text-xs text-slate-600 mb-4 ml-3">{subtitle}</p>
      <div className="space-y-2.5 flex-1">
        {zones.map(z => (
          <div key={z.zone} className="flex items-center gap-2">
            <span className="text-slate-500 text-xs w-3 shrink-0">{z.zone}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5 gap-1">
                <span className="text-xs truncate" style={{ color: z.color }}>{z.label}</span>
                <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                  {z.minHR}–{z.maxHR} bpm
                  {'minPct' in z && z.minPct !== undefined
                    ? ` (${z.minPct}–${z.maxPct}% FCR)`
                    : ''}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${showPct ? z.pct : 0}%`, backgroundColor: z.color }}
                />
              </div>
            </div>
            {showPct && (
              <span className="text-xs font-medium w-7 text-right shrink-0" style={{ color: z.color }}>
                {z.pct}%
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Légende FC repos / max */}
      <div className="mt-3 pt-3 border-t border-white/6 flex justify-between text-xs text-slate-600">
        <span>FC repos : <span className="text-slate-400">{zones[0]?.minHR ? zones[0].minHR - 1 : '--'} bpm env.</span></span>
        <span>FC max : <span className="text-slate-400">{zones[zones.length - 1]?.maxHR ?? '--'} bpm</span></span>
      </div>
    </div>
  )
}

// ─── Section : Répartition terrain ───────────────────────────────────────────

function TerrainBreakdown({ data, hasStreams }: {
  data: RunnerAnalysisType['terrainBreakdown']; hasStreams: boolean
}) {
  if (!hasStreams) return null
  const items = [
    { label: 'Plat', value: data.flat, color: '#22c55e', icon: '➡️' },
    { label: 'Montée', value: data.uphill, color: '#f97316', icon: '⬆️' },
    { label: 'Descente', value: data.downhill, color: '#6366f1', icon: '⬇️' },
  ]
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-amber-500 inline-block" />
        <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
          Répartition du terrain
        </h3>
      </div>
      {/* Barre segmentée */}
      <div className="flex h-4 rounded-full overflow-hidden mb-4 gap-0.5">
        {items.map(it => (
          <div key={it.label} style={{ width: `${it.value}%`, backgroundColor: it.color }} className="transition-all duration-700" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(it => (
          <div key={it.label} className="text-center">
            <div className="text-lg">{it.icon}</div>
            <div className="font-bold text-sm" style={{ color: it.color }}>{it.value}%</div>
            <div className="text-slate-500 text-xs">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function RunnerAnalysisPanel() {
  const { sessions, profile } = useAppStore()

  const analysis = useMemo(
    () => analyzeRunner(sessions, profile),
    [sessions, profile],
  )

  const hasStreams = sessions.some(s => s.streams?.distance)
  const hasHR = sessions.some(s => s.avgHeartRate)
  const { stats } = analysis

  if (sessions.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
        <span className="text-5xl">📊</span>
        <h3 className="text-white font-bold text-lg">Aucun historique disponible</h3>
        <p className="text-slate-500 text-sm max-w-sm">
          Connectez votre compte Strava dans l'onglet <strong className="text-slate-300">Historique</strong> pour débloquer l'analyse complète de votre profil.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col gap-6">

      {/* ── Scores globaux ── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1 h-5 rounded-full bg-indigo-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Scores coureur</h3>
        </div>
        <div className="flex justify-around flex-wrap gap-4">
          <ScoreRing value={stats.consistencyScore} label="Régularité" color="#22c55e" />
          <ScoreRing value={stats.progressionScore} label="Progression" color="#6366f1" />
          <ScoreRing value={stats.trailScore} label="Spécificité trail" color="#f97316" />
          <ScoreRing value={Math.round(profile.enduranceScore * 100)} label="Endurance" color="#f59e0b" />
        </div>
      </div>

      {/* ── Stats totaux ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard icon="📏" label="Distance totale" value={`${stats.totalDistanceKm} km`} color="text-indigo-300" />
        <StatCard icon="⛰️" label="D+ total" value={`${stats.totalElevationGain.toLocaleString('fr-FR')} m`} color="text-orange-400" />
        <StatCard icon="⏱️" label="Temps total" value={`${stats.totalDurationHours.toFixed(0)} h`} color="text-slate-200" />
        <StatCard icon="🏃" label="Séances" value={`${stats.totalSessions}`} sub={`Moy. ${stats.avgDistanceKm} km`} />
        <StatCard icon="🏅" label="Plus longue" value={`${stats.longestRunKm} km`} color="text-emerald-400" />
        <StatCard icon="🔺" label="Plus grand D+" value={`${stats.biggestElevGain} m`} color="text-amber-400" />
      </div>

      {/* ── Forces & Faiblesses ── */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1 h-5 rounded-full bg-amber-500 inline-block" />
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Forces &amp; points à améliorer
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          {analysis.strengths.map((item, i) => (
            <InsightCard key={i} item={item} />
          ))}
        </div>
      </div>

      {/* ── Tendance allure ── */}
      {analysis.performanceTrend.length >= 3 && (
        <PaceTrendChart data={analysis.performanceTrend} />
      )}

      {/* ── Charge hebdo + Courbe pente côte à côte sur grand écran ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <WeeklyLoadChart data={analysis.weeklyLoad} />
        <GradePaceChart data={analysis.gradePaceCurve} />
      </div>

      {/* ── Zones FC ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ZoneList
          zones={analysis.trainingZones}
          hasHR={hasHR}
          title="Zones FC — % FC max"
          subtitle="Méthode classique : intensité basée sur le % de votre FC maximale"
          accentColor="#ef4444"
          showPct={hasHR}
        />
        <ZoneList
          zones={analysis.karvonenZones}
          hasHR={hasHR}
          title="Zones FC — Karvonen (FCR)"
          subtitle="Méthode Karvonen : tient compte de votre FC de repos → plus précise"
          accentColor="#f97316"
          showPct={hasHR}
        />
      </div>

      {/* ── Terrain ── */}
      <TerrainBreakdown data={analysis.terrainBreakdown} hasStreams={hasStreams} />

    </div>
  )
}
