import { useState, useEffect } from 'react'
import './App.css'
import { NavBar } from '@/components/layout/NavBar'
import { SideBar } from '@/components/layout/SideBar'
import type { Page } from '@/components/layout/NavBar'
import { AccueilPage } from '@/features/home/AccueilPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { PlanificateurPage } from '@/features/gpx/PlanificateurPage'
import { StrategyComparison } from '@/features/strategy/StrategyComparison'
import { ProfilPage } from '@/features/runner/ProfilPage'

function App() {
  const [activePage, setActivePage] = useState<Page>('accueil')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Retour du callback OAuth → aller sur le profil (import historique)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('error')) {
      setActivePage('profil')
    }
  }, [])

  return (
    <div className="min-h-screen">

      {/* ── Bande de fond décorative ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px]
                        rounded-full bg-indigo-900/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px]
                        rounded-full bg-violet-900/15 blur-3xl" />
      </div>

      {/* ── SideBar — drawer, s'ouvre au clic TopBar ── */}
      <SideBar
        activePage={activePage}
        onNavigate={setActivePage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── TopBar — toujours visible ── */}
      <NavBar
        activePage={activePage}
        onNavigate={setActivePage}
        onSidebarOpen={() => setSidebarOpen(true)}
      />

      {/* ── Page Accueil : full-width, pas de contrainte max-w ── */}
      {activePage === 'accueil' && (
        <div className="pt-[60px] pb-20 sm:pb-10 animate-fade-up">
          <AccueilPage onNavigate={(p) => setActivePage(p as Page)} />
        </div>
      )}

      {/* ── Autres pages : layout centré ── */}
      {activePage !== 'accueil' && (
        <div className="flex flex-col items-center
                        pt-[60px] pb-20 sm:pb-10
                        px-3 sm:px-6 lg:px-10 gap-5 sm:gap-7">
          <main className="w-full max-w-4xl animate-fade-up delay-1 pt-6 lg:pt-8">
            {activePage === 'dashboard' && (
              <DashboardPage onNavigate={(p) => setActivePage(p as Page)} />
            )}
            {activePage === 'planificateur' && (
              <PlanificateurPage
                onNavigateToStrategy={() => setActivePage('strategie')}
              />
            )}
            {activePage === 'strategie' && <StrategyComparison />}
            {activePage === 'profil' && <ProfilPage />}
          </main>
        </div>
      )}
    </div>
  )
}

export default App