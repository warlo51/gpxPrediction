/**
 * Page Course Planner — layout 2 colonnes fidèle au design Figma.
 * Colonne gauche : drop zone / carte GPX + bouton Generate
 * Colonne droite : Primary Indicators + Segment Breakdown
 */

import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useAppStore } from '@/stores/appStore'
import { parseGpxFile } from '@/services/gpxParser.service'
import { TrackMap } from './TrackMap'
import type { GpxTrack } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n: number, decimals = 1) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(n)
}

/** Groupe les segments du track en N macro-segments pour le breakdown */
function buildMacroSegments(track: GpxTrack, count = 12) {
  const n = track.segments.length
  if (n === 0) return []
  const size = Math.max(1, Math.ceil(n / count))
  return Array.from({ length: Math.ceil(n / size) }, (_, i) => {
    const slice = track.segments.slice(i * size, (i + 1) * size)
    const distM  = slice.reduce((a, s) => a + s.distance, 0)
    const elev   = slice.reduce((a, s) => a + s.elevationGain, 0)
    const startKm = (slice[0]?.cumulativeDistance ?? 0) / 1000
    return { index: i + 1, startKm, distKm: distM / 1000, elevM: Math.round(elev) }
  })
}

/** Construit les barres du mini graphique altimétrique (10 barres) */
function buildElevBars(track: GpxTrack, bars = 10): number[] {
  const pts = track.points
  if (pts.length < 2) return []
  const size = Math.ceil(pts.length / bars)
  return Array.from({ length: bars }, (_, i) => {
    const slice = pts.slice(i * size, (i + 1) * size)
    const max = Math.max(...slice.map(p => p.elevation))
    return max
  })
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

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
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !isParsing && inputRef.current?.click()}
      className={[
        'flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer',
        'transition-all duration-200 min-h-[340px] px-8 py-12',
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
          <p className="text-[rgba(218,226,253,0.6)] text-sm">Analyse du fichier GPX…</p>
        </>
      ) : (
        <>
          {/* File icon */}
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
            <p className="text-[18px] font-semibold text-white mb-2">
              {isDragging ? 'Relâchez pour importer' : 'Drag & Drop GPX Route'}
            </p>
            <p className="text-[13px] text-[rgba(218,226,253,0.45)] max-w-[300px] leading-relaxed">
              Upload your track to initiate elevation profiling and kinetic segment analysis.
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
            Select Local File
          </button>
        </>
      )}
    </div>
  )
}

// ─── Right panel — pas de track ───────────────────────────────────────────────

function EmptyIndicators() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-5" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[9px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.4)] mb-4">
          Primary Indicators
        </p>
        <div className="flex flex-col gap-3">
          {['Distance', 'Ascent', 'Avg Grade'].map(l => (
            <div key={l} className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl p-5" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[9px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.4)] mb-4">
          Segment Breakdown
        </p>
        <p className="text-[12px] text-[rgba(218,226,253,0.25)] text-center py-6">
          Import a GPX file to see segments
        </p>
      </div>
    </div>
  )
}

// ─── Right panel — track chargé ───────────────────────────────────────────────

function TrackIndicators({ track, onNavigateToStrategy }: { track: GpxTrack; onNavigateToStrategy: () => void }) {
  const distKm    = track.totalDistance / 1000
  const ascentM   = Math.round(track.totalElevationGain)
  const avgGrade  = ((track.totalElevationGain / track.totalDistance) * 100).toFixed(1)
  const peakM     = Math.round(track.maxElevation)

  const elevBars  = buildElevBars(track, 10)
  const barMax    = Math.max(...elevBars)
  const macros    = buildMacroSegments(track, 12)
  const first3    = macros.slice(0, 3)

  return (
    <div className="flex flex-col gap-4">

      {/* ── Primary Indicators ── */}
      <div className="rounded-2xl p-5" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[9px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.4)] mb-4">
          Primary Indicators
        </p>

        {/* Distance */}
        <div className="mb-4">
          <div className="flex items-end gap-1 leading-none">
            <span className="text-[52px] font-black text-white">{formatNum(distKm)}</span>
            <span className="text-[14px] font-bold text-[rgba(218,226,253,0.5)] mb-2">KM</span>
          </div>
        </div>

        {/* Ascent + Grade */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 border-l-2 border-[#ff6d00] pl-3">
            <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-1">Ascent</p>
            <p className="text-[18px] font-black text-white">{formatNum(ascentM, 0)}<span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-0.5">m</span></p>
          </div>
          <div className="flex-1 border-l-2 border-[#3b82f6] pl-3">
            <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-1">Avg Grade</p>
            <p className="text-[18px] font-black text-white">{avgGrade}<span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-0.5">%</span></p>
          </div>
        </div>

        {/* Elevation mini chart */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">Elevation Profile</p>
            <p className="text-[9px] text-[rgba(218,226,253,0.4)]">Peak: {peakM.toLocaleString('fr-FR')}m</p>
          </div>
          <div className="flex items-end gap-[3px] h-[50px]">
            {elevBars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${(h / barMax) * 100}%`,
                  background: i === elevBars.length - 1
                    ? '#ff6d00'
                    : `rgba(255,109,0,${0.25 + (i / elevBars.length) * 0.5})`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Segment Breakdown ── */}
      <div className="rounded-2xl p-5" style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[9px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.4)] mb-4">
          Segment Breakdown
        </p>

        <div className="flex flex-col">
          {first3.map((seg) => (
            <div
              key={seg.index}
              className="flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0
                         hover:bg-white/[0.02] rounded-lg px-2 -mx-2 cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-bold text-[rgba(218,226,253,0.3)] w-5 shrink-0">
                {String(seg.index).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white uppercase tracking-[0.5px] truncate">
                  Segment {seg.index}
                </p>
                <p className="text-[9px] text-[rgba(218,226,253,0.4)]">
                  {seg.distKm.toFixed(1)}km • +{seg.elevM}m
                </p>
              </div>
              <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="shrink-0">
                <path d="M1 1l4 4-4 4" stroke="rgba(218,226,253,0.3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>

        <button
          className="w-full mt-3 py-2 text-[9px] font-bold tracking-[1.5px] uppercase
                     text-[rgba(218,226,253,0.5)] hover:text-[#ff6d00] transition-colors"
          onClick={onNavigateToStrategy}
        >
          View All {macros.length} Segments
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

interface PlanificateurPageProps {
  onNavigateToStrategy: () => void
}

export function PlanificateurPage({ onNavigateToStrategy }: PlanificateurPageProps) {
  const { track, setTrack } = useAppStore()

  const [isDragging, setIsDragging] = useState(false)
  const [isParsing,  setIsParsing]  = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.gpx')) {
      setParseError('Le fichier doit être au format .gpx')
      return
    }
    setParseError(null)
    setIsParsing(true)
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

  return (
    <div className="w-full flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium tracking-[2px] uppercase text-[rgba(218,226,253,0.4)] mb-1">
            Planning Module 0.2
          </p>
          <h1 className="text-[48px] sm:text-[56px] font-black text-white leading-none tracking-tight">
            Course Planner
          </h1>
        </div>

        {track && (
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shrink-0"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-0.5 h-8 rounded-full" style={{ background: '#ff6d00' }} />
            <div>
              <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-0.5">
                Selected Course
              </p>
              <p className="text-[13px] font-bold text-white">{track.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Body: 2 colonnes ── */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* ── Colonne gauche ── */}
        <div className="flex flex-col gap-4 flex-1 min-w-0 w-full">

          {/* Drop zone ou carte */}
          {!track ? (
            <>
              <DropZone
                onFile={handleFile}
                isDragging={isDragging}
                isParsing={isParsing}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
              {parseError && (
                <div className="px-4 py-3 rounded-xl text-[12px] text-red-400"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  ⚠️ {parseError}
                </div>
              )}
            </>
          ) : (
            <div className="relative rounded-2xl overflow-hidden" style={{ height: '420px' }}>
              {/* Live badge */}
              <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="text-[10px] font-bold tracking-[1px] uppercase text-white">Live Trace Active</span>
              </div>
              <TrackMap track={track} />
            </div>
          )}

          {/* Bouton Generate */}
          <button
            disabled={!track}
            onClick={track ? onNavigateToStrategy : undefined}
            className={[
              'w-full py-4 rounded-2xl text-[13px] font-black tracking-[2px] uppercase',
              'flex items-center justify-center gap-3 transition-all duration-200',
              track
                ? 'text-[#1a0500] hover:brightness-110 shadow-[0_8px_30px_rgba(255,109,0,0.4)]'
                : 'cursor-not-allowed opacity-40 text-white',
            ].join(' ')}
            style={track ? {
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
            } : {
              background: '#1a2540',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Generate Pacing Strategy
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M9 2L4 9h4l-1 5 6-8H9l1-4z"
                fill={track ? '#1a0500' : 'rgba(218,226,253,0.4)'}
                stroke={track ? '#1a0500' : 'rgba(218,226,253,0.4)'}
                strokeWidth="0.5"/>
            </svg>
          </button>
        </div>

        {/* ── Colonne droite ── */}
        <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0">
          {track
            ? <TrackIndicators track={track} onNavigateToStrategy={onNavigateToStrategy} />
            : <EmptyIndicators />
          }
        </div>
      </div>
    </div>
  )
}