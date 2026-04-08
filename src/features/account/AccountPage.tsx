/**
 * Page Compte — login/signup si anonyme, profil utilisateur si connecte
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import { useAppStore } from '@/stores/appStore'
import {
  upsertUserProfile,
  getUserProfile,
} from '@/services/supabase.service'

// ── Login / Signup form (pour utilisateurs anonymes) ─────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AuthForm() {
  const { t } = useTranslation()
  const { signIn, signUp, signInWithGoogle } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signUpSuccess, setSignUpSuccess] = useState(false)

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    const result = await signInWithGoogle()
    setLoading(false)
    if (result.error) setError(result.error)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password)

    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else if (isSignUp) {
      setSignUpSuccess(true)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-8 pb-8">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-[28px] font-black text-white leading-none tracking-tight">
          {t('account.title')}
        </h1>
        <p className="text-[13px] text-[rgba(218,226,253,0.4)] text-center max-w-sm">
          {t('account.subtitle')}
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {signUpSuccess ? (
          <div className="text-center flex flex-col gap-3">
            <p className="text-[14px] text-[#22c55e] font-semibold">
              {t('account.accountCreated')}
            </p>
            <p className="text-[12px] text-[rgba(218,226,253,0.5)]">
              {t('account.checkEmail')}
            </p>
            <button
              onClick={() => { setIsSignUp(false); setSignUpSuccess(false) }}
              className="text-[13px] text-[#ffb692] hover:underline mt-2"
            >
              {t('nav.signIn')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-[12px] text-center tracking-wide uppercase" style={{ color: 'rgba(218,226,253,0.5)' }}>
              {isSignUp ? t('account.createAccount') : t('nav.signIn')}
            </p>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
            />

            <input
              type="password"
              placeholder={t('common.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
            />

            {error && (
              <p className="text-[12px] text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-[14px] tracking-wide
                         transition-all hover:brightness-110 hover:shadow-lg hover:shadow-orange-900/30
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
                color: '#341100',
              }}
            >
              {loading ? t('common.loading') : isSignUp ? t('account.createMyAccount') : t('nav.signIn')}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[11px] text-[rgba(218,226,253,0.3)]">{t('common.or')}</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-[13px] tracking-wide flex items-center justify-center gap-2.5
                         bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GoogleIcon />
              {t('account.signInWithGoogle')}
            </button>

            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
              className="text-[12px] text-[rgba(218,226,253,0.5)] hover:text-[#ffb692] transition-colors text-center"
            >
              {isSignUp ? t('account.alreadyHaveAccount') : t('account.noAccount')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Page Compte (connecte) ───────────────────────────────────────────────────

export function AccountPage() {
  const { user, signOut } = useAuthStore()

  if (!user) return <AuthForm />

  return <AccountContent user={user} signOut={signOut} />
}

function AccountContent({
  user,
  signOut,
}: {
  user: { id: string; email?: string }
  signOut: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { profile, updateProfile } = useAppStore()

  const [weight, setWeight] = useState(profile.energyModel.weightKg.toString())
  const [age, setAge] = useState(profile.age?.toString() ?? '')
  const [restingHR, setRestingHR] = useState(profile.heartRateModel.restingHR.toString())
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Charger le profil depuis Supabase au montage
  useEffect(() => {
    getUserProfile(user.id).then((dbProfile) => {
      if (!dbProfile) return
      if (dbProfile.weight_kg != null) {
        setWeight(dbProfile.weight_kg.toString())
        updateProfile({
          energyModel: { ...profile.energyModel, weightKg: dbProfile.weight_kg },
        })
      }
      if (dbProfile.age != null) {
        setAge(dbProfile.age.toString())
        updateProfile({ age: dbProfile.age })
      }
      if (dbProfile.resting_hr != null) {
        setRestingHR(dbProfile.resting_hr.toString())
        updateProfile({
          heartRateModel: { ...profile.heartRateModel, restingHR: dbProfile.resting_hr },
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function handleSavePersonalInfo() {
    const w = parseFloat(weight)
    const a = parseInt(age, 10)
    const r = parseInt(restingHR, 10)
    const weightKg = isNaN(w) ? profile.energyModel.weightKg : w
    const ageVal = isNaN(a) ? undefined : a
    const restingHRVal = isNaN(r) ? undefined : r

    updateProfile({
      energyModel: { ...profile.energyModel, weightKg },
      age: ageVal,
      ...(restingHRVal != null && {
        heartRateModel: { ...profile.heartRateModel, restingHR: restingHRVal },
      }),
    })

    setSaving(true)
    try {
      await upsertUserProfile(user.id, {
        email: user.email ?? null,
        weight_kg: weightKg,
        age: ageVal ?? null,
        resting_hr: restingHRVal ?? null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Erreur sauvegarde profil:', err)
    } finally {
      setSaving(false)
    }
  }

  const userEmail = user.email ?? ''
  const userInitial = (userEmail[0] ?? '?').toUpperCase()
  const avatarUrl = (user as { user_metadata?: { avatar_url?: string } }).user_metadata?.avatar_url

  return (
    <div className="w-full flex flex-col gap-6 pb-8">

      {/* ── Header ── */}
      <div className="flex items-center gap-5">
        <div
          className="w-[72px] h-[72px] rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-3xl font-bold"
          style={{ background: '#111827', border: '2px solid rgba(255,109,0,0.3)', color: '#ffb692' }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            userInitial
          )}
        </div>
        <div>
          <h1 className="text-[28px] font-black text-white leading-none tracking-tight mb-1">
            {t('account.title')}
          </h1>
          <p className="text-[13px] text-[rgba(218,226,253,0.4)]">
            {userEmail}
          </p>
        </div>
      </div>

      {/* ── Informations personnelles ── */}
      <section
        className="rounded-2xl p-6"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="w-2 h-2 rounded-full bg-[#ff6d00]" />
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
            {t('account.personalInfo')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">
              {t('account.weight')}
            </label>
            <input
              type="number"
              min={30}
              max={200}
              step={0.5}
              value={weight}
              onChange={e => { setWeight(e.target.value); setSaved(false) }}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
              placeholder="70"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">
              {t('account.age')}
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={age}
              onChange={e => { setAge(e.target.value); setSaved(false) }}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
              placeholder="30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-medium tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">
              {t('account.restingHR')}
            </label>
            <input
              type="number"
              min={30}
              max={100}
              value={restingHR}
              onChange={e => { setRestingHR(e.target.value); setSaved(false) }}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                         focus:outline-none focus:border-[#ff6d00] focus:ring-1 focus:ring-[#ff6d00]/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
              placeholder="50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSavePersonalInfo}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-[12px] font-semibold tracking-wide
                       transition-all hover:brightness-110 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #ffb692 0%, #ff6d00 100%)',
              color: '#341100',
            }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          {saved && (
            <span className="text-[11px] text-[#22c55e] font-medium">
              {t('common.saved')}
            </span>
          )}
        </div>
      </section>

      {/* ── Deconnexion ── */}
      <section
        className="rounded-2xl p-6 flex items-center justify-between"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div>
          <p className="text-[13px] font-semibold text-white mb-0.5">{t('account.signOutSection')}</p>
          <p className="text-[11px] text-[rgba(218,226,253,0.35)]">
            {t('account.localDataKept')}
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="px-5 py-2 rounded-xl text-[12px] font-semibold
                     bg-red-500/10 border border-red-500/20 text-red-400
                     hover:bg-red-500/20 transition-colors"
        >
          {t('account.signOutBtn')}
        </button>
      </section>
    </div>
  )
}
