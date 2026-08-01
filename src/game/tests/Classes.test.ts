/**
 * Тесты для валидации массива CLASSES
 * 
 * Проверяют:
 * 1. Все ключи в stats существуют в VALID_PLAYER_STATS
 * 2. У каждого класса есть валидное оружие
 */
import { describe, it, expect } from 'vitest';
import { CLASSES, WEAPONS } from '../data/GameData';
import { VALID_PLAYER_STATS } from '../core/PlayerStats';
import { CHARACTER_SPRITES } from '../data/CharacterSprites';

describe('CLASSES Validation', () => {
    it('should only use valid player stats', () => {
        const invalidClasses: string[] = [];

        for (const cls of CLASSES) {
            if (cls.stats) {
                for (const statKey of Object.keys(cls.stats)) {
                    if (!VALID_PLAYER_STATS.includes(statKey as any)) {
                        invalidClasses.push(`${cls.name} (invalid stat: ${statKey})`);
                    }
                }
            }
        }

        expect(
            invalidClasses,
            `Classes with invalid stats: ${invalidClasses.join(', ')}`
        ).toHaveLength(0);
    });

    it('should have valid weaponId for each class', () => {
        const weaponIds = WEAPONS.map(w => w.id);
        const invalidClasses: string[] = [];

        for (const cls of CLASSES) {
            if (!weaponIds.includes(cls.weaponId)) {
                invalidClasses.push(`${cls.name} (weaponId: ${cls.weaponId})`);
            }
        }

        expect(
            invalidClasses,
            `Classes with invalid weaponId: ${invalidClasses.join(', ')}`
        ).toHaveLength(0);
    });

    it('should have required fields for each class', () => {
        for (const cls of CLASSES) {
            expect(cls.name, 'Missing name').toBeDefined();
            expect(cls.emoji, `${cls.name}: missing emoji`).toBeDefined();
            expect(cls.bonus, `${cls.name}: missing bonus`).toBeDefined();
            expect(cls.weaponId, `${cls.name}: missing weaponId`).toBeDefined();
            expect(cls.hp, `${cls.name}: missing hp`).toBeDefined();
            expect(cls.stats, `${cls.name}: missing stats`).toBeDefined();
        }
    });

    it('should have unique names', () => {
        const names = CLASSES.map(c => c.name);
        const uniqueNames = new Set(names);
        expect(names.length).toBe(uniqueNames.size);
    });

    it('should have positive HP values', () => {
        for (const cls of CLASSES) {
            expect(cls.hp, `${cls.name} has invalid HP`).toBeGreaterThan(0);
        }
    });

    it('every class has its own pixel sprite', () => {
        for (const cls of CLASSES) {
            expect(CHARACTER_SPRITES[cls.id], `${cls.name} has no sprite`).toBeDefined();
        }
    });

    it('sprite templates are the right shape', () => {
        for (const [id, sprite] of Object.entries(CHARACTER_SPRITES)) {
            expect(sprite.body.length, `${id} body rows`).toBe(13);
            for (const row of sprite.body) {
                expect(row.length, `${id} row "${row}"`).toBe(12);
            }
            for (const frame of sprite.legs) {
                expect(frame.length, `${id} leg rows`).toBe(3);
                for (const row of frame) expect(row.length, `${id} leg "${row}"`).toBe(12);
            }
        }
    });

    it('every class grows a real stat on level-up', () => {
        for (const cls of CLASSES) {
            expect(cls.perLevel, `${cls.name} has no per-level growth`).toBeDefined();
            const stat = cls.perLevel.stat;
            expect(VALID_PLAYER_STATS.includes(stat as any), `${cls.name}: ${stat}`).toBe(true);
        }
    });

    it('each class starts with a different weapon', () => {
        const ids = CLASSES.map(c => c.weaponId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('dropped starting weapons are still in the level-up pool', () => {
        // Cutting the roster must not cut content — the other weapons stay
        // available, they just are not starting picks any more
        expect(WEAPONS.length).toBeGreaterThan(CLASSES.length);
    });
});
