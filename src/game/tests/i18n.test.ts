import { describe, it, expect, beforeEach } from 'vitest';

import { i18n, t, tf, LANGUAGES } from '../core/I18n';
import { EN } from '../data/locales/en';
import { RU } from '../data/locales/ru';
import { hasPixelGlyph } from '../../engine/PixelFont';
import { CLASSES, POWERUPS, WEAPONS } from '../data/GameData';
import { STAGES } from '../data/StageData';
import {
    weaponName, weaponDesc, weaponEvoName, weaponEvoDesc,
    classLabel, classBonus, powerupName, powerupDesc, stageName, stageDesc,
} from '../core/Labels';

describe('I18n', () => {
    beforeEach(() => i18n.setLang('en'));

    it('returns the English table by default', () => {
        expect(t('pause.title')).toBe('PAUSED');
    });

    it('switches tables', () => {
        i18n.setLang('ru');
        expect(t('pause.title')).toBe('ПАУЗА');
    });

    it('falls back ru → en → key', () => {
        i18n.setLang('ru');
        expect(t('nonexistent.key')).toBe('nonexistent.key');
        // A key present only in en.ts still resolves rather than showing raw
        const enOnly = Object.keys(EN).find(k => !(k in RU));
        if (enOnly) expect(t(enOnly)).toBe(EN[enOnly]);
    });

    it('interpolates named params', () => {
        expect(t('levelup.level', { from: 2, to: 3 })).toBe('lv 2 → 3');
    });

    it('leaves unknown placeholders untouched', () => {
        expect(t('levelup.level', { from: 2 })).toBe('lv 2 → {to}');
    });

    it('tf uses the supplied English as the fallback', () => {
        i18n.setLang('en');
        expect(tf('weapon.void_ray.name', 'Void Ray')).toBe('Void Ray');
        i18n.setLang('ru');
        expect(tf('weapon.void_ray.name', 'Void Bolt')).toBe('Болт Пустоты');
        expect(tf('weapon.made_up.name', 'Fallback')).toBe('Fallback');
    });

    it('every language in the picker has a table', () => {
        for (const lang of LANGUAGES) {
            i18n.setLang(lang.id);
            expect(i18n.lang).toBe(lang.id);
        }
    });
});

describe('Russian coverage', () => {
    beforeEach(() => i18n.setLang('ru'));

    it('translates every UI key that English defines', () => {
        const missing = Object.keys(EN).filter(key => !(key in RU));
        expect(missing).toEqual([]);
    });

    it('translates every weapon, base and evolved', () => {
        for (const weapon of WEAPONS) {
            expect(weaponName(weapon), weapon.id).not.toBe(weapon.name);
            expect(weaponDesc(weapon), weapon.id).not.toBe(weapon.description);
            expect(weaponEvoName(weapon), weapon.id).not.toBe(weapon.evolution.name);
            expect(weaponEvoDesc(weapon), weapon.id).not.toBe(weapon.evolution.description);
        }
    });

    it('translates every class, powerup and stage', () => {
        for (const cls of CLASSES) {
            expect(classLabel(cls), cls.id).not.toBe(cls.name);
            expect(classBonus(cls), cls.id).not.toBe(cls.bonus);
        }
        for (const powerup of POWERUPS) {
            expect(powerupName(powerup), powerup.id).not.toBe(powerup.name);
            expect(powerupDesc(powerup), powerup.id).not.toBe(powerup.description);
        }
        for (const stage of STAGES) {
            expect(stageName(stage), stage.id).not.toBe(stage.name);
            expect(stageDesc(stage), stage.id).not.toBe(stage.description);
        }
    });
});

describe('pixel font coverage', () => {
    /** Strings drawn on the canvas, where a missing glyph renders as a hole */
    const CANVAS_KEYS = ['menu.tagline', 'arena.meteors', 'arena.blackout', 'arena.rifts'];

    it('has a glyph for every character of every canvas string', () => {
        for (const lang of LANGUAGES) {
            i18n.setLang(lang.id);
            for (const key of CANVAS_KEYS) {
                for (const char of t(key)) {
                    expect(hasPixelGlyph(char), `${lang.id} ${key}: "${char}"`).toBe(true);
                }
            }
        }
        i18n.setLang('en');
    });

    it('covers the whole Cyrillic uppercase alphabet', () => {
        for (const char of 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ') {
            expect(hasPixelGlyph(char), char).toBe(true);
        }
    });
});
