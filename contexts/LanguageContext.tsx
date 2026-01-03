import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { translations, Language } from '../translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 🟢 增强错误处理：安全地获取初始语言
  const initialLang = useMemo<Language>(() => {
    try {
      // 检查 localStorage 是否可用
      if (typeof localStorage === 'undefined') {
        console.warn('[LanguageContext] localStorage not available, using default language');
        return 'en';
      }

      const saved = (localStorage.getItem('rabbit_lang') || '').trim() as Language;
      
      // 验证保存的语言是否有效
      if (saved && translations && translations[saved]) {
        return saved;
      }

      // 默认使用英语
      return 'en';
    } catch (error) {
      // localStorage 访问失败（如隐私模式、存储配额满等）
      console.warn('[LanguageContext] Failed to read from localStorage:', error);
      return 'en';
    }
  }, []);

  const [language, _setLanguage] = useState<Language>(initialLang);

  // 🟢 增强错误处理：安全地设置语言
  const setLanguage = (lang: Language) => {
    try {
      // 验证语言是否有效
      if (!lang || !translations || !translations[lang]) {
        console.warn(`[LanguageContext] Invalid language: ${lang}, keeping current language`);
        return;
      }

      _setLanguage(lang);
      
      // 尝试保存到 localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('rabbit_lang', lang);
        }
      } catch (storageError) {
        // localStorage 写入失败（如存储配额满、隐私模式等）
        console.warn('[LanguageContext] Failed to save language to localStorage:', storageError);
        // 继续执行，不影响语言切换
      }

      // 设置 HTML lang 属性
      try {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.lang = lang;
        }
      } catch (domError) {
        console.warn('[LanguageContext] Failed to set document language:', domError);
        // 继续执行，不影响语言切换
      }
    } catch (error) {
      console.error('[LanguageContext] Error in setLanguage:', error);
      // 不抛出错误，避免导致应用崩溃
    }
  };

  // 🟢 增强错误处理：安全地翻译文本
  const t = (path: string): string => {
    try {
      if (!path || typeof path !== 'string') {
        return path || '';
      }

      // 验证 translations 对象是否存在
      if (!translations || typeof translations !== 'object') {
        console.warn('[LanguageContext] Translations object is invalid');
        return path;
      }

      // 验证当前语言是否存在
      if (!translations[language]) {
        console.warn(`[LanguageContext] Language "${language}" not found in translations, falling back to "en"`);
        const fallbackLang = translations['en'] ? 'en' : Object.keys(translations)[0];
        if (!fallbackLang) {
          return path;
        }
        const keys = path.split('.');
        let value: any = translations[fallbackLang];
        for (const key of keys) {
          if (value === undefined || value === null) return path;
          value = value[key];
        }
        return (typeof value === 'string' ? value : path);
      }

      const keys = path.split('.');
      let value: any = translations[language];
      
      for (const key of keys) {
        if (value === undefined || value === null) {
          return path;
        }
        value = value[key];
      }
      
      return (typeof value === 'string' ? value : path);
    } catch (error) {
      console.error('[LanguageContext] Error in translation function:', error);
      // 返回原始路径，避免显示错误信息
      return path;
    }
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

