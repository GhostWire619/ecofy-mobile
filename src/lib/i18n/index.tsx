import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Locale } from '@/lib/domain/types';
import { sessionRepository } from '@/lib/db/repositories';
import { secureStoreKeys } from '@/lib/constants/env';
import en from '@/lib/i18n/translations/en.json';
import sw from '@/lib/i18n/translations/sw.json';

const translations = { en, sw } as const;

type TranslationTree = typeof en;

type I18nContextValue = {
  locale: Locale;
  isReady: boolean;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/** Resolve a dotted key to its string in one tree, or undefined if absent. */
function lookup(tree: TranslationTree, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, tree);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function formatTemplate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

function getSystemLocale(): Locale {
  const locale = getLocales()[0]?.languageCode;
  return locale === 'sw' ? 'sw' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(secureStoreKeys.localeOverride);
        setLocaleState((stored as Locale | null) ?? getSystemLocale());
      } catch {
        setLocaleState(getSystemLocale());
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  async function setLocale(next: Locale) {
    setLocaleState(next);
    await SecureStore.setItemAsync(secureStoreKeys.localeOverride, next);

    const session = await sessionRepository.getSession();
    if (session) {
      await sessionRepository.upsertSession({
        user_id: session.user_id,
        locale: next,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      isReady,
      setLocale,
      t: (key, params) => {
        // Active locale → English fallback → the key itself. This is what lets us
        // scale languages safely: a key not yet translated in the active locale
        // (or in a newly-added language) shows readable English instead of a raw
        // dotted key, so partial translations never break the UI.
        const raw = lookup(translations[locale], key) ?? lookup(translations.en, key) ?? key;
        return formatTemplate(raw, params);
      },
    }),
    [isReady, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }

  return context;
}
