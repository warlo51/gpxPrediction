/**
 * Page Planificateur unifiée — Import GPX + Stratégie de course
 * Import → simulation auto → résultats immédiats
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import { parseGpxFile } from '@/services/gpxParser.service'
import { generateRaceStrategy, formatMargin } from '@/services/raceStrategy.service'
import { formatDuration } from '@/services/simulationEngine.service'
import { getGpxTracks } from '@/services/supabase.service'
import { useGpxSave } from '@/hooks/useGpxSave'
import { TrackMap } from './TrackMap'
import { Track3DView } from './Track3DView'
import { ElevationChart } from './ElevationChart'
import type { GpxTrack, EnvironmentConditions } from '@/types'
import { NEUTRAL_ENVIRONMENT } from '@/types/simulation.types'
import type { GpxTrackRow, TrackProfile } from '@/services/supabase.service'
import type { RaceStrategyReport, StrategyPlan, RaceStrategyId, StrategyRecommendation, GarminCurveAnchor, LectureBullet, RaceCheckpoint } from '@/types/raceStrategy.types'

// ─── Strategy metadata ──────────────────────────────────────────────────────

const STRATEGY_META: Record<RaceStrategyId, { color: string; name: string; emoji: string }> = {
  prudente:   { color: '#15803d', name: 'Prudente',   emoji: '🟢' }, // green-700
  objectif:   { color: '#c2410c', name: 'Objectif',   emoji: '🟡' }, // orange-700
  ambitieuse: { color: '#b91c1c', name: 'Ambitieuse', emoji: '🔴' }, // red-700
}

/**
 * Parse une chaîne au format `HH:mm` (ou `H:mm`) en secondes.
 * Retourne `null` si la chaîne est vide ou invalide.
 */
function parseHHMMToSeconds(hhmm: string): number | null {
  const trimmed = hhmm.trim()
  if (!trimmed) return null
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed)
  if (!match) return null
  const hours   = parseInt(match[1]!, 10)
  const minutes = parseInt(match[2]!, 10)
  if (hours < 0 || hours > 99) return null
  return hours * 3600 + minutes * 60
}

/** Une ligne de barrière en cours d'édition (km + HH:mm en string pour input UX) */
type CutoffRow = { km: string; hhmm: string }

/**
 * Convertit la liste éditable en `RaceCheckpoint[]` exploitable par le service.
 * Filtre les lignes invalides (km non parsable, hhmm invalide, km hors bornes).
 */
function rowsToCheckpoints(rows: CutoffRow[], totalKm: number): RaceCheckpoint[] {
  const valid: RaceCheckpoint[] = []
  for (const row of rows) {
    const km = parseFloat(row.km)
    if (Number.isNaN(km) || km <= 0 || km > totalKm + 0.5) continue
    const seconds = parseHHMMToSeconds(row.hhmm)
    if (seconds === null) continue
    valid.push({ km, cutoffSeconds: seconds })
  }
  return valid
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
  const { t } = useTranslation()
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
            : 'border-2 border-dashed border-black/10 hover:border-black/20 hover:bg-black/[0.02]',
          isParsing ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        style={{ background: isDragging ? undefined : 'var(--color-surface-2)' }}
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
            <p className="text-[#64748b] text-sm">{t('planner.analyzing')}</p>
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
              <p className="text-lg font-semibold text-[#1a2033] mb-2">
                {isDragging ? t('planner.dropTitleDragging') : t('planner.dropTitle')}
              </p>
              <p className="text-[13px] text-[#64748b] max-w-[280px] leading-relaxed">
                {t('planner.dropHint')}
              </p>
            </div>

            <button
              type="button"
              className="px-6 py-2.5 rounded-xl text-[11px] font-bold tracking-[1.5px] uppercase
                         text-[#1a2033] transition-all
                         hover:border-black/30 hover:text-[#1a2033]"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', color: 'var(--color-text)' }}
              onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
            >
              {t('common.browse')}
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
  const { t } = useTranslation()
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
            <h2 className="text-base font-semibold text-[#1a2033] truncate">{track.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
              <span className="text-[#1a2033] font-medium">{(track.totalDistance / 1000).toFixed(1)} km</span>
              <span className="text-orange-600">+{Math.round(track.totalElevationGain)} m</span>
              <span className="text-sky-700">-{Math.round(track.totalElevationLoss)} m</span>
              <span className="text-[#64748b]">{track.segments.length} seg.</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 px-3 py-2 rounded-lg text-[10px] font-semibold tracking-wider uppercase
                     text-[#64748b] hover:text-[#1a2033] border border-black/[0.08] hover:border-black/20
                     bg-black/[0.02] transition-all"
        >
          {t('planner.changeGpx')}
        </button>
      </div>
    </div>
  )
}

// ─── Track visualization (collapsible) ──────────────────────────────────────

function TrackVisualization({ track, lecture }: { track: GpxTrack; lecture?: LectureBullet[] }) {
  const { t } = useTranslation()
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
          <h3 className="text-[#1a2033] font-semibold text-xs uppercase tracking-wider">{t('planner.track')}</h3>
        </div>
        <span className="text-[#64748b] text-xs">{expanded ? '▲' : '▼'}</span>
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
                    ? 'bg-[#ff6d00]/10 border-[#ff6d00]/50 text-[#c2410c]'
                    : 'bg-black/[0.02] border-black/[0.08] text-[#64748b] hover:text-[#1a2033]'
                }`}
              >
                {mode === 'map' ? t('planner.map2d') : t('planner.view3d')}
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

          {/* Lecture du parcours — intégrée dans la section Parcours */}
          {lecture && lecture.length > 0 && (
            <div className="flex flex-col gap-3 pt-3 border-t border-black/[0.08]">
              <div className="flex items-center gap-2">
                <span className="w-1 h-5 rounded-full bg-indigo-500 shrink-0" />
                <h4 className="text-[#1a2033] font-semibold text-xs uppercase tracking-wider">{t('planner.trackReading')}</h4>
              </div>
              <ul className="flex flex-col gap-3">
                {lecture.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 text-xs font-mono px-2 py-0.5 rounded-md whitespace-nowrap ${
                      bullet.isWarning
                        ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                        : 'bg-black/[0.03] text-[#64748b] border border-black/[0.08]'
                    }`}>{bullet.kmRange}</span>
                    <span className={`text-xs leading-relaxed ${bullet.isWarning ? 'text-[#1a2033]' : 'text-[#64748b]'}`}>
                      {bullet.content}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Garmin curve anchor banner ─────────────────────────────────────────────

function GarminAnchorBanner({ anchor, track }: { anchor: GarminCurveAnchor; track: GpxTrack }) {
  const sourceLabel =
    anchor.predictionSource === 'garmin'
      ? 'Firstbeat Analytics'
      : anchor.predictionSource === 'computed'
        ? 'Calculé depuis VO2max'
        : 'Indisponible'

  const confidenceLabel =
    anchor.confidence === 'high' ? 'Élevée'
      : anchor.confidence === 'medium' ? 'Moyenne'
        : 'Faible'

  const flatKm = (track.totalDistance / 1000).toFixed(1)
  const effortDelta = anchor.kmEffortDistanceKm - track.totalDistance / 1000
  const scaleDelta = Math.round((anchor.flatSpeedScaleFactor - 1) * 100)
  const scaleLabel = scaleDelta === 0
    ? 'Profil inchangé'
    : scaleDelta > 0
      ? `+${scaleDelta}% sur le profil (Minetti plus lent que Garmin)`
      : `${scaleDelta}% sur le profil (Minetti plus rapide que Garmin)`

  return (
    <div
      className="w-full px-4 sm:px-5 py-4 rounded-2xl border-2"
      style={{
        borderColor: 'rgba(2,132,199,0.35)',
        background: 'rgba(2,132,199,0.06)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-sky-800">
          Ancrage Garmin · courbe Riegel + km-effort
        </span>
        <span className="text-[9px] font-semibold text-sky-800 px-1.5 py-0.5 rounded-md bg-sky-100">
          {sourceLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-[9px] text-[#64748b] uppercase tracking-wider mb-0.5">Temps ancre</div>
          <div className="font-mono font-semibold text-[#1a2033]">{formatDuration(anchor.totalTimeSeconds)}</div>
        </div>
        <div>
          <div className="text-[9px] text-[#64748b] uppercase tracking-wider mb-0.5">Distance km-effort</div>
          <div className="font-mono font-semibold text-[#1a2033]">
            {anchor.kmEffortDistanceKm.toFixed(1)} km
            <span className="text-[#64748b] font-normal"> (+{effortDelta.toFixed(1)} vs {flatKm})</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] text-[#64748b] uppercase tracking-wider mb-0.5">Exposant Riegel</div>
          <div className="font-mono font-semibold text-[#1a2033]">{anchor.riegelExponent.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-[9px] text-[#64748b] uppercase tracking-wider mb-0.5">Fiabilité</div>
          <div className="font-mono font-semibold text-[#1a2033]">{confidenceLabel}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[#64748b] leading-relaxed">
        Les temps des 3 stratégies ci-dessous sont calés sur ta courbe de prédiction Garmin appliquée à la distance km-effort du parcours. {scaleLabel}.
      </p>
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
  const { t } = useTranslation()
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
            {t('planner.recommendedStrategy')}
          </span>
          <span className="text-xs font-semibold text-[#1a2033]">{meta.name}</span>
        </div>
        <p className="text-xs text-[#64748b] leading-relaxed">{recommendation.reason}</p>
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
  const { t } = useTranslation()
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
              borderColor: isActive ? meta.color : 'rgba(0,0,0,0.08)',
              background:  isActive ? `${meta.color}12` : 'var(--color-surface)',
            }}
          >
            {isRecommended && (
              <span className="absolute top-1.5 right-1.5 text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md"
                style={{ background: `${meta.color}25`, color: meta.color }}>
                {t('planner.advised')}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{meta.emoji}</span>
              <span className="text-xs font-semibold" style={{ color: isActive ? meta.color : '#475569' }}>
                {meta.name}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-lg sm:text-xl font-bold ${isActive ? 'text-[#1a2033]' : 'text-[#64748b]'}`}>
                {s.totalTimeFormatted}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-[#64748b]">{s.avgPaceFormatted}</span>
              <span className={
                s.blowupRisk === 'Élevé'  ? 'text-red-600'   :
                s.blowupRisk === 'Modéré' ? 'text-amber-600' : 'text-emerald-700'
              }>
                {s.blowupRisk}
              </span>
            </div>
            {s.feasibility && (
              <div className={`text-[10px] font-semibold ${
                s.feasibility.level === 'safe'  ? 'text-emerald-700' :
                s.feasibility.level === 'tight' ? 'text-amber-600'   :
                                                  'text-red-600'
              }`}>
                {s.feasibility.level === 'fail' ? '❌' : s.feasibility.level === 'tight' ? '⚠️' : '✅'}
                {' Barrière '}
                {formatMargin(s.feasibility.marginSeconds)}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Comparative table ───────────────────────────────────────────────────────

function ComparatifTable({ report }: { report: RaceStrategyReport }) {
  const { t } = useTranslation()
  const hasCutoff = report.cutoffs !== null
  const rows: Array<{ label: string; key: string; format: (s: StrategyPlan) => string; highlight?: boolean; tooltip?: string }> = [
    { label: t('planner.comparativeTable.totalTime'),   key: 'time',    format: (s) => s.totalTimeFormatted, highlight: true },
    ...(hasCutoff ? [{ label: 'Barrière', key: 'cutoff', format: (s: StrategyPlan) => s.feasibility ? formatMargin(s.feasibility.marginSeconds) : '—' }] : []),
    { label: t('planner.comparativeTable.avgPace'),     key: 'pace',    format: (s) => s.avgPaceFormatted },
    { label: t('planner.comparativeTable.avgHR'),       key: 'hr',      format: (s) => `${s.avgHR} bpm` },
    { label: t('planner.comparativeTable.maxHR'),       key: 'maxhr',   format: (s) => `${s.maxHREstimated} bpm` },
    { label: t('planner.comparativeTable.avgFatigue'),  key: 'fatigue', format: (s) => `${(s.avgFatigue * 100).toFixed(1)}%`, tooltip: t('planner.comparativeTable.avgFatigueTooltip') },
    { label: t('planner.comparativeTable.walkSegments'),key: 'walk',    format: (s) => `${s.walkingSegments}` },
    { label: t('planner.comparativeTable.calories'),    key: 'cal',     format: (s) => `${s.totalCalories} kcal` },
    { label: t('planner.comparativeTable.blowupRisk'),  key: 'risk',    format: (s) => s.blowupRisk },
  ]

  return (
    <div className="glass rounded-2xl overflow-x-auto">
      <table className="w-full text-xs min-w-[320px]">
        <thead>
          <tr className="border-b border-black/[0.08]">
            <th className="text-left px-4 py-3 text-[#64748b] font-medium w-2/5" />
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
            <tr key={row.key} className="border-b border-black/[0.06] hover:bg-black/[0.02]">
              <td className="px-4 py-2.5 text-[#64748b]">
                {row.tooltip ? (
                  <span className="inline-flex items-center gap-1 cursor-help" title={row.tooltip}>
                    {row.label}
                    <span aria-hidden="true" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#94a3b8] text-[9px] font-semibold text-[#64748b] leading-none">i</span>
                  </span>
                ) : row.label}
              </td>
              {report.strategies.map((s) => (
                <td key={s.id} className={`text-center px-3 py-2.5 font-mono ${
                  row.highlight ? 'text-[#1a2033] font-bold' : 'text-[#1a2033]'
                }`}>
                  {row.key === 'risk' ? (
                    <span className={
                      s.blowupRisk === 'Élevé'  ? 'text-red-600'   :
                      s.blowupRisk === 'Modéré' ? 'text-amber-600' : 'text-emerald-700'
                    }>{s.blowupRisk}</span>
                  ) : row.key === 'fatigue' ? (
                    <span className={
                      s.avgFatigue < 0.1 ? 'text-emerald-700' :
                      s.avgFatigue < 0.25 ? 'text-amber-600' : 'text-red-600'
                    }>{row.format(s)}</span>
                  ) : row.key === 'cutoff' && s.feasibility ? (
                    <span className={
                      s.feasibility.level === 'safe'  ? 'text-emerald-700 font-semibold' :
                      s.feasibility.level === 'tight' ? 'text-amber-600 font-semibold'   :
                                                        'text-red-600 font-semibold'
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
  const { t } = useTranslation()
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
            <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/[0.08] text-center">
              <span className="text-[9px] sm:text-[10px] text-[#64748b] uppercase tracking-wider">{label}</span>
              <span className="text-xs sm:text-sm font-semibold text-[#1a2033]">
                {value} <span className="text-[9px] text-[#64748b]">{unit}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Phases */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <h3 className="text-[#1a2033] font-semibold text-xs uppercase tracking-wider">{t('planner.phases')}</h3>
          </div>

          {/* Mobile */}
          <div className="flex flex-col gap-2 sm:hidden">
            {plan.phases.map((phase) => (
              <div key={phase.index} className="rounded-xl p-3 bg-black/[0.03] border border-black/[0.08]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {phase.riskLevel === 'élevé'  && <span className="text-red-600 text-[10px]">⚠</span>}
                      {phase.riskLevel === 'modéré' && <span className="text-amber-600 text-[10px]">↑</span>}
                      <span className="text-[#1a2033] font-semibold text-xs">{phase.label}</span>
                    </div>
                    <span className="text-[#64748b] text-[10px]">km {phase.startKm}–{phase.endKm}</span>
                  </div>
                  <span className="text-[#1a2033] font-bold text-sm shrink-0">{phase.cumulativeTimeFormatted}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
                  <div><div className="text-[#64748b]">Allure</div><div className="text-[#1a2033] font-mono">{phase.targetPaceFormatted}</div></div>
                  <div><div className="text-[#64748b]">FC</div><div className="text-[#1a2033]">{phase.avgHR} bpm</div></div>
                  <div><div className="text-[#64748b]">D+/D-</div><div><span className="text-orange-600">+{phase.elevationGain}</span>/<span className="text-sky-700">-{phase.elevationLoss}</span></div></div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <table className="hidden sm:table w-full text-xs text-[#1a2033]">
            <thead>
              <tr className="border-b border-black/[0.08] text-[#64748b] text-[10px] uppercase tracking-wider">
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
                <tr key={phase.index} className="border-b border-black/[0.06] hover:bg-black/[0.02]">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      {phase.riskLevel === 'élevé'  && <span className="text-red-600 text-[10px]">⚠</span>}
                      {phase.riskLevel === 'modéré' && <span className="text-amber-600 text-[10px]">↑</span>}
                      <span className="font-medium text-[#1a2033]">{phase.label}</span>
                    </div>
                    <div className="text-[#64748b] text-[10px] mt-0.5">km {phase.startKm}–{phase.endKm}</div>
                  </td>
                  <td className="text-right py-2.5 px-2 text-orange-600">+{phase.elevationGain}m</td>
                  <td className="text-right py-2.5 px-2 text-sky-700">-{phase.elevationLoss}m</td>
                  <td className="text-right py-2.5 px-2 font-mono text-[#1a2033]">{phase.targetPaceFormatted}</td>
                  <td className="text-right py-2.5 px-2">{phase.avgHR} bpm</td>
                  <td className="py-2.5 px-2 text-[#64748b] text-[10px]">{phase.rpe}</td>
                  <td className="text-right py-2.5 pl-2 font-mono text-[#64748b] text-[10px]">{phase.cumulativeTimeFormatted}</td>
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
                  ? 'bg-red-500/10 border-red-500/30 text-red-700'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-700'
              }`}>
                <span>{zone.level === 'élevé' ? '⚠️' : '↑'}</span>
                <span>{zone.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Barrières horaires */}
        {plan.feasibility && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
              <h3 className="text-[#1a2033] font-semibold text-xs uppercase tracking-wider">Barrières horaires</h3>
            </div>
            <div className="flex flex-col gap-1.5">
              {plan.feasibility.checkpoints.map((cp, i) => {
                const bgClass =
                  cp.level === 'safe'  ? 'bg-green-500/10 border-green-500/30 text-emerald-700' :
                  cp.level === 'tight' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700'   :
                                         'bg-red-500/10 border-red-500/30 text-red-700'
                const icon = cp.level === 'fail' ? '❌' : cp.level === 'tight' ? '⚠️' : '✅'
                return (
                  <div key={i} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs ${bgClass}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0">{icon}</span>
                      <span className="font-semibold shrink-0">km {cp.km.toFixed(1)}</span>
                      {cp.label && (
                        <span className="text-[#64748b] truncate">· {cp.label}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                      <span className="text-[#64748b]">
                        {formatDuration(cp.predictedSeconds)} / {formatDuration(cp.cutoffSeconds)}
                      </span>
                      <span className="font-bold">{formatMargin(cp.marginSeconds)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
                plan.nutrition.icon === '✅' ? 'text-emerald-700' :
                plan.nutrition.icon === '⚠️' ? 'text-amber-600' : 'text-red-600'
              }`}>
                Nutrition — {plan.nutrition.status}
              </div>
              <div className="text-xs text-[#64748b] mt-0.5">{plan.nutrition.message}</div>
              {plan.nutrition.extraCarbsPerHour > 0 && (
                <div className="text-[10px] text-[#64748b] mt-1 font-mono">
                  Cible recommandée : {plan.nutrition.recommendedCarbsPerHour} g/h
                  {' '}(+{plan.nutrition.extraCarbsPerHour} g/h)
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

// ─── Filtres bibliothèque GPX ────────────────────────────────────────────────

const DISTANCE_BUCKETS = [
  { label: 'Toutes distances', min: 0, max: Infinity },
  { label: '5 km', min: 3, max: 7 },
  { label: '10 km', min: 7, max: 14 },
  { label: 'Semi (21 km)', min: 14, max: 28 },
  { label: 'Marathon (42 km)', min: 28, max: 55 },
  { label: '50 km+', min: 55, max: 80 },
  { label: '80 km+', min: 80, max: 110 },
  { label: '100 km+', min: 110, max: Infinity },
]

const ELEVATION_BUCKETS = [
  { label: 'Tous dénivelés', min: 0, max: Infinity },
  { label: 'Plat (< 500 m)', min: 0, max: 500 },
  { label: 'Vallonné (500–1500 m)', min: 500, max: 1500 },
  { label: 'Montagneux (> 1500 m)', min: 1500, max: Infinity },
]

const PROFILE_OPTIONS: { label: string; value: TrackProfile | null }[] = [
  { label: 'Tous profils', value: null },
  { label: 'Route', value: 'route' },
  { label: 'Trail', value: 'trail' },
  { label: 'Mixed', value: 'mixed' },
]

// ─── Composant bibliothèque GPX sauvegardés ──────────────────────────────────

function GpxLibrary({
  tracks,
  filterDist,
  setFilterDist,
  filterElev,
  setFilterElev,
  filterProfile,
  setFilterProfile,
  onSelect,
}: {
  tracks: GpxTrackRow[]
  filterDist: number
  setFilterDist: (v: number) => void
  filterElev: number
  setFilterElev: (v: number) => void
  filterProfile: TrackProfile | null
  setFilterProfile: (v: TrackProfile | null) => void
  onSelect: (row: GpxTrackRow) => void
}) {
  const filtered = useMemo(() => {
    const { min: dMin, max: dMax } = DISTANCE_BUCKETS[filterDist]
    const { min: eMin, max: eMax } = ELEVATION_BUCKETS[filterElev]
    return tracks.filter((t) => {
      const distKm = t.total_distance / 1000
      return (
        distKm >= dMin && distKm < dMax &&
        t.total_elevation_gain >= eMin && t.total_elevation_gain < eMax &&
        (filterProfile === null || t.track_profile === filterProfile)
      )
    })
  }, [tracks, filterDist, filterElev, filterProfile])

  if (tracks.length === 0) return null

  const selectClass = 'text-xs rounded-lg px-2 py-1.5 bg-white border border-black/10 text-[#64748b] focus:outline-none'

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-[#ff6d00] shrink-0" />
        <p className="text-[11px] uppercase tracking-widest text-[#1a2033] font-semibold">
          Charger un GPX sauvegardé
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filterDist} onChange={(e) => setFilterDist(Number(e.target.value))} className={selectClass}>
          {DISTANCE_BUCKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
        </select>
        <select value={filterElev} onChange={(e) => setFilterElev(Number(e.target.value))} className={selectClass}>
          {ELEVATION_BUCKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
        </select>
        <select
          value={filterProfile ?? ''}
          onChange={(e) => setFilterProfile((e.target.value || null) as TrackProfile | null)}
          className={selectClass}
        >
          {PROFILE_OPTIONS.map((o) => <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-[#64748b]">Aucun parcours pour ces filtres.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-44 overflow-y-auto pr-1">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-left
                         bg-black/[0.02] border border-black/[0.08] hover:border-[#ff6d00]/40
                         hover:bg-[rgba(255,109,0,0.06)] transition-all"
            >
              <span className="text-[13px] text-[#1a2033] truncate">{t.name}</span>
              <div className="flex gap-2 shrink-0 ml-3 text-[11px] text-[#64748b]">
                <span>{(t.total_distance / 1000).toFixed(1)} km</span>
                <span>+{Math.round(t.total_elevation_gain)} m</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Panneau paramètres personnalisables (météo / glucides / barrières) ─────

function RaceParametersPanel({
  environment,
  onEnvironmentChange,
  baselineReport,
  adjustedReport,
  carbAnalysisEnabled,
  setCarbAnalysisEnabled,
  carbTolerance,
  setCarbTolerance,
  cutoffEnabled,
  setCutoffEnabled,
  cutoffRows,
  setCutoffRows,
  trackTotalKm,
}: {
  environment: EnvironmentConditions
  onEnvironmentChange: (env: EnvironmentConditions) => void
  baselineReport: RaceStrategyReport | null
  adjustedReport: RaceStrategyReport | null
  carbAnalysisEnabled: boolean
  setCarbAnalysisEnabled: (v: boolean) => void
  carbTolerance: number
  setCarbTolerance: (v: number) => void
  cutoffEnabled: boolean
  setCutoffEnabled: (v: boolean) => void
  cutoffRows: CutoffRow[]
  setCutoffRows: (rows: CutoffRow[]) => void
  trackTotalKm: number
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)

  const isNeutral =
    environment.temperatureC === NEUTRAL_ENVIRONMENT.temperatureC &&
    environment.humidityPct === NEUTRAL_ENVIRONMENT.humidityPct

  // Delta sur la stratégie "objectif" (référence)
  const impactSeconds = useMemo(() => {
    if (!baselineReport || !adjustedReport) return 0
    const base = baselineReport.strategies.find((s) => s.id === 'objectif')
    const adjusted = adjustedReport.strategies.find((s) => s.id === 'objectif')
    if (!base || !adjusted) return 0
    return adjusted.totalTimeSeconds - base.totalTimeSeconds
  }, [baselineReport, adjustedReport])

  const formatDelta = (seconds: number) => {
    const sign = seconds >= 0 ? '+' : '−'
    const abs = Math.abs(Math.round(seconds))
    const m = Math.floor(abs / 60)
    const s = abs % 60
    if (m === 0) return `${sign}${s}s`
    return `${sign}${m} min ${String(s).padStart(2, '0')}s`
  }

  const impactColor =
    Math.abs(impactSeconds) < 30
      ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30'
      : Math.abs(impactSeconds) < 300
        ? 'text-amber-700 bg-amber-500/10 border-amber-500/30'
        : 'text-red-700 bg-red-500/10 border-red-500/30'

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5"
      >
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-[#ff6d00] shrink-0" />
          <h3 className="text-[#1a2033] font-semibold text-xs uppercase tracking-wider">
            Paramètres personnalisables
          </h3>
        </div>
        <span className="text-[#64748b] text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 flex flex-col gap-5">

          {/* ─── Section : Conditions météo ─────────────────────────────── */}
          <section className="flex flex-col gap-3 pb-5 border-b border-black/[0.06]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-[11px] font-semibold text-[#1a2033] uppercase tracking-wider">
                🌡️ {t('planner.conditions.title')}
              </h4>
              {!isNeutral && (
                <button
                  type="button"
                  onClick={() => onEnvironmentChange(NEUTRAL_ENVIRONMENT)}
                  className="text-[10px] font-medium text-[#64748b] hover:text-[#1a2033] underline underline-offset-2"
                >
                  {t('planner.conditions.reset')}
                </button>
              )}
            </div>

            <p className="text-[11px] text-[#64748b] leading-relaxed">
              {t('planner.conditions.hint')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Température */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium tracking-wider uppercase text-[#64748b]">
                    {t('planner.conditions.temperature')}
                  </label>
                  <span className="text-xs font-mono text-[#1a2033]">
                    {environment.temperatureC}°C
                  </span>
                </div>
                <input
                  type="range"
                  min={-5}
                  max={40}
                  step={1}
                  value={environment.temperatureC}
                  onChange={(e) => onEnvironmentChange({ ...environment, temperatureC: Number(e.target.value) })}
                  className="w-full accent-[#ff6d00]"
                />
              </div>

              {/* Humidité */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-medium tracking-wider uppercase text-[#64748b]">
                    {t('planner.conditions.humidity')}
                  </label>
                  <span className="text-xs font-mono text-[#1a2033]">
                    {environment.humidityPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  step={5}
                  value={environment.humidityPct}
                  onChange={(e) => onEnvironmentChange({ ...environment, humidityPct: Number(e.target.value) })}
                  className="w-full accent-[#ff6d00]"
                />
              </div>
            </div>

            {/* Badge d'impact */}
            {!isNeutral && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs ${impactColor}`}>
                <span className="font-medium">{t('planner.conditions.impact')}</span>
                <span className="font-mono font-bold">{formatDelta(impactSeconds)}</span>
              </div>
            )}
          </section>

          {/* ─── Section : Tolérance glucidique ─────────────────────────── */}
          <section className="flex flex-col gap-3 pb-5 border-b border-black/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={carbAnalysisEnabled}
                onChange={(e) => setCarbAnalysisEnabled(e.target.checked)}
                className="accent-[#ff6d00] cursor-pointer"
              />
              <h4 className="text-[11px] font-semibold text-[#1a2033] uppercase tracking-wider">
                🍬 Tolérance glucidique
              </h4>
            </label>
            <p className="text-[11px] text-[#64748b] leading-relaxed">
              Quantité de glucides que tu peux ingérer par heure pendant l'effort.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={120}
                step={5}
                value={carbTolerance}
                disabled={!carbAnalysisEnabled}
                onChange={(e) => setCarbTolerance(Number(e.target.value))}
                className="flex-1 accent-[#ff6d00] disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span className={`text-xs font-mono w-16 text-right shrink-0 ${carbAnalysisEnabled ? 'text-[#1a2033]' : 'text-[#94a3b8]'}`}>
                {carbAnalysisEnabled ? `${carbTolerance} g/h` : 'off'}
              </span>
            </div>
          </section>

          {/* ─── Section : Barrières horaires ───────────────────────────── */}
          <section className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={cutoffEnabled}
                onChange={(e) => setCutoffEnabled(e.target.checked)}
                className="accent-[#ff6d00] cursor-pointer"
              />
              <h4 className="text-[11px] font-semibold text-[#1a2033] uppercase tracking-wider">
                ⏱️ Barrières horaires
              </h4>
            </label>
            <p className="text-[11px] text-[#64748b] leading-relaxed">
              Définis les checkpoints à ne pas dépasser pour valider la course.
            </p>
            {cutoffEnabled && (
              <div className="flex flex-col gap-2">
                {cutoffRows.map((row, idx) => {
                  const km = parseFloat(row.km)
                  const kmValid = !Number.isNaN(km) && km > 0 && km <= trackTotalKm + 0.5
                  const hhmmValid = parseHHMMToSeconds(row.hhmm) !== null
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.1}
                        placeholder="km"
                        value={row.km}
                        onChange={(e) => {
                          const next = [...cutoffRows]
                          next[idx] = { ...next[idx]!, km: e.target.value }
                          setCutoffRows(next)
                        }}
                        aria-invalid={!kmValid && row.km.trim() !== ''}
                        className="w-16 px-2 py-1 text-xs font-mono text-center rounded-lg border border-black/[0.12] bg-white text-[#1a2033] focus:outline-none focus:border-[#ff6d00] aria-[invalid=true]:border-red-500"
                      />
                      <span className="text-[10px] text-[#94a3b8]">km</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="HH:mm"
                        value={row.hhmm}
                        onChange={(e) => {
                          const next = [...cutoffRows]
                          next[idx] = { ...next[idx]!, hhmm: e.target.value }
                          setCutoffRows(next)
                        }}
                        aria-invalid={!hhmmValid && row.hhmm.trim() !== ''}
                        className="w-20 px-2 py-1 text-xs font-mono text-center rounded-lg border border-black/[0.12] bg-white text-[#1a2033] focus:outline-none focus:border-[#ff6d00] aria-[invalid=true]:border-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => setCutoffRows(cutoffRows.filter((_, i) => i !== idx))}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-[#94a3b8] hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label="Supprimer cette barrière"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => {
                    const defaultKm = trackTotalKm > 0
                      ? (cutoffRows.length === 0 ? trackTotalKm.toFixed(1) : '')
                      : ''
                    setCutoffRows([...cutoffRows, { km: defaultKm, hhmm: '' }])
                  }}
                  className="self-start text-[10px] font-semibold text-[#ff6d00] hover:underline"
                >
                  + ajouter une barrière
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────

export function PlanificateurPage() {
  const { track, setTrack, profile, garminRacePredictions } = useAppStore()
  const user = useAuthStore((s) => s.user)
  const { saveTrack } = useGpxSave()

  const [isDragging, setIsDragging] = useState(false)
  const [isParsing,  setIsParsing]  = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [carbTolerance, setCarbTolerance] = useState(60)
  const [carbAnalysisEnabled, setCarbAnalysisEnabled] = useState(true)
  const [cutoffEnabled, setCutoffEnabled] = useState(false)
  const [cutoffRows, setCutoffRows] = useState<CutoffRow[]>([])
  const [activeStrategy, setActiveStrategy] = useState<RaceStrategyId | null>(null)
  const [environment, setEnvironment] = useState<EnvironmentConditions>(NEUTRAL_ENVIRONMENT)

  // Bibliothèque GPX sauvegardés
  const [savedTracks, setSavedTracks] = useState<GpxTrackRow[]>([])
  const [filterDist, setFilterDist] = useState(0)
  const [filterElev, setFilterElev] = useState(0)
  const [filterProfile, setFilterProfile] = useState<TrackProfile | null>(null)

  useEffect(() => {
    if (!user?.id) return
    getGpxTracks(user.id)
      .then(setSavedTracks)
      .catch((err) => console.warn('[GPX] Failed to load saved tracks:', err))
  }, [user?.id])

  const isNeutralEnv =
    environment.temperatureC === NEUTRAL_ENVIRONMENT.temperatureC &&
    environment.humidityPct === NEUTRAL_ENVIRONMENT.humidityPct

  // Simulation auto dès qu'un track est chargé
  // Si des prédictions Garmin (Firstbeat) sont disponibles, on les utilise comme ancrage :
  // le flatSpeed du profil est recalé pour que le temps total Minetti colle à la courbe Garmin
  // + km-effort. Sans Garmin, on retombe sur le calcul Minetti pur.
  const effectiveCarbTolerance = carbAnalysisEnabled ? carbTolerance : null
  const trackTotalKm           = track ? track.totalDistance / 1000 : 0
  const parsedCutoffs = useMemo<RaceCheckpoint[] | null>(() => {
    if (!cutoffEnabled) return null
    const checkpoints = rowsToCheckpoints(cutoffRows, trackTotalKm)
    return checkpoints.length > 0 ? checkpoints : null
  }, [cutoffEnabled, cutoffRows, trackTotalKm])

  const report = useMemo<RaceStrategyReport | null>(() => {
    if (!track) return null
    return generateRaceStrategy(track, profile, effectiveCarbTolerance, garminRacePredictions, environment, parsedCutoffs)
  }, [track, profile, effectiveCarbTolerance, garminRacePredictions, environment, parsedCutoffs])

  // Report de référence (conditions neutres) pour calculer le delta d'impact météo.
  // Recalculé uniquement si l'environnement est modifié — sinon c'est déjà le report principal.
  const baselineReport = useMemo<RaceStrategyReport | null>(() => {
    if (!track) return null
    if (isNeutralEnv) return report
    return generateRaceStrategy(track, profile, effectiveCarbTolerance, garminRacePredictions, undefined, parsedCutoffs)
  }, [track, profile, effectiveCarbTolerance, garminRacePredictions, isNeutralEnv, report, parsedCutoffs])

  // Seed une ligne par défaut (km = distance totale, hhmm vide) quand l'utilisateur
  // active les barrières sans avoir encore saisi de checkpoint.
  useEffect(() => {
    if (cutoffEnabled && cutoffRows.length === 0 && track) {
      const totalKm = track.totalDistance / 1000
      setCutoffRows([{ km: totalKm.toFixed(1), hhmm: '' }])
    }
  }, [cutoffEnabled, cutoffRows.length, track])

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
    if (file.size > 5 * 1024 * 1024) {
      setParseError('Le fichier GPX ne doit pas dépasser 5 Mo')
      return
    }
    setParseError(null)
    setIsParsing(true)
    setActiveStrategy(null)
    try {
      const parsed = await parseGpxFile(file)
      setTrack(parsed)
      // Sauvegarde silencieuse et non-bloquante
      saveTrack(file, parsed)
        .then((id) => {
          if (id) {
            // Rafraîchir la bibliothèque après sauvegarde
            if (user?.id) {
              getGpxTracks(user.id).then(setSavedTracks).catch(() => {})
            }
          }
        })
        .catch((err) => console.warn('[GPX] Save failed (non-blocking):', err))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erreur lors du parsing GPX')
    } finally {
      setIsParsing(false)
    }
  }, [setTrack, saveTrack, user?.id])

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

  const handleSelectSavedTrack = useCallback((row: GpxTrackRow) => {
    setTrack(row.gpx_data as GpxTrack)
    setActiveStrategy(null)
  }, [setTrack])

  // ── Pas de track → drop zone plein écran ──
  if (!track) {
    return (
      <div
        className="w-full min-h-[60vh]"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <GpxLibrary
          tracks={savedTracks}
          filterDist={filterDist}
          setFilterDist={setFilterDist}
          filterElev={filterElev}
          setFilterElev={setFilterElev}
          filterProfile={filterProfile}
          setFilterProfile={setFilterProfile}
          onSelect={handleSelectSavedTrack}
        />
        <DropZone
          onFile={handleFile}
          isDragging={isDragging}
          isParsing={isParsing}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
        {parseError && (
          <div className="max-w-lg mx-auto mt-3 px-4 py-3 rounded-xl text-[12px] text-red-600"
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

      {/* Bibliothèque GPX sauvegardés */}
      {savedTracks.length > 0 && (
        <GpxLibrary
          tracks={savedTracks}
          filterDist={filterDist}
          setFilterDist={setFilterDist}
          filterElev={filterElev}
          setFilterElev={setFilterElev}
          filterProfile={filterProfile}
          setFilterProfile={setFilterProfile}
          onSelect={handleSelectSavedTrack}
        />
      )}

      {/* Parcours (carte + élévation + lecture, repliable) */}
      <TrackVisualization track={track} lecture={report?.lecture} />

      {/* Paramètres personnalisables : météo + glucides + barrières horaires */}
      <RaceParametersPanel
        environment={environment}
        onEnvironmentChange={setEnvironment}
        baselineReport={baselineReport}
        adjustedReport={report}
        carbAnalysisEnabled={carbAnalysisEnabled}
        setCarbAnalysisEnabled={setCarbAnalysisEnabled}
        carbTolerance={carbTolerance}
        setCarbTolerance={setCarbTolerance}
        cutoffEnabled={cutoffEnabled}
        setCutoffEnabled={setCutoffEnabled}
        cutoffRows={cutoffRows}
        setCutoffRows={setCutoffRows}
        trackTotalKm={trackTotalKm}
      />

      {/* Stratégie */}
      {report && (
        <>
          {/* Titre section */}
          <div className="flex items-center gap-3 mt-2">
            <span className="w-1 h-8 rounded-full bg-[#ff6d00] shrink-0" />
            <h2 className="text-xl font-bold text-[#1a2033]">Plan de course</h2>
          </div>

          {/* Ancrage Garmin (courbe Firstbeat + km-effort) */}
          {report.garminCurveAnchor && (
            <GarminAnchorBanner anchor={report.garminCurveAnchor} track={track} />
          )}

          {/* Recommandation */}
          <RecommendationBanner
            recommendation={report.recommendation}
            onSelect={setActiveStrategy}
          />

          {/* Tableau comparatif */}
          <ComparatifTable report={report} />

          {/* Pills */}
          <StrategyPills
            strategies={report.strategies}
            active={effectiveStrategy}
            recommendedId={report.recommendation.id}
            onSelect={setActiveStrategy}
          />

          {/* Détail stratégie active */}
          {activePlan && <StrategyDetail plan={activePlan} />}
        </>
      )}
    </div>
  )
}
