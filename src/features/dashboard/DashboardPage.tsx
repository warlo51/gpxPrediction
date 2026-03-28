/**
 * Page Dashboard — vue d'ensemble et analyse du profil coureur
 */

import { RunnerAnalysisPanel } from '@/features/runner/RunnerAnalysis'
import { useAppStore } from '@/stores/appStore'

interface DashboardPageProps {
  onNavigate: (page: string) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { sessions, profile } = useAppStore()

  if (sessions.length === 0 || !profile) {
    return (
      <div className="glass rounded-2xl p-8 text-center border border-slate-800/60">
        <div className="text-4xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-slate-200 mb-2">Aucune donnée disponible</h3>
        <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">
          Importez votre historique d'entraînement pour débloquer votre tableau de bord personnalisé.
        </p>
        <button
          onClick={() => onNavigate('profil')}
          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          Aller au profil →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <RunnerAnalysisPanel />
    </div>
  )
}