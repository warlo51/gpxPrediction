import { useAuthStore } from '@/stores/authStore'
import type { ReactNode } from 'react'

export function PremiumGate({ children }: { children: ReactNode }) {
  const isPremium = useAuthStore((s) => s.isPremium)
  const user = useAuthStore((s) => s.user)

  if (isPremium) return <>{children}</>

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Contenu flouté */}
      <div className="pointer-events-none select-none blur-[6px] opacity-50" aria-hidden>
        {children}
      </div>

      {/* Overlay premium */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-black/70 border border-amber-500/30 backdrop-blur-sm max-w-xs text-center">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <p className="text-amber-300 font-bold text-sm mb-1">Acces Premium requis</p>
            <p className="text-slate-400 text-xs leading-relaxed">
              {user
                ? 'La synchronisation Strava et Garmin Connect est reservee aux comptes Premium.'
                : 'Connectez-vous avec un compte Premium pour synchroniser vos activites Strava et Garmin.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
