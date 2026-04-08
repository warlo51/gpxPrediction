import type { ReactNode } from 'react'
import { NavBar } from './NavBar'
import type { Page } from '@/types/navigation.types'

interface LayoutProps {
  activePage: Page
  onNavigate: (page: Page) => void
  children: ReactNode
  fullWidth?: boolean
}

export function Layout({ activePage, onNavigate, children, fullWidth }: LayoutProps) {
  return (
    <div className="min-h-screen">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px]
                        rounded-full bg-indigo-100/40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px]
                        rounded-full bg-violet-50/30 blur-3xl" />
      </div>

      <NavBar activePage={activePage} onNavigate={onNavigate} />

      {fullWidth ? (
        <div className="pt-[60px] pb-20 sm:pb-10 animate-fade-up">
          {children}
        </div>
      ) : (
        <div className="flex flex-col items-center
                        pt-[60px] pb-20 sm:pb-10
                        px-3 sm:px-6 lg:px-10 gap-5 sm:gap-7">
          <main className="w-full max-w-4xl animate-fade-up delay-1 pt-6 lg:pt-8">
            {children}
          </main>
        </div>
      )}
    </div>
  )
}
