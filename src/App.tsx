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
    <div className="min-h-screen flex flex-col items-center pb-20 sm:pb-6 px-3 sm:px-6 gap-4 sm:gap-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center pt-4 sm:pt-6 w-full">
        <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1">🏔️ GPX Trail Predictor</h1>
        <p className="text-slate-400 text-sm sm:text-lg hidden sm:block">
          Analyse GPX · Profil coureur · Simulation de course
        </p>
      </div>

      {/* Navigation onglets — sticky en bas sur mobile, en haut sur desktop */}
      <div className="fixed sm:static bottom-0 left-0 right-0 z-50 sm:z-auto
                      bg-slate-900 sm:bg-transparent border-t border-slate-700 sm:border-0
                      px-2 py-2 sm:p-0">
        <div className="flex gap-1 sm:gap-1.5 sm:bg-slate-800/60 sm:rounded-2xl sm:p-1.5 w-full sm:max-w-2xl sm:mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-3 py-1.5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50',
              ].join(' ')}
            >
              <span className="text-base sm:text-sm">{tab.icon}</span>
              <span className="text-[10px] sm:text-sm leading-tight">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'gpx' && (
        <div className="w-full flex flex-col gap-6">
          <GpxImport onTrackLoaded={handleTrackLoaded} />
          {track && (
            <>
              <TrackMap track={track} />
              <ElevationChart track={track} />
            </>
          )}
        </div>
      )}
      {activeTab === 'historique' && (
        <div className="w-full">
          <HistoryPanel />
        </div>
      )}
      {activeTab === 'profil' && (
        <div className="w-full">
          <RunnerProfileForm />
        </div>
      )}
      {activeTab === 'simulation' && (
        <div className="w-full">
          <SimulationPanel />
        </div>
      )}
      {activeTab === 'comparaison' && (
        <div className="w-full">
          <StrategyComparison />
        </div>
      )}
    </div>
  )
}

export default App
