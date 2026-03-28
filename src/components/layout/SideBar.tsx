/**
 * SideBar — navigation latérale desktop
 * Design adapté depuis Figma (MMA-12)
 */

import type { ReactNode } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import type { Page } from './NavBar'

interface SideBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_ITEMS: { id: Page; label: string; icon: ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="10.5" y="1" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="1" y="10.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
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
  {
    id: 'profil',
    label: 'Sync Data',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9C3 5.686 5.686 3 9 3c1.8 0 3.42.756 4.58 1.97" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M15 9c0 3.314-2.686 6-6 6-1.8 0-3.42-.756-4.58-1.97" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M12.5 1.5L14.5 4 12 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5.5 16.5L3.5 14l2.5-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

export function SideBar({ activePage, onNavigate }: SideBarProps) {
  const { profile } = useAppStore()
  const { athlete } = useStravaStore()

  const runnerName = athlete?.firstname
    ? `${athlete.firstname} ${athlete.lastname ?? ''}`.trim()
    : profile?.name ?? 'Trail Runner'

  const runnerLevel = profile?.enduranceScore
    ? profile.enduranceScore >= 0.8 ? 'Elite Level'
      : profile.enduranceScore >= 0.5 ? 'Intermediate'
      : 'Beginner'
    : 'Trail Runner'

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] z-40
                      flex-col justify-between py-8
                      bg-[#060e20] border-r border-white/[0.05]">

      {/* ── Logo + nav ── */}
      <div className="flex flex-col gap-1">
        {/* Logo */}
        <div className="px-6 pb-10">
          <button
            onClick={() => onNavigate('accueil')}
            className="font-black text-[20px] tracking-[-0.5px] text-gradient leading-none"
          >
            GPX Trail
          </button>
        </div>

        {/* Nav links */}
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={[
                'relative flex items-center gap-4 px-6 py-4 w-full transition-all duration-200',
                isActive
                  ? 'border-l-4 border-indigo-500 pl-[20px] text-indigo-300'
                  : 'border-l-4 border-transparent text-slate-500 hover:text-slate-300',
              ].join(' ')}
              style={isActive ? {
                background: 'linear-gradient(to right, rgba(99,102,241,0.15), transparent)',
              } : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-[10px] font-medium tracking-[1px] uppercase">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Profile card + CTA ── */}
      <div className="flex flex-col gap-6 px-6">
        {/* Runner card */}
        <div className="flex items-center gap-3 bg-slate-900/60 rounded-xl p-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/10
                          flex items-center justify-center overflow-hidden shrink-0">
            {athlete?.profile ? (
              <img src={athlete.profile} alt={runnerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg leading-none">🏃</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-200 truncate">{runnerName}</p>
            <p className="text-[8px] font-medium tracking-[0.8px] uppercase text-indigo-400 mt-0.5">
              {runnerLevel}
            </p>
          </div>
        </div>

        {/* CTA button */}
        <button
          onClick={() => onNavigate('strategie')}
          className="w-full py-3 rounded-xl text-[14px] font-bold text-center
                     bg-gradient-to-br from-indigo-500 to-violet-600
                     text-white shadow-[0_8px_20px_rgba(99,102,241,0.3)]
                     hover:brightness-110 transition-all"
        >
          Nouvelle stratégie
        </button>
      </div>
    </aside>
  )
}