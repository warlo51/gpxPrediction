/**
 * NavBar — TopBar principale (MMA-13)
 * Toujours visible. Cliquer un lien ouvre la SideBar depuis la gauche.
 */

import { useStravaStore } from '@/stores/stravaStore'

export type Page = 'accueil' | 'dashboard' | 'planificateur' | 'strategie' | 'profil'

interface NavBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onSidebarOpen: () => void
}

const NAV_LINKS: { id: Page; label: string }[] = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'planificateur', label: 'Planner' },
  { id: 'strategie',     label: 'Strategies' },
  { id: 'profil',        label: 'Profil' },
]

export function NavBar({ activePage, onNavigate, onSidebarOpen }: NavBarProps) {
  const { athlete } = useStravaStore()

  const handleNavClick = (page: Page) => {
    onNavigate(page)
    onSidebarOpen()
  }

  return (
    <>
      {/* ── TopBar — toujours visible ── */}
      <nav
        className="flex fixed top-0 left-0 right-0 z-50
                   items-center justify-between px-8 h-[60px]
                   bg-[rgba(11,19,38,0.8)] backdrop-blur-[12px]
                   border-b border-white/[0.06]
                   shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
      >
        {/* Left: logo + links */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <button
            onClick={() => onNavigate('accueil')}
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

        {/* Right: action buttons + avatar */}
        <div className="flex items-center gap-3">
          {/* Analyze */}
          <button
            onClick={() => onNavigate('planificateur')}
            className="hidden sm:block px-5 py-[7px] rounded-[12px]
                       bg-[#2d3449] border border-[rgba(89,65,54,0.15)]
                       text-[#ffb692] text-[12px] font-semibold
                       hover:bg-[#363d55] transition-colors"
          >
            Analyze
          </button>

          {/* Sync Strava */}
          <button
            onClick={() => onNavigate('profil')}
            className="px-5 py-[7px] rounded-[12px] text-[12px] font-semibold text-[#341100]
                       shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1)]
                       hover:brightness-110 transition-all"
            style={{
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
            }}
          >
            {athlete ? athlete.firstname : 'Sync Strava'}
          </button>

          {/* Avatar */}
          <button
            onClick={() => onNavigate('profil')}
            className="w-[40px] h-[40px] rounded-[12px]
                       bg-[#171f33] border border-[rgba(89,65,54,0.2)]
                       flex items-center justify-center overflow-hidden
                       hover:border-[rgba(89,65,54,0.4)] transition-colors"
          >
            {athlete?.profile ? (
              <img src={athlete.profile} alt={athlete.firstname} className="w-full h-full object-cover" />
            ) : (
              <span className="text-base leading-none">🏃</span>
            )}
          </button>

          {/* Menu burger — mobile uniquement */}
          <button
            className="sm:hidden flex flex-col gap-[5px] p-1"
            onClick={onSidebarOpen}
            aria-label="Menu"
          >
            <span className="w-5 h-[2px] bg-[rgba(218,226,253,0.6)] rounded-full" />
            <span className="w-5 h-[2px] bg-[rgba(218,226,253,0.6)] rounded-full" />
            <span className="w-5 h-[2px] bg-[rgba(218,226,253,0.6)] rounded-full" />
          </button>
        </div>
      </nav>
    </>
  )
}