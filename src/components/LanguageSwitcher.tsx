import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'fr', flag: '🇫🇷' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'es', flag: '🇪🇸' },
] as const

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-[32px] h-[32px] rounded-lg
                   text-[14px] hover:bg-white/[0.06] transition-colors"
        title={current.code.toUpperCase()}
      >
        {current.flag}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] rounded-xl overflow-hidden
                     shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ background: '#1a2237', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false) }}
              className={[
                'flex items-center gap-2.5 px-4 py-2 text-[12px] w-full text-left transition-colors',
                i18n.language === lang.code
                  ? 'text-[#ffb692] bg-white/[0.06]'
                  : 'text-[rgba(218,226,253,0.7)] hover:bg-white/[0.04] hover:text-white',
              ].join(' ')}
            >
              <span className="text-[14px]">{lang.flag}</span>
              {lang.code.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
