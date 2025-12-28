import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { translations, Language } from '../translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initialLang = useMemo<Language>(() => {
    const saved = (localStorage.getItem('rabbit_lang') || '').trim() as Language;
    if (saved && translations[saved]) return saved;

    // 默认使用英语
    return 'en';
  }, []);

  const [language, _setLanguage] = useState<Language>(initialLang);

  const setLanguage = (lang: Language) => {
    _setLanguage(lang);
    try {
      localStorage.setItem('rabbit_lang', lang);
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  };

  const t = (path: string) => {
    const keys = path.split('.');
    let value: any = translations[language];
    for (const key of keys) {
      if (value[key] === undefined) return path;
      value = value[key];
    }
    return value as string;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

