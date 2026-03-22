import { useState, useCallback, useEffect } from 'react'
import './App.css'
import { GpxImport } from '@/features/gpx/GpxImport'
import { ElevationChart } from '@/features/gpx/ElevationChart'
import { TrackMap } from '@/features/gpx/TrackMap'
import { RunnerProfileForm } from '@/features/runner/RunnerProfileForm'
import { SimulationPanel } from '@/features/analysis/SimulationPanel'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { StrategyComparison } from '@/features/strategy/StrategyComparison'
import { useAppStore } from '@/stores/appStore'
import type { GpxTrack } from '@/types'

type Tab = 'gpx' | 'historique' | 'profil' | 'simulation' | 'comparaison'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'gpx', label: 'Parcours GPX', icon: '🗺️' },
  { id: 'historique', label: 'Historique', icon: '📋' },
  { id: 'profil', label: 'Profil coureur', icon: '🏃' },
  { id: 'simulation', label: 'Simulation', icon: '📊' },
  { id: 'comparaison', label: 'Comparaison', icon: '⚖️' },
]

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('gpx')
  const { track, setTrack } = useAppStore()

  // Détecter le retour du callback OAuth Strava → basculer sur l'onglet Historique
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('error')) {
      setActiveTab('historique')
    }
  }, [])

  const handleTrackLoaded = useCallback(
    (t: GpxTrack) => {
      setTrack(t)
      setActiveTab('gpx')
    },
    [setTrack],
  )

  return (
    <div className="min-h-screen flex flex-col items-center pb-24 sm:pb-10 px-3 sm:px-6 gap-5 sm:gap-7">

      {/* ── Bande de fond décorative ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px]
                        rounded-full bg-indigo-900/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px]
                        rounded-full bg-violet-900/15 blur-3xl" />
      </div>

      {/* ── Header ── */}
      <header className="w-full max-w-4xl text-center pt-6 sm:pt-10 animate-fade-up">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-400
                        bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 rounded-full mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Trail Running Analytics
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
          <span className="text-gradient">GPX Trail</span>
          <span className="text-white"> Predictor</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto hidden sm:block">
          Analysez votre parcours, calibrez votre profil et simulez votre performance.
        </p>
      </header>

      {/* ── Navigation sticky bas (mobile) / inline (desktop) ── */}
      <div className="fixed sm:static bottom-0 left-0 right-0 z-50 sm:z-auto
                      sm:w-full sm:max-w-2xl">
        <div className="glass sm:rounded-2xl border-t border-slate-800 sm:border
                        px-2 py-2 sm:p-1.5 flex gap-1 sm:gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5',
                'px-1 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium',
                'transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white glow-indigo'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
              ].join(' ')}
            >
              <span className="text-base sm:text-sm">{tab.icon}</span>
              <span className="text-[10px] sm:text-sm leading-tight">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu ── */}
      <main className="w-full max-w-4xl animate-fade-up delay-1">
        {activeTab === 'gpx' && (
          <div className="flex flex-col gap-5">
            <GpxImport onTrackLoaded={handleTrackLoaded} />
            {track && (
              <>
                <TrackMap track={track} />
                <ElevationChart track={track} />
              </>
            )}
          </div>
        )}
        {activeTab === 'historique' && <HistoryPanel />}
        {activeTab === 'profil'     && <RunnerProfileForm />}
        {activeTab === 'simulation' && <SimulationPanel />}
        {activeTab === 'comparaison'&& <StrategyComparison />}
      </main>
    </div>
  )
}

export default App
