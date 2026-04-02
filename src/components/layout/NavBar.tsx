/**
 * NavBar — TopBar principale
 * Toujours visible. Avatar avec dropdown pour accès compte / déconnexion.
 */

import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'

export type Page = 'accueil' | 'planificateur' | 'profil' | 'compte'

interface NavBarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_LINKS: { id: Page; label: string }[] = [
  { id: 'profil',        label: 'Dashboard' },
  { id: 'planificateur', label: 'Planner' },
]

export function NavBar({ activePage, onNavigate }: NavBarProps) {
  const { user, signOut } = useAuthStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const handleNavClick = (page: Page) => {
    onNavigate(page)
    setMobileMenuOpen(false)
  }

  const userEmail = user?.email ?? ''
  const userInitial = (userEmail[0] ?? '?').toUpperCase()

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

        {/* Right: avatar/login + burger */}
        <div className="flex items-center gap-3">
          {user ? (
            /* ── Utilisateur connecte : avatar + dropdown ── */
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="flex w-[36px] h-[36px] rounded-full overflow-hidden
                           border-2 border-transparent hover:border-[rgba(255,109,0,0.4)]
                           transition-colors"
              >
                <div
                  className="w-full h-full flex items-center justify-center text-[13px] font-bold"
                  style={{ background: '#2d3449', color: '#ffb692' }}
                >
                  {userInitial}
                </div>
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] w-52 rounded-xl overflow-hidden
                             shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
                  style={{ background: '#1a2237', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-[12px] font-semibold text-white truncate">
                      {userEmail || 'Utilisateur'}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { handleNavClick('compte'); setDropdownOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-[rgba(218,226,253,0.7)]
                                 hover:bg-white/[0.04] hover:text-white transition-colors text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M2.5 12.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Mon compte
                    </button>
                    <button
                      onClick={() => { setDropdownOpen(false); signOut() }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] text-red-400/70
                                 hover:bg-white/[0.04] hover:text-red-400 transition-colors text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 2H3.5a1 1 0 00-1 1v8a1 1 0 001 1H5M9 10l2.5-3L9 4M11.5 7H5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Se deconnecter
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Utilisateur anonyme : bouton Se connecter ── */
            <button
              onClick={() => handleNavClick('compte')}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold tracking-wide
                         transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
                color: '#341100',
              }}
            >
              Se connecter
            </button>
          )}

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
          <div
            className="sm:hidden fixed inset-0 z-30 top-[60px]"
            onClick={() => setMobileMenuOpen(false)}
          />
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
    </>
  )
}
