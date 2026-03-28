/**
 * Page d'accueil — présentation de l'application et guide de démarrage
 */

import { useAppStore } from '@/stores/appStore'

interface AccueilPageProps {
  onNavigate: (page: string) => void
}

export function AccueilPage({ onNavigate }: AccueilPageProps) {
  const { track, sessions, profile } = useAppStore()

  const steps = [
    {
      page: 'planificateur',
      icon: '🗺️',
      title: 'Importez votre parcours',
      desc: 'Chargez un fichier GPX pour visualiser votre trace et lancer une simulation.',
      done: !!track,
    },
    {
      page: 'profil',
      icon: '🏃',
      title: 'Calibrez votre profil',
      desc: 'Importez votre historique Strava, Garmin ou FIT pour affiner vos paramètres.',
      done: sessions.length > 0,
    },
    {
      page: 'planificateur',
      icon: '📊',
      title: 'Simulez votre performance',
      desc: 'Obtenez une prédiction de temps, rythme et fréquence cardiaque segment par segment.',
      done: !!track && !!profile,
    },
    {
      page: 'strategie',
      icon: '⚖️',
      title: 'Comparez les stratégies',
      desc: 'Testez plusieurs allures de course et trouvez la stratégie optimale.',
      done: false,
    },
  ]

  return (
    <div className="flex flex-col gap-8 animate-fade-up">

      {/* Hero */}
      <div className="glass rounded-2xl p-6 sm:p-10 text-center border border-indigo-800/30">
        <div className="text-5xl mb-4">🏔️</div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          Bienvenue sur <span className="text-gradient">GPX Trail Predictor</span>
        </h2>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mb-6">
          Analysez vos parcours trail, calibrez votre profil de coureur depuis votre historique
          d'entraînement, et simulez vos performances segment par segment.
        </p>
        <button
          onClick={() => onNavigate('planificateur')}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors glow-indigo"
        >
          Commencer →
        </button>
      </div>

      {/* Guide de démarrage */}
      <div>
        <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wider mb-4">
          Guide de démarrage
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {steps.map((step, i) => (
            <button
              key={i}
              onClick={() => onNavigate(step.page)}
              className="glass rounded-xl p-4 border border-slate-800/60 text-left hover:border-indigo-700/50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className={[
                  'w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0',
                  step.done ? 'bg-emerald-900/60 border border-emerald-700/40' : 'bg-slate-800/60 border border-slate-700/40',
                ].join(' ')}>
                  {step.done ? '✅' : step.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                      {i + 1}. {step.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Résumé rapide */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Parcours chargé', value: track ? track.name || 'Oui' : '—', icon: '🗺️' },
          { label: 'Sessions', value: sessions.length > 0 ? `${sessions.length}` : '—', icon: '📋' },
          { label: 'Profil', value: profile ? profile.name : '—', icon: '🏃' },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-xl p-3 border border-slate-800/60 text-center">
            <div className="text-xl mb-1">{stat.icon}</div>
            <div className="text-sm font-semibold text-white">{stat.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}