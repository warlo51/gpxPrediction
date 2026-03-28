import { useState, useCallback, useEffect } from 'react'
import './App.css'
import { NavBar } from '@/components/layout/NavBar'
import { SideBar } from '@/components/layout/SideBar'
import type { Page } from '@/components/layout/NavBar'
import { AccueilPage } from '@/features/home/AccueilPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { GpxImport } from '@/features/gpx/GpxImport'
import { ElevationChart } from '@/features/gpx/ElevationChart'
import { TrackMap } from '@/features/gpx/TrackMap'
import { SimulationPanel } from '@/features/analysis/SimulationPanel'
import { StrategyComparison } from '@/features/strategy/StrategyComparison'
import { RunnerProfileForm } from '@/features/runner/RunnerProfileForm'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { useAppStore } from '@/stores/appStore'
import type { GpxTrack } from '@/types'

function App() {
  const [activePage, setActivePage] = useState<Page>('accueil')
  const { track, setTrack } = useAppStore()

  // Retour du callback OAuth → aller sur le profil (import historique)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('error')) {
      setActivePage('profil')
    }
  }, [])

  const handleTrackLoaded = useCallback(
    (t: GpxTrack) => {
      setTrack(t)
      setActivePage('planificateur')
    },
    [setTrack],
  )

  return (
    <div className="min-h-screen">

      {/* ── Bande de fond décorative ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px]
                        rounded-full bg-indigo-900/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px]
                        rounded-full bg-violet-900/15 blur-3xl" />
      </div>

      {/* ── Sidebar (desktop lg+) ── */}
      <SideBar activePage={activePage} onNavigate={setActivePage} />

      {/* ── Top NavBar (sm → lg) + mobile bottom nav ── */}
      <NavBar activePage={activePage} onNavigate={setActivePage} />

      {/* ── Zone de contenu ── */}
      <div className="lg:pl-[220px] flex flex-col items-center
                      pt-[60px] lg:pt-0 pb-20 sm:pb-10 lg:pb-10
                      px-3 sm:px-6 lg:px-10 gap-5 sm:gap-7">
        <main className="w-full max-w-4xl animate-fade-up delay-1 pt-6 lg:pt-8">
          {activePage === 'accueil' && (
            <AccueilPage onNavigate={(p) => setActivePage(p as Page)} />
          )}
          {activePage === 'dashboard' && (
            <DashboardPage onNavigate={(p) => setActivePage(p as Page)} />
          )}
          {activePage === 'planificateur' && (
            <div className="flex flex-col gap-5">
              <GpxImport onTrackLoaded={handleTrackLoaded} />
              {track && (
                <>
                  <TrackMap track={track} />
                  <ElevationChart track={track} />
                  <SimulationPanel />
                </>
              )}
            </div>
          )}
          {activePage === 'strategie' && <StrategyComparison />}
          {activePage === 'profil' && (
            <div className="flex flex-col gap-5">
              <HistoryPanel />
              <RunnerProfileForm />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App