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
});
