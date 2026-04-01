/**
 * NavBar — TopBar principale (MMA-13)
 * Toujours visible. Cliquer un lien ouvre la SideBar depuis la gauche.
 */

import { useState } from 'react'
import { useStravaStore } from '@/stores/stravaStore'
import { useGarminStore } from '@/stores/garminStore'
import { StravaConnect } from '@/features/strava/StravaConnect'
import { GarminConnect } from '@/features/history/GarminConnect'

export type Page = 'accueil' | 'planificateur' | 'strategie' | 'profil'

interface NavBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_LINKS: { id: Page; label: string }[] = [
  { id: 'profil',        label: 'Dashboard' },
  { id: 'planificateur', label: 'Planner' },
  { id: 'strategie',     label: 'Strategies' },
]

export function NavBar({ activePage, onNavigate }: NavBarProps) {
  const { athlete, token } = useStravaStore()
  const garminOauth1 = useGarminStore(s => s.oauth1)
  const garminOauth2 = useGarminStore(s => s.oauth2)
  const [connectOpen, setConnectOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const stravaConnected = !!(athlete && token)
  const garminConnected = !!(garminOauth1 && garminOauth2)
  const anyConnected = stravaConnected || garminConnected
  const allConnected = stravaConnected && garminConnected

  const handleNavClick = (page: Page) => {
    onNavigate(page)
    setMobileMenuOpen(false)
  }

  return (
    <>
      {/* ── TopBar — toujours visible ── */}
      <nav
        className="flex fixed top-0 left-0 right-0 z-50
                   items-center justify-between px-6 sm:px-8 h-[60px]
                   bg-[rgba(11,19,38,0.8)] backdrop-blur-[12px]
                   border-b border-white/[0.06]
                   shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
      >
        {/* Left: logo + links */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <button
            onClick={() => handleNavClick('accueil')}
            className="font-black text-[20px] tracking-[-0.05em] leading-none"
            style={{
              background: 'linear-gradient(168deg, #ffb692 0%, #ff6d00 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PacePrecision
          </button>

          {/* Nav links — masqués sur mobile */}
          <div className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = activePage === link.id
              return (
                <button
                  key={link.id}
                  onClick={() => handleNavClick(link.id)}
                  className={[
                    'relative text-[12px] font-normal pb-[6px] transition-colors duration-200',
                    isActive
                      ? 'text-[#ffb692]'
                      : 'text-[rgba(218,226,253,0.6)] hover:text-[rgba(218,226,253,0.9)]',
                  ].join(' ')}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff6d00]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: connection button + burger */}
        <div className="flex items-center gap-3">
          {/* Connexion */}
          <button
            onClick={() => setConnectOpen(true)}
            className="flex items-center gap-2 px-4 py-[7px] rounded-[12px] text-[12px] font-semibold
                       transition-all hover:brightness-110"
            style={anyConnected ? {
              background: '#2d3449',
              border: '1px solid rgba(89,65,54,0.15)',
              color: '#dae2fd',
            } : {
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
              color: '#341100',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            }}
          >
            {/* Status dots */}
            {anyConnected && (
              <div className="flex items-center gap-1.5">
                <span className={`w-[6px] h-[6px] rounded-full ${stravaConnected ? 'bg-[#22c55e]' : 'bg-[rgba(218,226,253,0.2)]'}`} />
                <span className={`w-[6px] h-[6px] rounded-full ${garminConnected ? 'bg-[#22c55e]' : 'bg-[rgba(218,226,253,0.2)]'}`} />
              </div>
            )}
            {allConnected
              ? 'Connecté'
              : anyConnected
                ? (stravaConnected ? 'Strava connecté' : 'Garmin connecté')
                : 'Se connecter'}
          </button>

          {/* Menu burger — mobile uniquement */}
          <button
            className="sm:hidden flex flex-col gap-[5px] p-1"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label="Menu"
          >
            <span className={`w-5 h-[2px] bg-[rgba(218,226,253,0.7)] rounded-full transition-transform duration-200 origin-center ${mobileMenuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`w-5 h-[2px] bg-[rgba(218,226,253,0.7)] rounded-full transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`w-5 h-[2px] bg-[rgba(218,226,253,0.7)] rounded-full transition-transform duration-200 origin-center ${mobileMenuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </button>
        </div>
      </nav>

      {/* ── Overlay + Menu mobile ── */}
      {mobileMenuOpen && (
        <>
          {/* Overlay — ferme le menu au clic extérieur et bloque le contenu */}
          <div
            className="sm:hidden fixed inset-0 z-30 top-[60px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Menu */}
          <div
            className="sm:hidden fixed top-[60px] left-0 right-0 z-40
                       bg-[rgba(11,19,38,0.97)] backdrop-blur-[12px]
                       border-b border-white/[0.06]
                       shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-col py-2">
              {NAV_LINKS.map((link) => {
                const isActive = activePage === link.id
                return (
                  <button
                    key={link.id}
                    onClick={() => handleNavClick(link.id)}
                    className={[
                      'flex items-center px-6 py-3.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'text-[#ffb692] bg-white/[0.04]'
                        : 'text-[rgba(218,226,253,0.6)] hover:text-[rgba(218,226,253,0.9)] hover:bg-white/[0.03]',
                    ].join(' ')}
                  >
                    {isActive && <span className="w-1 h-4 rounded-full bg-[#ff6d00] mr-3 shrink-0" />}
                    {!isActive && <span className="w-1 h-4 mr-3 shrink-0" />}
                    {link.label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Modal Connexions ── */}
      {connectOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4 pb-8 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConnectOpen(false)}
        >
          <div
            className="w-full max-w-lg flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm tracking-wide uppercase">Connexions</h2>
              <button
                onClick={() => setConnectOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-3 py-1 rounded-lg
                           bg-white/5 hover:bg-white/10 transition-colors"
              >
                ✕ Fermer
              </button>
            </div>
            <StravaConnect />
            <GarminConnect />
          </div>
        </div>
      )}
    </>
  )
}