/**
 * I18N — runtime language switch (English / Russian).
 *
 * Two lookup styles, on purpose:
 *
 *   t('pause.resume')                  — UI chrome. English lives in
 *                                        data/locales/en.ts.
 *   tf('weapon.void_ray.name', w.name) — game data. English stays where it
 *                                        already is (GameData/StageData) and
 *                                        is passed in as the fallback, so the
 *                                        content is never duplicated and never
 *                                        drifts out of sync.
 *
 * Missing keys fall back (ru → en → the key itself) instead of throwing: a
 * half-translated build must still be playable.
 */

import { EN } from '../data/locales/en';
import { RU } from '../data/locales/ru';

export type Lang = 'en' | 'ru';

export const LANGUAGES: { id: Lang; label: string }[] = [
    { id: 'en', label: 'ENGLISH' },
    { id: 'ru', label: 'РУССКИЙ' },
];

const STORAGE_KEY = 'survivors.lang';

const TABLES: Record<Lang, Record<string, string>> = { en: EN, ru: RU };

/** Replace {name} placeholders */
function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) =>
        key in params ? String(params[key]) : match
    );
}

class I18nClass {
    private _lang: Lang = 'en';
    private listeners = new Set<() => void>();

    constructor() {
        this._lang = this.detect();
        this.applyDocumentLang();
    }

    /** Stored choice wins; otherwise follow the browser (ru-RU friends get RU) */
    private detect(): Lang {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'en' || stored === 'ru') return stored;
        } catch {
            // Private mode / Capacitor WebView without storage — fall through
        }
        const nav = typeof navigator !== 'undefined' ? navigator.language : '';
        return nav && nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
    }

    private applyDocumentLang(): void {
        if (typeof document !== 'undefined') {
            document.documentElement.lang = this._lang;
        }
    }

    get lang(): Lang {
        return this._lang;
    }

    setLang(lang: Lang): void {
        if (lang === this._lang) return;
        this._lang = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            // Not fatal — the choice just won't survive a reload
        }
        this.applyDocumentLang();
        this.listeners.forEach(fn => fn());
    }

    /** Subscribe to language changes; returns an unsubscribe function */
    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /** UI chrome string. English comes from locales/en.ts. */
    t(key: string, params?: Record<string, string | number>): string {
        const value = TABLES[this._lang][key] ?? EN[key] ?? key;
        return interpolate(value, params);
    }

    /** Game-data string. English is passed in from GameData/StageData. */
    tf(key: string, fallback: string, params?: Record<string, string | number>): string {
        const value = TABLES[this._lang][key] ?? fallback;
        return interpolate(value, params);
    }
}

export const i18n = new I18nClass();

export const t = (key: string, params?: Record<string, string | number>): string =>
    i18n.t(key, params);

export const tf = (
    key: string,
    fallback: string,
    params?: Record<string, string | number>
): string => i18n.tf(key, fallback, params);
