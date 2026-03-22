/**
 * Composant d'import de fichier GPX
 * Supporte le drag & drop et la sélection via input file.
 */

import { useCallback, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'
import type { GpxTrack } from '@/types'
import { parseGpxFile } from '@/services/gpxParser.service'

type GpxImportStatus =
  | { state: 'idle' }
  | { state: 'dragging' }
  | { state: 'parsing' }
  | { state: 'success'; track: GpxTrack }
  | { state: 'error'; message: string }

type GpxImportProps = {
  onTrackLoaded: (track: GpxTrack) => void
}

export function GpxImport({ onTrackLoaded }: GpxImportProps) {
  const [status, setStatus] = useState<GpxImportStatus>({ state: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.gpx')) {
      setStatus({ state: 'error', message: 'Le fichier doit être au format .gpx' })
      return
    }

    setStatus({ state: 'parsing' })
    try {
      const track = await parseGpxFile(file)
      setStatus({ state: 'success', track })
      onTrackLoaded(track)
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : 'Erreur inconnue lors du parsing',
      })
    }
  }, [onTrackLoaded])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }, [handleFile])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setStatus((prev) => prev.state === 'dragging' ? prev : { state: 'dragging' })
  }

  const handleDragLeave = () => {
    setStatus((prev) => prev.state === 'dragging' ? { state: 'idle' } : prev)
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const isDragging = status.state === 'dragging'
  const isParsing = status.state === 'parsing'

  return (
    <div className="w-full">
      {/* Zone de drop */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          'relative border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-indigo-400 bg-indigo-950/40 scale-[1.02]'
            : 'border-slate-700/60 bg-slate-900/30 hover:border-indigo-600/50 hover:bg-indigo-950/20',
          isParsing ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        onClick={() => document.getElementById('gpx-file-input')?.click()}
      >
        <input id="gpx-file-input" type="file" accept=".gpx" className="hidden" onChange={handleInputChange} />

        {isParsing ? (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Analyse du fichier GPX…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/40
                            flex items-center justify-center text-2xl sm:text-3xl mb-1">
              📂
            </div>
            <div className="text-slate-200 font-semibold text-base sm:text-lg">
              {isDragging ? 'Relâchez pour importer' : 'Glissez votre fichier GPX ici'}
            </div>
            <div className="text-slate-500 text-sm">
              ou <span className="text-indigo-400 underline underline-offset-2">cliquez pour sélectionner</span>
            </div>
            <div className="mt-1 text-slate-600 text-xs px-3 py-1 bg-slate-800/60 rounded-full border border-slate-700/50">
              Format .gpx uniquement
            </div>
          </div>
        )}
      </div>

      {/* Feedback success */}
      {status.state === 'success' && (
        <div className="mt-4 bg-emerald-900/40 border border-emerald-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-2">
            <span>✅</span>
            <span>{status.track.name}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm text-slate-400">
            <Stat label="Distance" value={`${(status.track.totalDistance / 1000).toFixed(1)} km`} />
            <Stat label="D+" value={`${Math.round(status.track.totalElevationGain)} m`} />
            <Stat label="Segments" value={`${status.track.segments.length}`} />
          </div>
        </div>
      )}

      {/* Feedback erreur */}
      {status.state === 'error' && (
        <div className="mt-4 bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-400 text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>{status.message}</span>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-2 text-center">
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="text-slate-200 font-semibold">{value}</div>
    </div>
  )
}
