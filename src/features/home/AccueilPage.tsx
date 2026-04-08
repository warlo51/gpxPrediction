/**
 * Page d'accueil — light theme (MMA-33)
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getGlobalGpxCount } from '@/services/supabase.service'

interface AccueilPageProps {
  onNavigate: (page: string) => void
}

// ── Icônes inline SVG ────────────────────────────────────────────────────────

const IconBolt = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
    <path d="M6 1L1 8h4l-1 5 5-7H5l1-5z" fill="#ff6d00"/>
  </svg>
)
const IconMap = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path d="M2 6l8-3 8 4 8-3v16l-8 3-8-4-8 3V6z" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M10 3v13M18 7v13" stroke="#6366f1" strokeWidth="1.5"/>
  </svg>
)
const IconSync = () => (
  <svg width="60" height="54" viewBox="0 0 60 54" fill="none">
    <path d="M10 27C10 16.5 18.5 8 29 8c5.8 0 11 2.5 14.7 6.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"/>
    <path d="M48 27C48 37.5 39.5 46 29 46c-5.8 0-11-2.5-14.7-6.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"/>
    <path d="M42 3l5 6-5.5 3.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 51l-5-6 5.5-3.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconStrategy = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="#6366f1" strokeWidth="1.5"/>
    <path d="M12 7v5.5l3.5 3.5" stroke="#ff6d00" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const Icon3D = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)
const IconChart = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M3 20h18M6 16v-4M10 16V8M14 16v-6M18 16V6" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

// ── Composant ────────────────────────────────────────────────────────────────

export function AccueilPage({ onNavigate }: AccueilPageProps) {
  const { t } = useTranslation()
  const [gpxCount, setGpxCount] = useState<number | null>(null)

  useEffect(() => {
    getGlobalGpxCount()
      .then(setGpxCount)
      .catch(() => {})
  }, [])

  return (
    <div className="w-full min-h-screen flex flex-col" style={{ color: 'var(--color-text)' }}>

      {/* ══ HERO ═══════════════════════════════════════════════════════════════ */}
      <section className="relative flex items-center overflow-hidden min-h-[640px] lg:min-h-[720px] px-6 sm:px-12 lg:px-20 py-24">

        {/* Abstract background gradient */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 80% 60% at 70% 30%, rgba(255,109,0,0.05) 0%, transparent 60%),
                radial-gradient(ellipse 60% 50% at 20% 80%, rgba(99,102,241,0.05) 0%, transparent 50%)
              `,
            }}
          />
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col gap-6 max-w-2xl">

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-xl"
              style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
            >
              <IconBolt />
              <span className="text-[10px] tracking-[2px] uppercase font-semibold" style={{ color: '#ff6d00' }}>
                {t('home.badge')}
              </span>
            </div>
            {gpxCount !== null && gpxCount > 0 && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1 rounded-xl"
                style={{ background: 'var(--color-surface)', border: '1px solid rgba(255,109,0,0.15)' }}
              >
                <span style={{ fontSize: 12 }}>🗺️</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  <strong style={{ color: '#ff6d00' }}>{gpxCount.toLocaleString('fr-FR')}</strong>
                  {' '}{t('home.savedTracks')}
                </span>
              </div>
            )}
          </div>

          {/* Heading */}
          <h1
            className="font-black uppercase leading-none"
            style={{ fontSize: 'clamp(48px, 8vw, 96px)', letterSpacing: '-0.05em' }}
          >
            <span style={{ color: 'var(--color-text)' }}>{t('home.heading1')}</span>
            <br />
            <span style={{ color: '#ff6d00' }}>{t('home.heading2')}</span>
            <br />
            <span style={{ color: 'var(--color-text)' }}>{t('home.heading3')}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-[18px] leading-[1.65] max-w-lg" style={{ color: 'var(--color-text-muted)' }}>
            {t('home.subtitle')}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 pt-2">
            <button
              onClick={() => onNavigate('profil')}
              className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(136deg, #ffb692 0%, #ff6d00 100%)',
                color: '#341100',
              }}
            >
              {t('home.ctaAnalysis')}
            </button>
            <button
              onClick={() => onNavigate('planificateur')}
              className="flex items-center justify-center px-8 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-wider transition-all hover:brightness-105"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-strong)',
                color: 'var(--color-text)',
              }}
            >
              {t('home.ctaImportGpx')}
            </button>
          </div>
        </div>

        {/* Floating preview — real feature list */}
        <div
          className="absolute bottom-12 right-8 sm:right-16 lg:right-20 hidden lg:flex flex-col gap-4 rounded-xl p-8"
          style={{
            background: 'var(--color-surface)',
            borderLeft: '4px solid #ff6d00',
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
            border: '1px solid var(--color-border)',
            borderLeftWidth: '4px',
            borderLeftColor: '#ff6d00',
          }}
        >
          <span className="text-[10px] tracking-[1px] uppercase font-semibold" style={{ color: 'var(--color-text-muted)' }}>
            {t('home.whatYouGet')}
          </span>
          <ul className="flex flex-col gap-2.5 text-[13px]" style={{ color: 'var(--color-text)' }}>
            {[
              t('home.feature1'),
              t('home.feature2'),
              t('home.feature3'),
              t('home.feature4'),
              t('home.feature5'),
            ].map(item => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#ff6d00' }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ══ FEATURE BENTO GRID ═════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-12 lg:px-20 py-20 flex flex-col gap-16">

        {/* Section header */}
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-[36px] uppercase tracking-wide" style={{ color: 'var(--color-text)' }}>
            {t('home.howItWorks')}
          </h2>
          <div
            className="h-1 w-24 rounded-full"
            style={{ background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)' }}
          />
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-12 gap-6">

          {/* Feature 1 — Analyse GPX */}
          <div
            className="col-span-12 lg:col-span-8 flex flex-col justify-between p-10 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: 320, boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <IconMap />
                <h3 className="font-black text-[28px] uppercase" style={{ color: 'var(--color-text)' }}>
                  {t('home.gpxAnalysisTitle')}
                </h3>
              </div>
              <p className="text-[17px] leading-[1.65] max-w-lg" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.gpxAnalysisDesc')}
              </p>
            </div>
            <div className="flex gap-3 mt-8 flex-wrap">
              {[t('home.autoSegmentation'), t('home.elevationProfile'), t('home.view3d'), t('home.interactiveMap')].map(tag => (
                <span key={tag} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide"
                  style={{ background: 'rgba(255,109,0,0.08)', color: '#ff6d00', border: '1px solid rgba(255,109,0,0.15)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Feature 2 — Sync */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col items-center justify-center text-center p-10 rounded-2xl"
            style={{ background: '#ff6d00' }}
          >
            <div className="mb-6">
              <IconSync />
            </div>
            <h3 className="font-black text-[22px] uppercase leading-tight mb-4" style={{ color: '#ffffff' }}>
              {t('home.dataImportTitle')}
            </h3>
            <p className="text-[15px] leading-[1.65] opacity-90" style={{ color: '#fff3eb' }}>
              {t('home.dataImportDesc')}
            </p>
            <div className="flex gap-3 mt-8">
              <div className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff' }}>
                {t('home.fitFiles')}
              </div>
            </div>
          </div>

          {/* Feature 3 — Simulation */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col justify-between p-10 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: 200, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          >
            <div className="mb-6">
              <IconStrategy />
            </div>
            <div>
              <h3 className="font-black text-[22px] uppercase mb-3" style={{ color: 'var(--color-text)' }}>
                {t('home.simulationTitle')}
              </h3>
              <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.simulationDesc')}
              </p>
            </div>
          </div>

          {/* Feature 4 — Vue 3D */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col justify-between p-10 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: 200, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          >
            <div className="mb-6">
              <Icon3D />
            </div>
            <div>
              <h3 className="font-black text-[22px] uppercase mb-3" style={{ color: 'var(--color-text)' }}>
                {t('home.visualization3dTitle')}
              </h3>
              <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.visualization3dDesc')}
              </p>
            </div>
          </div>

          {/* Feature 5 — Profil coureur */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col justify-between p-10 rounded-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: 200, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
          >
            <div className="mb-6">
              <IconChart />
            </div>
            <div>
              <h3 className="font-black text-[22px] uppercase mb-3" style={{ color: 'var(--color-text)' }}>
                {t('home.runnerProfileTitle')}
              </h3>
              <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.runnerProfileDesc')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-12 lg:px-20 pb-16">
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-5 rounded-2xl"
          style={{ background: 'var(--color-surface-3)', border: '1px solid var(--color-border)' }}
        >
          <p className="text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
            {t('home.ctaReady')}
          </p>
          <button
            onClick={() => onNavigate('planificateur')}
            className="px-10 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-widest transition-all hover:brightness-110 whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
              color: '#341100',
              boxShadow: '0 4px 16px rgba(255,109,0,0.2)',
            }}
          >
            {t('home.ctaImportFile')}
          </button>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer
        className="mt-auto px-6 sm:px-12 lg:px-20 pt-16 pb-8 flex flex-col gap-12"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col sm:flex-row justify-between gap-12">
          <div className="flex flex-col gap-4 max-w-xs">
            <span className="font-black text-[20px] tracking-[-0.05em]" style={{ color: '#ff6d00' }}>
              PacePrecision
            </span>
            <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--color-text-muted)' }}>
              {t('home.footerDesc')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-12">
            <div className="flex flex-col gap-5">
              <span className="text-[11px] font-semibold tracking-[1.2px] uppercase" style={{ color: 'var(--color-text)' }}>
                {t('home.features')}
              </span>
              <ul className="flex flex-col gap-3">
                {[
                  { label: t('home.gpxStrategy'), page: 'planificateur' },
                  { label: t('home.runnerProfile'), page: 'profil' },
                ].map(item => (
                  <li key={item.label}>
                    <button
                      onClick={() => onNavigate(item.page)}
                      className="text-[13px] hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-5">
              <span className="text-[11px] font-semibold tracking-[1.2px] uppercase" style={{ color: 'var(--color-text)' }}>
                {t('home.dataSources')}
              </span>
              <ul className="flex flex-col gap-3">
                {['Garmin Connect', t('home.gpxFiles')].map(label => (
                  <li key={label} className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          <span className="text-[10px] tracking-[2px] uppercase" style={{ color: 'var(--color-text-subtle)' }}>
            © {new Date().getFullYear()} PacePrecision
          </span>
        </div>
      </footer>
    </div>
  )
}
