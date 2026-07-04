import { createContext, useContext, useState, ReactNode } from 'react'
import { en, ar } from '@/i18n'

export type Language = 'en' | 'ar'

interface LanguageContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
  isRtl: boolean
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('en')

  const t = (key: string): string => {
    const dict = lang === 'ar' ? ar : en
    return (dict as any)[key] || key
  }

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        t,
        isRtl: lang === 'ar',
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be inside LanguageProvider')
  return ctx
}
