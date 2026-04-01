/**
 * SideBar — drawer latéral (MMA-12)
 * Structure fidèle au Figma 302:554 / 302:385.
 * S'ouvre de gauche à droite au clic d'un lien TopBar.
 */

import type { ReactNode } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import type { Page } from './NavBar'

interface SideBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
  isOpen: boolean
  onClose: () => void
}

const NAV_ITEMS: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'profil',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1"    y="1"    width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="10.5" y="1"    width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="1"    y="10.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
  {
    id: 'planificateur',
    label: 'Course Planner',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 4.5L6 3L12 6L16 4.5V14L12 15.5L6 12.5L2 14V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M6 3V12.5M12 6V15.5" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
  {
    id: 'strategie',
    label: 'Race Strategy',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M9 5V9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
]

// Icône + dans un cercle pour le bouton CTA
const IconPlus = () => (
  <svg width="11.667" height="11.667" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6 3.5V8.5M3.5 6H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
)

export function SideBar({ activePage, onNavigate, isOpen, onClose }: SideBarProps) {
  const { profile } = useAppStore()
  const { athlete }  = useStravaStore()

  const runnerName = athlete?.firstname
    ? `${athlete.firstname} ${athlete.lastname ?? ''}`.trim()
    : profile?.name ?? 'Pro Runner'

  const runnerLevel =
    profile?.enduranceScore !== undefined
      ? profile.enduranceScore >= 0.8 ? 'Elite Level'
        : profile.enduranceScore >= 0.5 ? 'Intermediate'
        : 'Beginner'
      : 'Elite Level'

  const handleNavClick = (page: Page) => {
    onNavigate(page)
    onClose()
  }

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 top-[60px] z-40',
          'bg-black/50',
          'transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* ── Drawer — fidèle Figma 302:554 ── */}
      <aside
        className={[
          // position + taille
          'fixed left-0 top-[60px] bottom-0 w-[220px] z-50',
          // layout global identique au Figma : justify-between + py-[32px]
          'flex flex-col justify-between py-[32px]',
          // fond + bordure
          'bg-[#060e20] border-r border-white/[0.05]',
          // animation slide
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >

        {/* ── Zone 1 : Margin → header profil + nav (flex-1) ── */}
        <div className="flex flex-col flex-1 min-h-0 pb-[40px]">

          {/* Header profil — h:[62px] avec positions absolues comme dans le Figma */}
          <div className="relative h-[62px] mx-[24px] shrink-0">
            {/* "CURRENT PROFILE" */}
            <span
              className="absolute top-0 left-0 right-0
                         text-[10px] font-normal leading-[15px] tracking-[1px] uppercase
                         text-[rgba(255,182,146,0.6)]"
            >
              Current Profile
            </span>
            {/* Runner name */}
            <span
              className="absolute top-[19px] left-0 right-0
                         text-[18px] font-bold leading-[28px]
                         text-[#dae2fd] truncate"
            >
              {runnerName}
            </span>
            {/* Level */}
            <span
              className="absolute top-[47px] left-0 right-0
                         text-[10px] font-normal leading-[15px] tracking-[0.5px] uppercase
                         text-[#99cbff]"
            >
              {runnerLevel}
            </span>
          </div>

          {/* Nav — flex-1 pour remplir l'espace restant */}
          <nav className="flex flex-col flex-1 mt-0">
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={[
                    'flex items-center gap-[16px] w-full py-[16px]',
                    'transition-all duration-200',
                    isActive
                      ? 'border-l-4 border-[#ff6d00] pl-[28px] pr-[24px] text-[#ffb692]'
                      : 'border-l-4 border-transparent px-[24px] text-[rgba(218,226,253,0.4)] hover:text-[rgba(218,226,253,0.7)]',
                  ].join(' ')}
                  style={isActive ? {
                    background: 'linear-gradient(to right, rgba(255,109,0,0.2) 0%, rgba(255,109,0,0) 100%)',
                  } : undefined}
                >
                  <span className="shrink-0 size-[18px] flex items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="text-[10px] font-normal leading-[15px] tracking-[1px] uppercase">
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── Zone 2 : CTA "New Strategy" en bas ── */}
        <div className="px-[24px] shrink-0">
          <button
            onClick={() => handleNavClick('strategie')}
            className="w-full flex items-center justify-center gap-[8px]
                       px-px py-[17px] rounded-[8px]
                       bg-[#2d3449] border border-[rgba(89,65,54,0.2)]
                       text-[10px] font-normal leading-[15px] tracking-[1px] uppercase text-center
                       text-[#dae2fd]
                       hover:bg-[#363d55] transition-colors"
          >
            <IconPlus />
            New Strategy
          </button>
        </div>

      </aside>
    </>
  )
}