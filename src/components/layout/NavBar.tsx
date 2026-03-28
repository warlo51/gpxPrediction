/**
 * NavBar — barre de navigation principale
 * Design adapté depuis Figma (MMA-13)
 */

import { useStravaStore } from '@/stores/stravaStore'

export type Page = 'accueil' | 'dashboard' | 'planificateur' | 'strategie' | 'profil'

interface NavBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_LINKS: { id: Page; label: string }[] = [
  { id: 'accueil',       label: 'Accueil' },
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'planificateur', label: 'Planificateur' },
  { id: 'strategie',     label: 'Stratégie' },
  { id: 'profil',        label: 'Profil' },
]

export function NavBar({ activePage, onNavigate }: NavBarProps) {
  const { athlete } = useStravaStore()

  return (
    <>
      {/* ── Top navbar (sm → lg) — masquée sur lg+ où la sidebar prend le relais ── */}
      <nav
        className="hidden sm:flex lg:hidden fixed top-0 left-0 right-0 z-50
                   items-center justify-between px-8 h-[60px]
                   bg-[rgba(7,13,26,0.85)] backdrop-blur-[12px]
                   border-b border-white/[0.06]
                   shadow-[0_4px_32px_rgba(0,0,0,0.5)]"
      >
        {/* Left: logo + links */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <button
            onClick={() => onNavigate('accueil')}
            className="font-black text-xl tracking-tight text-gradient leading-none"
          >
            GPX Trail
          </button>

          {/* Nav links */}
          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = activePage === link.id
              return (
                <button
                  key={link.id}
                  onClick={() => onNavigate(link.id)}
                  className={[
                    'relative text-[13px] font-medium pb-[6px] transition-colors duration-200',
                    isActive
                      ? 'text-indigo-300'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-indigo-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: action buttons + avatar */}
        <div className="flex items-center gap-3">
          {/* Simuler */}
          <button
            onClick={() => onNavigate('planificateur')}
            className="px-4 py-1.5 rounded-xl bg-slate-800 border border-indigo-900/30
                       text-indigo-300 text-[12px] font-semibold
                       hover:bg-slate-700 transition-colors"
          >
            Simuler
          </button>

          {/* Sync Strava */}
          <button
            onClick={() => onNavigate('profil')}
            className="px-4 py-1.5 rounded-xl text-[12px] font-semibold
                       bg-gradient-to-br from-[#fc4c02] to-[#e03d00]
                       text-white shadow-[0_4px_12px_rgba(252,76,2,0.35)]
                       hover:brightness-110 transition-all"
          >
            {athlete ? `${athlete.firstname}` : 'Sync Strava'}
          </button>

          {/* Avatar / profil */}
          <button
            onClick={() => onNavigate('profil')}
            className="w-9 h-9 rounded-xl bg-slate-800 border border-white/10
                       flex items-center justify-center overflow-hidden
                       hover:border-indigo-700/50 transition-colors"
          >
            {athlete?.profile ? (
              <img
                src={athlete.profile}
                alt={athlete.firstname}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-base leading-none">🏃</span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom navbar ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50
                   bg-[rgba(7,13,26,0.92)] backdrop-blur-[12px]
                   border-t border-white/[0.06]"
      >
        <div className="flex px-2 py-2 gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = activePage === link.id
            return (
              <button
                key={link.id}
                onClick={() => onNavigate(link.id)}
                className={[
                  'flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl',
                  'text-[10px] font-medium leading-tight transition-all duration-200',
                  isActive
                    ? 'bg-indigo-600 text-white glow-indigo'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
                ].join(' ')}
              >
                {link.label}
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}