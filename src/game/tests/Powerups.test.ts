/**
 * Тесты для валидации массива POWERUPS
 * 
 * Проверяют:
 * 1. Нет дублей по типу (одна стата = один powerup)
 * 2. Все типы существуют в VALID_PLAYER_STATS
 */
import { describe, it, expect } from 'vitest';
import { POWERUPS, WEAPONS } from '../data/GameData';
import { VALID_PLAYER_STATS } from '../core/PlayerStats';

describe('Icons', () => {
    it('no two things you can own share an icon', () => {
        // The build panel is a row of icons and nothing else, so two entries
        // with the same emoji are indistinguishable there. Plasma Grenade and
        // Chain Reaction were both 💣, Frost Nova and Cooling System both ❄️,
        // Lightning Chain and Static Discharge both ⚡.
        const seen = new Map<string, string>();
        const claim = (emoji: string, owner: string) => {
            expect(seen.get(emoji), `${emoji}: ${seen.get(emoji)} and ${owner}`).toBeUndefined();
            seen.set(emoji, owner);
        };

        for (const weapon of WEAPONS) {
            claim(weapon.emoji, weapon.name);
            claim(weapon.evolution.emoji, weapon.evolution.name);
        }
        for (const powerup of POWERUPS) claim(powerup.emoji, powerup.name);
    });
});

describe('POWERUPS Validation', () => {
    it('should not have duplicate stat types', () => {
        const seenTypes = new Set<string>();
        const duplicates: string[] = [];

        for (const powerup of POWERUPS) {
            if (seenTypes.has(powerup.type)) {
                duplicates.push(`${powerup.name} (type: ${powerup.type})`);
            }
            seenTypes.add(powerup.type);
        }

        expect(duplicates, `Duplicate powerup types found: ${duplicates.join(', ')}`).toHaveLength(0);
    });

    it('should only use valid player stats', () => {
        const invalidPowerups: string[] = [];

        for (const powerup of POWERUPS) {
            if (!VALID_PLAYER_STATS.includes(powerup.type as any)) {
                invalidPowerups.push(`${powerup.name} (type: ${powerup.type})`);
            }
        }

        expect(
            invalidPowerups,
            `Powerups with invalid stat types: ${invalidPowerups.join(', ')}`
        ).toHaveLength(0);
    });

    it('should have required fields for each powerup', () => {
        for (const powerup of POWERUPS) {
            expect(powerup.name, 'Missing name').toBeDefined();
            expect(powerup.description, `${powerup.name}: missing description`).toBeDefined();
            expect(powerup.type, `${powerup.name}: missing type`).toBeDefined();
            expect(powerup.value, `${powerup.name}: missing value`).toBeDefined();
            expect(powerup.emoji, `${powerup.name}: missing emoji`).toBeDefined();
        }
    });

    it('should have unique names', () => {
        const names = POWERUPS.map(p => p.name);
        const uniqueNames = new Set(names);
        expect(names.length).toBe(uniqueNames.size);
    });
});
