/**
 * Page d'accueil — refonte complète selon le design Figma MMA-6
 * Couleurs, layout et typographie respectés à la lettre.
 */

const imgAthlete   = 'https://www.figma.com/api/mcp/asset/e7b91d6c-ff71-4986-a5fe-c2ccecfe6740'
const imgTerrain   = 'https://www.figma.com/api/mcp/asset/d15bbbb4-1c67-4005-be6d-5c79eece7159'
const imgUser1     = 'https://www.figma.com/api/mcp/asset/4ae31a60-770e-48fd-9726-c128a4c66e4f'
const imgUser2     = 'https://www.figma.com/api/mcp/asset/9fe4a4b0-0995-4d37-a370-b32cf55b1e5d'
const imgUser3     = 'https://www.figma.com/api/mcp/asset/1f973b14-4d2b-42f6-a0fb-3b86ca3d57df'

interface AccueilPageProps {
  onNavigate: (page: string) => void
}

// ── Icônes inline SVG ────────────────────────────────────────────────────────

const IconBolt = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
    <path d="M6 1L1 8h4l-1 5 5-7H5l1-5z" fill="#ffb692"/>
  </svg>
)
const IconStrava = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
    <path d="M7 1L4 8h2l-1 5 4-7H7l1-5z" fill="#341100" opacity="0.8"/>
  </svg>
)
const IconMap = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path d="M2 6l8-3 8 4 8-3v16l-8 3-8-4-8 3V6z" stroke="#dae2fd" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M10 3v13M18 7v13" stroke="#dae2fd" strokeWidth="1.5"/>
  </svg>
)
const IconSync = () => (
  <svg width="60" height="54" viewBox="0 0 60 54" fill="none">
    <path d="M10 27C10 16.5 18.5 8 29 8c5.8 0 11 2.5 14.7 6.5" stroke="#582100" strokeWidth="3" strokeLinecap="round"/>
    <path d="M48 27C48 37.5 39.5 46 29 46c-5.8 0-11-2.5-14.7-6.5" stroke="#582100" strokeWidth="3" strokeLinecap="round"/>
    <path d="M42 3l5 6-5.5 3.5" stroke="#582100" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 51l-5-6 5.5-3.5" stroke="#582100" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconStrategy = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="#dae2fd" strokeWidth="1.5"/>
    <path d="M12 7v5.5l3.5 3.5" stroke="#ff6d00" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

// ── Composant ────────────────────────────────────────────────────────────────

export function AccueilPage({ onNavigate }: AccueilPageProps) {
  return (
    <div
      className="w-full min-h-screen flex flex-col"
      style={{ background: '#0b1326', color: '#dae2fd' }}
    >

      {/* ══ HERO ═══════════════════════════════════════════════════════════════ */}
      <section className="relative flex items-center overflow-hidden min-h-[640px] lg:min-h-[760px] px-6 sm:px-12 lg:px-20 py-24">

        {/* Athlete background */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={imgAthlete}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-20"
            style={{ objectPosition: 'right center' }}
          />
          {/* gradient overlay — left side opaque, right transparent */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, #0b1326 0%, rgba(11,19,38,0.85) 50%, rgba(11,19,38,0) 100%)',
            }}
          />
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col gap-6 max-w-2xl">

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-xl self-start"
            style={{ background: '#2d3449' }}
          >
            <IconBolt />
            <span
              className="text-[10px] tracking-[2px] uppercase"
              style={{ color: '#ffb692' }}
            >
              High Velocity Analytics
            </span>
          </div>

          {/* Heading */}
          <h1
            className="font-black uppercase leading-none"
            style={{
              fontSize: 'clamp(48px, 8vw, 96px)',
              letterSpacing: '-0.05em',
            }}
          >
            <span style={{ color: '#dae2fd' }}>Precision </span>
            <span style={{ color: '#ffb692' }}>is the</span>
            <br />
            <span style={{ color: '#ffb692' }}>new</span>
            <br />
            <span style={{ color: '#dae2fd' }}>Fast.</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-[18px] leading-[1.65] max-w-lg"
            style={{ color: '#e2bfb0' }}
          >
            Stop guessing your race day potential. GPX Trail Predictor
            transforms raw GPS data into surgical strike strategies for
            trail runners and ultra-marathoners.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 pt-2">
            <button
              onClick={() => onNavigate('profil')}
              className="flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(136deg, #ffb692 0%, #ff6d00 100%)',
                color: '#341100',
                letterSpacing: '0.05em',
              }}
            >
              <IconStrava />
              Connect with Strava
            </button>
            <button
              onClick={() => onNavigate('planificateur')}
              className="flex items-center justify-center px-8 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: '#2d3449',
                border: '1px solid rgba(89,65,54,0.2)',
                color: '#dae2fd',
                letterSpacing: '0.05em',
              }}
            >
              Explore Platform
            </button>
          </div>
        </div>

        {/* Floating metric card */}
        <div
          className="absolute bottom-12 right-8 sm:right-16 lg:right-20 hidden sm:flex flex-col gap-3 rounded-lg p-8"
          style={{
            background: '#222a3d',
            borderLeft: '4px solid #ffb692',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}
        >
          <span
            className="text-[10px] tracking-[1px] uppercase"
            style={{ color: '#e2bfb0' }}
          >
            Target Threshold
          </span>
          <div className="flex items-baseline gap-2">
            <span
              className="font-black leading-none"
              style={{ fontSize: 60, letterSpacing: '-3px', color: '#dae2fd' }}
            >
              03:42
            </span>
            <span className="text-[14px]" style={{ color: '#ffb692' }}>MIN/KM</span>
          </div>
          {/* Progress bar */}
          <div className="h-1 rounded-full" style={{ background: '#2d3449', width: 240 }}>
            <div
              className="h-full rounded-full"
              style={{
                width: '85%',
                background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
                boxShadow: '0 0 10px #ff6d00',
              }}
            />
          </div>
        </div>
      </section>

      {/* ══ FEATURE BENTO GRID ═════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-12 lg:px-20 py-20 flex flex-col gap-16">

        {/* Section header */}
        <div className="flex flex-col gap-3">
          <h2
            className="font-bold text-[36px] uppercase tracking-wide"
            style={{ color: '#dae2fd' }}
          >
            Engineered for Data
          </h2>
          <div
            className="h-1 w-24 rounded-full"
            style={{ background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)' }}
          />
        </div>

        {/* Bento grid — 12 cols */}
        <div className="grid grid-cols-12 gap-6"
          style={{ gridTemplateRows: 'auto auto' }}>

          {/* Feature 1 — GPX Core Analysis — col 1-8, row 1 */}
          <div
            className="col-span-12 lg:col-span-8 flex flex-col justify-between p-10 rounded-lg overflow-hidden"
            style={{ background: '#131b2e', minHeight: 360 }}
          >
            <div className="flex flex-col gap-6 z-10 relative">
              <div className="flex items-center gap-4">
                <IconMap />
                <h3
                  className="font-black text-[28px] uppercase"
                  style={{ color: '#dae2fd' }}
                >
                  GPX Core Analysis
                </h3>
              </div>
              <p
                className="text-[17px] leading-[1.65] max-w-md"
                style={{ color: '#e2bfb0' }}
              >
                Deep-dive into every elevation change. Our engine
                breaks down terrain resistance and adjusts your
                target heart rate in real-time.
              </p>
            </div>

            {/* Terrain map */}
            <div className="mt-8 h-32 rounded overflow-hidden opacity-60">
              <img
                src={imgTerrain}
                alt="Terrain analysis"
                className="w-full h-full object-cover"
                style={{ objectPosition: 'center 30%' }}
              />
            </div>
          </div>

          {/* Feature 2 — Seamless Ecosystem — col 9-12, row 1 */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col items-center justify-center text-center p-10 rounded-lg"
            style={{ background: '#ff6d00' }}
          >
            <div className="mb-6">
              <IconSync />
            </div>
            <h3
              className="font-black text-[22px] uppercase leading-tight mb-4"
              style={{ color: '#582100' }}
            >
              Seamless<br />Ecosystem
            </h3>
            <p
              className="text-[15px] leading-[1.65] opacity-90"
              style={{ color: '#582100' }}
            >
              Instant 2-way synchronization with
              Strava, Garmin Connect, and COROS.
            </p>
            <div className="flex gap-2 mt-8">
              {[
                /* Strava */
                <div key="s" className="w-12 h-12 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(88,33,0,0.2)' }}>
                  🏃
                </div>,
                /* Garmin */
                <div key="g" className="w-12 h-12 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(88,33,0,0.2)' }}>
                  ⌚
                </div>,
              ]}
            </div>
          </div>

          {/* Feature 3 — Race Strategy — col 1-4, row 2 */}
          <div
            className="col-span-12 lg:col-span-4 flex flex-col justify-between p-10 rounded-lg"
            style={{
              background: '#222a3d',
              borderTop: '1px solid rgba(89,65,54,0.1)',
              minHeight: 200,
            }}
          >
            <div className="mb-6">
              <IconStrategy />
            </div>
            <div>
              <h3
                className="font-black text-[22px] uppercase mb-3"
                style={{ color: '#dae2fd' }}
              >
                Race Strategy
              </h3>
              <p className="text-[13px] leading-[1.65]" style={{ color: '#e2bfb0' }}>
                Personalized split targets based on
                current fatigue levels and glycogen stores.
              </p>
            </div>
          </div>

          {/* Feature 4 — Statistics — col 5-12, row 2 */}
          <div
            className="col-span-12 lg:col-span-8 grid grid-cols-3 gap-0 rounded-lg overflow-hidden"
            style={{
              background: '#171f33',
              borderTop: '1px solid rgba(89,65,54,0.1)',
            }}
          >
            {[
              { value: '99.2%', label: 'Accuracy',  color: '#ffb692' },
              { value: '14k',   label: 'Athletes',   color: '#dae2fd' },
              { value: '0.2s',  label: 'Latency',    color: '#99cbff' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center py-10"
                style={{
                  borderLeft: i > 0 ? '1px solid rgba(89,65,54,0.2)' : undefined,
                  borderRight: i < 2 ? '1px solid rgba(89,65,54,0.2)' : undefined,
                }}
              >
                <span
                  className="font-black leading-none mb-2"
                  style={{ fontSize: 44, color: stat.color }}
                >
                  {stat.value}
                </span>
                <span
                  className="text-[10px] tracking-[1px] uppercase"
                  style={{ color: '#e2bfb0' }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA CANVAS ═════════════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-12 lg:px-20 pb-16">
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-5 rounded-xl"
          style={{
            background: '#060e20',
            border: '1px solid rgba(89,65,54,0.1)',
          }}
        >
          {/* Left: avatars + text */}
          <div className="flex items-center gap-6">
            {/* Stacked avatars */}
            <div className="flex -space-x-3">
              {[imgUser1, imgUser2, imgUser3].map((src, i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-xl overflow-hidden"
                  style={{ border: '3px solid #060e20', zIndex: 3 - i }}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <p className="text-[14px]" style={{ color: '#e2bfb0' }}>
              Join{' '}
              <strong style={{ color: '#dae2fd' }}>2,500+</strong>
              {' '}pros upgrading their pace this week.
            </p>
          </div>

          {/* CTA button */}
          <button
            onClick={() => onNavigate('planificateur')}
            className="px-10 py-4 rounded-xl font-semibold text-[13px] uppercase tracking-widest transition-all hover:brightness-110 whitespace-nowrap"
            style={{
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
              color: '#341100',
              boxShadow: '0 8px 24px rgba(255,109,0,0.25)',
            }}
          >
            Start Precision Training
          </button>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════════════════════ */}
      <footer
        className="mt-auto px-6 sm:px-12 lg:px-20 pt-16 pb-8 flex flex-col gap-12"
        style={{ borderTop: '1px solid rgba(89,65,54,0.1)' }}
      >
        <div className="flex flex-col sm:flex-row justify-between gap-12">

          {/* Brand */}
          <div className="flex flex-col gap-4 max-w-xs">
            <span
              className="font-black text-[20px] tracking-[-0.05em]"
              style={{ color: '#ffb692' }}
            >
              GPX Trail Predictor
            </span>
            <p className="text-[13px] leading-[1.65]" style={{ color: '#e2bfb0' }}>
              The ultimate tactical layer for serious runners.
              Built by data scientists, tested by ultra-marathoners.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-3 gap-12">
            {[
              {
                heading: 'Product',
                links: ['Live Pace', 'Heatmaps', 'Strategy Engine'],
              },
              {
                heading: 'Sync',
                links: ['Garmin Connect', 'Strava API', 'Apple Health'],
              },
              {
                heading: 'Support',
                links: ['Lab Notes', 'Performance FAQ'],
              },
            ].map((col) => (
              <div key={col.heading} className="flex flex-col gap-5">
                <span
                  className="text-[11px] font-semibold tracking-[1.2px] uppercase"
                  style={{ color: '#dae2fd' }}
                >
                  {col.heading}
                </span>
                <ul className="flex flex-col gap-3">
                  {col.links.map((link) => (
                    <li
                      key={link}
                      className="text-[13px] cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ color: '#e2bfb0' }}
                    >
                      {link}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6"
          style={{ borderTop: '1px solid rgba(89,65,54,0.05)' }}
        >
          <span
            className="text-[10px] tracking-[2px] uppercase"
            style={{ color: '#e2bfb0' }}
          >
            © 2024 GPX Trail Predictor. All rights reserved.
          </span>
          <div className="flex gap-8">
            {['Privacy Protocol', 'Data Sovereignty'].map((lbl) => (
              <span
                key={lbl}
                className="text-[10px] tracking-[2px] uppercase cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: '#e2bfb0' }}
              >
                {lbl}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}