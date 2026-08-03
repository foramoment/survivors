import { describe, it, expect, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../../engine/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import {
    armorMultiplier, contactRamp, contactDamagePerSecond,
    ARMOR_K, CONTACT_RAMP_MAX, CONTACT_RAMP_FULL, CONTACT_RAMP_DECAY,
} from '../core/ContactDamage';
import { REGEN_COMBAT_DELAY } from '../core/Tactics';
import { Player } from '../entities/Player';
import { ENEMIES, POWERUPS, CLASSES } from '../data/GameData';

/**
 * The reference pool. NOT 300 — that was the number the previous version of
 * this file used, described as "a player who has taken a few Barrier Field
 * stacks", and no such player exists. Class bases are 75-150 and Barrier Field
 * is one pick of +20, so a real level-16 run measured 115. Every time-to-death
 * assertion below is 2.6x tighter than it used to be for exactly this reason.
 */
const POOL = 115;

/** The hardest contact damage anything in the game can deal */
const WORST = Math.max(...ENEMIES.map(e => e.damage));

describe('armor is a curve, not a subtraction', () => {
    it('does nothing at zero and never reaches immunity', () => {
        expect(armorMultiplier(0)).toBe(1);
        expect(armorMultiplier(10_000)).toBeGreaterThan(0);
        expect(armorMultiplier(10_000)).toBeLessThan(0.02);
    });

    it('every point is worth the same effective health', () => {
        // The reason for this curve: effective HP = HP x (1 + armor / K), so
        // armour and max HP multiply instead of competing. Flat subtraction had
        // the opposite property — it decayed to nothing as the run went on.
        for (const armor of [2, 8, 16, 50]) {
            expect(1 / armorMultiplier(armor)).toBeCloseTo(1 + armor / ARMOR_K, 6);
        }
    });

    it('negative armor hurts more, and cannot flip the sign', () => {
        expect(armorMultiplier(-4)).toBeGreaterThan(1);
        // Berserker sits at -4; nothing may push the multiplier past the pole
        for (const armor of [-ARMOR_K, -ARMOR_K * 10, -1e9]) {
            expect(armorMultiplier(armor)).toBeGreaterThan(0);
            expect(Number.isFinite(armorMultiplier(armor))).toBe(true);
        }
    });

    it('a maxed Void Shield is worth taking', () => {
        const shield = POWERUPS.find(p => p.id === 'void_shield')!;
        const maxed = shield.value * shield.maxStacks;
        expect(1 - armorMultiplier(maxed)).toBeGreaterThan(0.3);
    });
});

describe('the standing-still ramp', () => {
    it('starts at 1, so running through a crowd is cheap', () => {
        expect(contactRamp(0)).toBe(1);
    });

    it('reaches its ceiling only after sustained contact', () => {
        expect(contactRamp(CONTACT_RAMP_FULL)).toBeCloseTo(CONTACT_RAMP_MAX);
        expect(contactRamp(CONTACT_RAMP_FULL * 10)).toBeCloseTo(CONTACT_RAMP_MAX);
        expect(contactRamp(CONTACT_RAMP_FULL / 2)).toBeLessThan(CONTACT_RAMP_MAX);
        expect(contactRamp(CONTACT_RAMP_FULL / 2)).toBeGreaterThan(1);
    });

    it('builds while touched and sheds when clear', () => {
        const player = new Player(0, 0);

        for (let i = 0; i < 100; i++) player.updateContactRamp(true, 0.05);
        expect(contactRamp(player.contactRampTime)).toBeCloseTo(CONTACT_RAMP_MAX);

        // A full ramp sheds in CONTACT_RAMP_DECAY seconds, whatever built it
        for (let i = 0; i < Math.ceil(CONTACT_RAMP_DECAY / 0.05); i++) {
            player.updateContactRamp(false, 0.05);
        }
        expect(player.contactRampTime).toBe(0);
        expect(contactRamp(player.contactRampTime)).toBe(1);
    });
});

describe('crowd scaling', () => {
    it('stacks linearly with no cap — geometry is the only limit', () => {
        // Both the old CROWD_CAP and the old 1/sqrt(k) falloff existed to tame a
        // number that was 33x too big. With that fixed at the source, capping
        // again would be the bug that made a hundred enemies cost what four did.
        const one = contactDamagePerSecond([10], 0, 1);
        const four = contactDamagePerSecond([10, 10, 10, 10], 0, 1);
        const forty = contactDamagePerSecond(Array(40).fill(10), 0, 1);

        expect(four).toBeCloseTo(one * 4);
        expect(forty).toBeCloseTo(one * 40);
    });

    it('nothing touching costs nothing', () => {
        expect(contactDamagePerSecond([], 0, CONTACT_RAMP_MAX)).toBe(0);
    });
});

describe('balance: the WORST case the game can produce', () => {
    /** HP per second from a ring of `n` of the hardest enemy at a given ramp */
    const ring = (n: number, ramp: number, armor = 0) =>
        contactDamagePerSecond(Array(n).fill(WORST), armor, ramp);

    it('contact damage is nearly flat across the whole roster', () => {
        // The pillar: health is a budget for the run. The old curve was x1.22 a
        // tier and then got multiplied again by time, intensity and stage.
        const weakest = Math.min(...ENEMIES.map(e => e.damage));
        expect(WORST / weakest).toBeLessThan(3);
        expect(WORST).toBeLessThan(4);
    });

    it('grazing one enemy while kiting is almost free', () => {
        expect(POOL / ring(1, 1)).toBeGreaterThan(30);
    });

    it('running through a full crowd costs little', () => {
        // Half a second of contact, ramp barely off the floor
        const cost = ring(6, contactRamp(0.5)) * 0.5;
        expect(cost / POOL).toBeLessThan(0.12);
    });

    it('camping in a full crowd kills, with time to read it and leave', () => {
        const ttd = POOL / ring(6, CONTACT_RAMP_MAX);
        expect(ttd).toBeLessThan(6);
        expect(ttd).toBeGreaterThan(2);
    });

    it('even a physically impossible pile leaves a reaction window', () => {
        // ~9 bodies is the most that geometrically fit; this is the number the
        // old model got catastrophically wrong (0.18s at the equivalent point).
        expect(POOL / ring(9, CONTACT_RAMP_MAX)).toBeGreaterThan(1.5);
    });

    it('armor buys real time in the worst case', () => {
        const bare = POOL / ring(6, CONTACT_RAMP_MAX, 0);
        const armored = POOL / ring(6, CONTACT_RAMP_MAX, 16);
        expect(armored / bare).toBeGreaterThan(1.5);
    });

    it('the squishiest class survives a full ring long enough to walk out', () => {
        const squishiest = Math.min(...CLASSES.map(c => c.hp));
        expect(squishiest / ring(6, CONTACT_RAMP_MAX)).toBeGreaterThan(1.5);
    });
});

describe('Player contact', () => {
    it('ignores i-frames — that bug is what made crowds free', () => {
        const player = new Player(0, 0);
        player.hp = 100;

        // A discrete hit (a meteor) grants invulnerability...
        player.takeDamage(10);
        expect(player.invulnerabilityTimer).toBeGreaterThan(0);

        // ...which must NOT protect against enemies chewing on you
        const before = player.hp;
        player.takeContact(12);
        expect(player.hp).toBeCloseTo(before - 12);
    });

    it('kills the player when HP runs out', () => {
        const player = new Player(0, 0);
        player.hp = 5;
        player.takeContact(20);
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

    it('armor applies to discrete hits through the same curve', () => {
        const player = new Player(0, 0);
        player.hp = 100;
        player.stats.armor = ARMOR_K; // exactly half, by construction
        player.takeDamage(40);
        expect(player.hp).toBeCloseTo(80);
    });
});

describe('Regeneration', () => {
    /** A player with full Nano-Repair, hurt down to a quarter */
    function hurtPlayer() {
        const nano = POWERUPS.find(p => p.id === 'nano_repair')!;
        const player = new Player(0, 0);
        player.maxHp = POOL;
        player.hp = POOL * 0.25;
        player.stats.regen = nano.value * nano.maxStacks;
        return player;
    }

    it('does not run while something is still on you', () => {
        const player = hurtPlayer();
        player.takeContact(5);
        const after = player.hp;

        player.update(REGEN_COMBAT_DELAY * 0.9);
        expect(player.hp).toBe(after);
    });

    it('resumes once you have been left alone', () => {
        const player = hurtPlayer();
        player.takeContact(5);
        player.update(REGEN_COMBAT_DELAY + 0.001);

        const before = player.hp;
        player.update(1);
        expect(player.hp).toBeGreaterThan(before);
    });

    it('carries a quarter to three quarters in about a minute', () => {
        // The agreed feel: regen is a trickle that rewards clearing your space,
        // not a bar that refills between fights. The previous value read as 3x
        // this and measured as a fifth of it, because a 3s lockout against
        // bites every 3.5s is not a gate, it is an off switch.
        const player = hurtPlayer();
        player.update(REGEN_COMBAT_DELAY + 0.001);

        let seconds = 0;
        while (player.hp < POOL * 0.75 && seconds < 300) {
            player.update(0.05);
            seconds += 0.05;
        }

        expect(seconds).toBeGreaterThan(40);
        expect(seconds).toBeLessThan(90);
    });

    it('heals fastest when worst hurt, and not at all when full', () => {
        const hurt = hurtPlayer();
        hurt.update(REGEN_COMBAT_DELAY + 1);
        const whenHurt = hurt.hp - POOL * 0.25;

        const scratched = hurtPlayer();
        scratched.hp = POOL * 0.95;
        scratched.update(REGEN_COMBAT_DELAY + 1);
        const whenScratched = scratched.hp - POOL * 0.95;

        expect(whenHurt).toBeGreaterThan(whenScratched);

        const full = hurtPlayer();
        full.hp = POOL;
        full.update(REGEN_COMBAT_DELAY + 1);
        expect(full.hp).toBe(POOL);
    });

    it('cannot out-heal a crowd standing on you', () => {
        // The guard on the whole model. Even at the ramp floor, the drain from
        // a single worst-case enemy must beat a fully invested regen — anything
        // else brings back "standing still is free".
        const player = hurtPlayer();
        expect(contactDamagePerSecond([WORST], 0, 1))
            .toBeGreaterThan(player.stats.regen * (player.maxHp - player.hp));
    });
});
