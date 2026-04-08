import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { useSupabaseSync } from '@/hooks/useSupabaseSync'
import './App.css'
import { Layout } from '@/components/layout/Layout'
import type { Page } from '@/types/navigation.types'
import { AccueilPage } from '@/features/home/AccueilPage'
import { PlanificateurPage } from '@/features/gpx/PlanificateurPage'
import { ProfilPage } from '@/features/runner/ProfilPage'
import { AccountPage } from '@/features/account/AccountPage'

// Migration : purger les données Strava persistées en localStorage
localStorage.removeItem('strava-store')

// ── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-[#ff6d00] border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
          {t('common.loading')}
        </span>
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { loading, initialize } = useAuthStore()
  const [activePage, setActivePage] = useState<Page>('accueil')

  useSupabaseSync()

  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [initialize])

  if (loading) return <LoadingScreen />

  const renderPage = () => {
    switch (activePage) {
      case 'accueil':
        return <AccueilPage onNavigate={(p) => setActivePage(p as Page)} />
      case 'planificateur':
        return <PlanificateurPage />
      case 'profil':
        return <ProfilPage />
      case 'compte':
        return <AccountPage />
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
