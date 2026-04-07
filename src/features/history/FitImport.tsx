/**
 * Composant d'import de fichiers FIT Garmin
 * Drag & drop ou sélection multiple de fichiers .fit
 */

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { calibrateRunner } from '@/services/calibration.service'
import { parseFitFiles } from '@/services/fitParser.service'
import type { FitParseResult } from '@/services/fitParser.service'

// ─── Composant principal ──────────────────────────────────────────────────────

export function FitImport() {
  const { sessions, addSession, profile, setProfile } = useAppStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    errors: { file: string; error: string }[]
    details: FitParseResult[]
  } | null>(null)

  const processFiles = useCallback(async (files: File[]) => {
    const fitFiles = files.filter(f => f.name.toLowerCase().endsWith('.fit'))
    if (fitFiles.length === 0) return

    setIsProcessing(true)
    setResult(null)
    setProgress({ current: 0, total: fitFiles.length })

    try {
      // Parser les fichiers par batch de 5
      const allResults: FitParseResult[] = []
      const allErrors: { file: string; error: string }[] = []

      for (let i = 0; i < fitFiles.length; i += 5) {
        const batch = fitFiles.slice(i, i + 5)
        const { results, errors } = await parseFitFiles(batch)
        allResults.push(...results)
        allErrors.push(...errors)
        setProgress({ current: Math.min(i + 5, fitFiles.length), total: fitFiles.length })
      }

      // Dédupliquer vs séances déjà présentes (même date + distance ≈)
      let imported = 0
      let skipped = 0
      const newSessions = []

      for (const r of allResults) {
        const duplicate = sessions.some(existing => {
          const sameDate = Math.abs(
            new Date(existing.date).getTime() - r.session.date.getTime()
          ) < 60_000 // même minute
          const sameDist = Math.abs(existing.distance - r.session.distance) < 100 // ±100m
          return sameDate && sameDist
        })

        if (duplicate) {
          skipped++
        } else {
          addSession(r.session)
          newSessions.push(r.session)
          imported++
        }
      }

      // Recalibrer si nouvelles séances
      if (newSessions.length > 0) {
        const allSessions = [...sessions, ...newSessions]
        const calibrated = calibrateRunner(allSessions, profile)
        setProfile(calibrated)
      }

      setResult({ imported, skipped, errors: allErrors, details: allResults })
    } finally {
      setIsProcessing(false)
      setProgress(null)
    }
  }, [sessions, addSession, profile, setProfile])

  // ── Drag & drop
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }
  function handleDragLeave() { setIsDragging(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    void processFiles(files)
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    void processFiles(files)
    e.target.value = ''
  }

  const fitSessions = sessions.filter(s => s.source === 'gpx' && s.id.startsWith('fit-'))

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-5 rounded-full bg-sky-500 inline-block" />
        <div>
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
            Import fichiers FIT Garmin
          </h3>
          <p className="text-slate-600 text-xs mt-0.5">
            Données GPS brutes complètes · FC · Cadence · Puissance
          </p>
        </div>
        {fitSessions.length > 0 && (
          <span className="ml-auto text-xs text-sky-400 bg-sky-900/20 px-2 py-1 rounded-full">
            {fitSessions.length} FIT importés
          </span>
        )}
      </div>

      {/* Avantages vs Strava */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { icon: '📍', label: 'GPS brut', sub: 'Données GPS complètes' },
          { icon: '❤️', label: 'FC détaillée', sub: 'Chaque seconde' },
          { icon: '🦵', label: 'Cadence', sub: 'Pas/min' },
          { icon: '⚡', label: 'Puissance', sub: 'Si capteur Running Power' },
        ].map(item => (
          <div key={item.label} className="bg-white/3 border border-white/6 rounded-xl p-2.5 text-center">
            <div className="text-lg mb-1">{item.icon}</div>
            <div className="text-white text-xs font-medium">{item.label}</div>
            <div className="text-slate-600 text-[10px]">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Zone de drop */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'border-2 border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-sky-400 bg-sky-900/20'
            : 'border-white/10 hover:border-sky-600/50 hover:bg-white/3',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".fit"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        {isProcessing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-slate-300 text-sm font-medium">
              {progress
                ? `Analyse ${progress.current} / ${progress.total} fichier${progress.total > 1 ? 's' : ''}…`
                : 'Calibration du profil…'}
            </div>
            {progress && (
              <div className="w-48 h-1.5 bg-white/6 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">📂</div>
            <p className="text-slate-300 text-sm font-medium mb-1">
              Glissez vos fichiers <code className="text-sky-400">.fit</code> ici
            </p>
            <p className="text-slate-600 text-xs">
              ou cliquez pour sélectionner — plusieurs fichiers acceptés
            </p>
            <p className="text-slate-700 text-xs mt-2">
              Exportez depuis Garmin Connect → Activités → ⋯ → Exporter l'original
            </p>
          </>
        )}
      </div>

      {/* Résultat */}
      {result && (
        <div className="mt-4 space-y-2">
          {/* Bilan */}
          <div className={[
            'rounded-xl p-3 text-sm flex items-start gap-2',
            result.imported > 0
              ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-400'
              : 'bg-slate-800/50 border border-white/6 text-slate-400',
          ].join(' ')}>
            <span className="shrink-0">{result.imported > 0 ? '✅' : 'ℹ️'}</span>
            <span>
              {result.imported > 0
                ? <><strong>{result.imported}</strong> séance{result.imported > 1 ? 's' : ''} importée{result.imported > 1 ? 's' : ''} et profil recalibré</>
                : 'Aucune nouvelle séance'
              }
              {result.skipped > 0 && (
                <span className="text-slate-500 ml-1">
                  · {result.skipped} déjà présente{result.skipped > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>

          {/* Détails des fichiers importés */}
          {result.details.length > 0 && result.imported > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {result.details.map((r, i) => (
                <div key={i} className="bg-white/3 border border-white/5 rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
                  <span className="text-slate-500 shrink-0">
                    {new Date(r.session.date).toLocaleDateString('fr-FR')}
                  </span>
                  <span className="text-slate-200 font-medium flex-1 truncate">
                    {r.session.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-400">{(r.session.distance / 1000).toFixed(1)} km</span>
                    {r.session.elevationGain > 0 && (
                      <span className="text-orange-400">+{Math.round(r.session.elevationGain)} m</span>
                    )}
                    {r.hasGPS && <span className="text-sky-400" title="GPS disponible">📍</span>}
                    {r.hasHR && <span className="text-rose-400" title="FC disponible">❤️</span>}
                    {r.garminExtras.avgCadence && (
                      <span className="text-purple-400" title={`Cadence: ${r.garminExtras.avgCadence} pas/min`}>🦵</span>
                    )}
                    {r.garminExtras.avgPower && (
                      <span className="text-amber-400" title={`Puissance: ${r.garminExtras.avgPower} W`}>⚡</span>
                    )}
                    <span className="text-slate-600">{r.recordCount} pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Erreurs */}
          {result.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-xs text-red-400 space-y-1">
              <div className="font-medium">⚠️ {result.errors.length} fichier{result.errors.length > 1 ? 's' : ''} en erreur :</div>
              {result.errors.map((e, i) => (
                <div key={i} className="text-red-600">
                  <span className="font-medium text-red-500">{e.file}</span> — {e.error}
                </div>
              ))}
            </div>
          )}

          {/* Info calibration */}
          {result.imported > 0 && (
            <div className="bg-sky-950/30 border border-sky-800/40 rounded-xl p-3 text-xs text-sky-400 flex items-start gap-2">
              <span className="shrink-0">🧠</span>
              <span>
                Profil recalibré avec les données GPS brutes Garmin — la courbe vitesse/pente est maintenant basée sur vos vraies mesures non lissées.
                Consultez l'onglet <strong>Profil coureur</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guide export Garmin */}
      <details className="mt-4">
        <summary className="text-xs text-slate-600 hover:text-slate-400 cursor-pointer transition-colors select-none">
          📖 Comment exporter depuis Garmin Connect ?
        </summary>
        <ol className="mt-2 space-y-1 text-xs text-slate-600 list-decimal list-inside pl-1">
          <li>Allez sur <span className="text-sky-500">connect.garmin.com</span> → Activités</li>
          <li>Cliquez sur une activité pour l'ouvrir</li>
          <li>Cliquez sur l'icône <strong className="text-slate-400">⚙️ engrenage</strong> ou les <strong className="text-slate-400">⋯ trois points</strong></li>
          <li>Sélectionnez <strong className="text-slate-400">Exporter l'original</strong> → télécharge un fichier <code className="text-sky-400">.fit</code></li>
          <li>Répétez pour chaque activité ou utilisez l'<strong className="text-slate-400">export en masse</strong> depuis les paramètres du compte</li>
        </ol>
      </details>
    </div>
  )
}
