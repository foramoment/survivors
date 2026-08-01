import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../core/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import { contactDamagePerSecond, crowdWeight, ARMOR_FLOOR, CROWD_CAP } from '../core/ContactDamage';
import { Player } from '../entities/Player';
import { ENEMIES, ENEMY_CONFIG } from '../data/GameData';
import { DifficultyDirector } from '../core/DifficultyDirector';

describe('contactDamagePerSecond', () => {
    it('is zero with nobody touching', () => {
        expect(contactDamagePerSecond([], 0)).toBe(0);
    });

    it('a lone enemy deals its own damage', () => {
        expect(contactDamagePerSecond([10], 0)).toBeCloseTo(10);
    });

    it('crowds stack — this is the whole point of the rework', () => {
        const one = contactDamagePerSecond([10], 0);
        const five = contactDamagePerSecond([10, 10, 10, 10, 10], 0);
        expect(five).toBeGreaterThan(one * 2);
    });

    it('stacking has diminishing returns', () => {
        const two = contactDamagePerSecond([10, 10], 0);
        expect(two).toBeLessThan(20);
        expect(two).toBeCloseTo(10 + 10 * crowdWeight(1));
    });

    it('caps a huge pile relative to the strongest attacker', () => {
        const pile = contactDamagePerSecond(Array(40).fill(10), 0);
        expect(pile).toBeCloseTo(10 * CROWD_CAP);
    });

    it('armor reduces every attacker, so it scales with crowd size', () => {
        const bare = contactDamagePerSecond([10, 10, 10], 0);
        const armored = contactDamagePerSecond([10, 10, 10], 4);
        expect(armored).toBeCloseTo(bare * 0.6);
    });

    it('armor never grants immunity', () => {
        const dps = contactDamagePerSecond([10], 999);
        expect(dps).toBeCloseTo(10 * ARMOR_FLOOR);
        expect(dps).toBeGreaterThan(0);
    });

    it('negative armor (Berserker) hurts more', () => {
        expect(contactDamagePerSecond([10], -2)).toBeCloseTo(12);
    });
});

describe('Player contact damage', () => {
    it('drains continuously and ignores i-frames', () => {
        const player = new Player(0, 0);
        player.hp = 100;

        // A discrete hit grants invulnerability...
        player.takeDamage(10);
        expect(player.invulnerabilityTimer).toBeGreaterThan(0);

        // ...which must NOT protect against enemies standing on you
        const before = player.hp;
        player.takeContactDamage(20, 0.5);
        expect(player.hp).toBeCloseTo(before - 10);
    });

    it('kills the player when HP runs out', () => {
        const player = new Player(0, 0);
        player.hp = 5;
        player.takeContactDamage(20, 1);
        expect(player.hp).toBe(0);
        expect(player.isDead).toBe(true);
    });

    it('a discrete hit still respects i-frames', () => {
        const player = new Player(0, 0);
        player.hp = 100;
        player.takeDamage(10);
        player.takeDamage(10);
        expect(player.hp).toBeCloseTo(90);
    });
});

describe('contact damage balance', () => {
    /** Enemy contact DPS at a given run time, as GameManager builds it */
    function enemyDps(tierIndex: number, gameTime: number, intensity: number): number {
        const director = new DifficultyDirector();
        director.intensity = intensity;
        return ENEMIES[tierIndex].damage * director.getDamageMultiplier(gameTime);
    }

    it('the enemy damage curve stays inside a survivable band', () => {
        // The old ×1.5 curve put the last tier past 280 DPS before any
        // multipliers — one touch would have been instant death.
        const last = ENEMIES[ENEMIES.length - 1].damage;
        expect(ENEMY_CONFIG.damageMultiplier).toBeLessThan(1.3);
        expect(last).toBeLessThan(50);
    });

    it('a single early enemy is a scratch, not a threat', () => {
        const dps = enemyDps(0, 30, 1);
        // A fresh 90-100 HP player survives well over ten seconds of contact
        expect(90 / dps).toBeGreaterThan(10);
    });

    it('standing in a late-game crowd kills in seconds', () => {
        const dps = enemyDps(6, 600, 2);
        const crowd = contactDamagePerSecond(Array(8).fill(dps), 0);
        const hp = 300; // a player who has taken a few Barrier Field stacks
        expect(hp / crowd).toBeLessThan(4);
        expect(hp / crowd).toBeGreaterThan(1); // still time to walk out
    });

    it('armor is worth taking against a crowd', () => {
        const dps = enemyDps(3, 240, 1.5);
        const bare = contactDamagePerSecond(Array(5).fill(dps), 0);
        const armored = contactDamagePerSecond(Array(5).fill(dps), 8);
        expect(1 - armored / bare).toBeGreaterThan(0.2);
    });
});
