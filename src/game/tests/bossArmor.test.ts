import { describe, it, expect, vi } from 'vitest';

vi.mock('../../engine/Input', () => ({
    input: { getAxis: () => ({ x: 0, y: 0 }), isMouseDown: false, mousePos: { x: 0, y: 0 } },
}));

import {
    armorMultiplierFor, armorProgress,
    BOSS_ARMOR_ABSORB, BOSS_PLATE_KILLS, BOSS_PLATE_TIMEOUT, BOSS_VULNERABLE_TIME,
} from '../core/BossArmor';
import { damageSystem } from '../core/DamageSystem';
import { Enemy } from '../entities/Enemy';

const TYPE = { name: 'Doom Harbinger', hp: 1000, speed: 100, damage: 5, xpValue: 1, emoji: '☠️' };

/** A stage's final boss — the only enemy that wears armour */
function makeBoss(): Enemy {
    const enemy = new Enemy(0, 0, { ...TYPE });
    enemy.makeBoss();
    enemy.armored = true;
    return enemy;
}

describe('boss armour', () => {
    it('leaves everything that is not a boss alone', () => {
        const trash = new Enemy(0, 0, { ...TYPE });
        expect(armorMultiplierFor(trash)).toBe(1);
    });

    it('a wave miniboss is not armoured', () => {
        // Armour multiplies a fight's length by about seven. One miniboss
        // spawns every sixty seconds, so arming them would have filled the
        // arena with landmarks that never die.
        const mini = new Enemy(0, 0, { ...TYPE });
        mini.makeBoss();
        expect(mini.isBoss).toBe(true);
        expect(armorMultiplierFor(mini)).toBe(1);
    });

    it('absorbs while it is up and lets everything through once exposed', () => {
        const boss = makeBoss();
        expect(armorMultiplierFor(boss)).toBe(BOSS_ARMOR_ABSORB);

        boss.vulnerableFor = BOSS_VULNERABLE_TIME;
        expect(armorMultiplierFor(boss)).toBe(1);
    });

    it('catches every source of damage, including the ones that skip modifiers', () => {
        // It divides inside DamageSystem.applyDamage next to corrosion, which is
        // the only place every weapon, perk, hazard and damage-over-time tick
        // passes through. A boss armoured against weapons but not against a
        // perk's burn would just move the problem.
        const boss = makeBoss();
        const before = boss.hp;
        damageSystem.dealDamage({
            baseDamage: 1000, source: null, target: boss, position: boss.pos, skipModifiers: true,
        });
        expect(before - boss.hp).toBeCloseTo(1000 * BOSS_ARMOR_ABSORB);
    });

    it('the window is worth several times the armoured phase', () => {
        // If it were not, breaking the armour would be a formality rather than
        // the point of the fight.
        const boss = makeBoss();
        const armoured = armorMultiplierFor(boss);
        boss.vulnerableFor = BOSS_VULNERABLE_TIME;
        expect(armorMultiplierFor(boss) / armoured).toBeGreaterThan(4);
    });

    it('a boss is sized for single-target damage, not for a crowd', () => {
        // The measurement that forced this: a build dealing a million a second
        // across the arena was landing 4,000 of it on the boss, and the boss
        // carried 36x a late enemy's health. That is a ten-minute fight, and
        // the player felt it as "not enough damage" when they had plenty.
        const plain = new Enemy(0, 0, { ...TYPE });
        const boss = makeBoss();
        expect(boss.maxHp / plain.maxHp).toBeLessThanOrEqual(6);
    });

    it('erodes on kills OR on the clock, whichever is further along', () => {
        // The shell has to keep visibly opening even for a player who never
        // fights next to the boss, or the fallback is invisible and the fight
        // reads as stuck.
        expect(armorProgress(0, 0)).toBe(0);
        expect(armorProgress(BOSS_PLATE_KILLS, 0)).toBe(1);
        expect(armorProgress(0, BOSS_PLATE_TIMEOUT)).toBe(1);
        expect(armorProgress(BOSS_PLATE_KILLS / 2, 0)).toBeCloseTo(0.5);
        // Never past full, however long both have run
        expect(armorProgress(BOSS_PLATE_KILLS * 3, BOSS_PLATE_TIMEOUT * 3)).toBe(1);
    });

    it('rewards fighting beside the boss without ever requiring it', () => {
        // Kill-fed windows have to be worth several times the fallback, and the
        // fallback has to exist: a mechanic that can be refused must still
        // terminate. Four kills a second is what the measured build cleared
        // near itself.
        const killFedSeconds = BOSS_PLATE_KILLS / 4;
        expect(killFedSeconds).toBeLessThan(BOSS_PLATE_TIMEOUT / 3);
        expect(BOSS_PLATE_TIMEOUT).toBeLessThan(30);
    });
});
