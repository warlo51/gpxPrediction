import { useState, useEffect } from 'react'
import './App.css'
import { Layout } from '@/components/layout/Layout'
import type { Page } from '@/components/layout/NavBar'
import { AccueilPage } from '@/features/home/AccueilPage'
import { PlanificateurPage } from '@/features/gpx/PlanificateurPage'
import { StrategyComparison } from '@/features/strategy/StrategyComparison'
import { RacePlanPage } from '@/features/strategy/RacePlanPage'
import { ProfilPage } from '@/features/runner/ProfilPage'

type StrategyTab = 'plan' | 'comparison'

function App() {
  const [activePage, setActivePage] = useState<Page>('accueil')
  const [strategyTab, setStrategyTab] = useState<StrategyTab>('plan')

  // Retour du callback OAuth → aller sur le profil (import historique)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('error')) {
      setActivePage('profil')
    }
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'accueil':
        return <AccueilPage onNavigate={(p) => setActivePage(p as Page)} />
      case 'planificateur':
        return <PlanificateurPage onNavigateToStrategy={() => setActivePage('strategie')} />
      case 'strategie':
        return (
          <div className="flex flex-col gap-5">
            <div className="flex gap-2">
              <button
                onClick={() => setStrategyTab('plan')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  strategyTab === 'plan'
                    ? 'bg-[#ff6d00]/15 border-[#ff6d00]/40 text-[#ffb692]'
                    : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                Plan de Course
              </button>
              <button
                onClick={() => setStrategyTab('comparison')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  strategyTab === 'comparison'
                    ? 'bg-[#ff6d00]/15 border-[#ff6d00]/40 text-[#ffb692]'
                    : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                Comparaison rapide
              </button>
            </div>
            {strategyTab === 'plan'       && <RacePlanPage />}
            {strategyTab === 'comparison' && <StrategyComparison />}
          </div>
        )
      case 'profil':
        return <ProfilPage />
    }
  }

  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      fullWidth={activePage === 'accueil'}
    >
      {renderPage()}
    </Layout>
  )
}

export default App