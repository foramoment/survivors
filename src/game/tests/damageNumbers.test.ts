import { describe, it, expect, vi, beforeEach } from 'vitest';

// Both are pure feedback (sound, hit-stop) and touch Web Audio / the canvas
vi.mock('../../engine/AudioSystem', () => ({ audio: { play: () => { } } }));
vi.mock('../../engine/JuiceSystem', () => ({
    juice: { hitStop: () => { }, addTrauma: () => { } },
}));

import { DamageNumbers } from '../core/DamageNumbers';

/** Reach into the pool the way only a test may */
function entries(dn: DamageNumbers) {
    return (dn as unknown as { items: Array<{ isCrit: boolean; hits: number; amount: number }> }).items;
}

/**
 * One tick of a zone weapon: `n` hits scattered across a disc of `radius`,
 * all landing in the same frame. Deterministic — no Math.random in the spread.
 */
function zoneTick(dn: DamageNumbers, n: number, radius: number, crit: (i: number) => boolean = () => false) {
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 * 3.7; // irrational-ish, so it spirals
        const r = radius * ((i % 5) + 1) / 5;
        dn.spawn({ x: Math.cos(angle) * r, y: Math.sin(angle) * r }, 40, crit(i));
    }
}

describe('DamageNumbers merging', () => {
    let numbers: DamageNumbers;
    beforeEach(() => { numbers = new DamageNumbers(); });

    it('folds a wide zone tick into a handful of numbers, not one per enemy', () => {
        // THE regression. A fixed 38px merge radius against a 300-400px zone
        // meant nothing merged: twenty hits printed twenty numbers, and a
        // screen-filling build buried the arena under its own damage text.
        zoneTick(numbers, 20, 320);

        expect(numbers.count).toBeLessThanOrEqual(8);
        expect(numbers.count).toBeGreaterThan(0);
    });

    it('keeps the total honest however aggressively it merges', () => {
        zoneTick(numbers, 20, 320);
        const total = entries(numbers).reduce((s, e) => s + e.amount, 0);
        const hits = entries(numbers).reduce((s, e) => s + e.hits, 0);

        expect(total).toBeCloseTo(20 * 40);
        expect(hits).toBe(20);
    });

    it('stays precise when the screen is quiet', () => {
        // Two hits far apart with nothing else going on must stay separate —
        // the wide radius is for chaos, and locality is worth something when
        // there is room for it.
        numbers.spawn({ x: 0, y: 0 }, 10);
        numbers.spawn({ x: 150, y: 0 }, 10);
        expect(numbers.count).toBe(2);
    });

    it('bounds the pool no matter how much lands', () => {
        for (let i = 0; i < 500; i++) {
            numbers.spawn({ x: (i % 40) * 90, y: Math.floor(i / 40) * 90 }, 25);
        }
        expect(numbers.count).toBeLessThanOrEqual(30);
    });
});

describe('crit styling follows the damage, not a single lucky hit', () => {
    let numbers: DamageNumbers;
    beforeEach(() => { numbers = new DamageNumbers(); });

    it('one crit inside a big normal sweep does not paint the whole total', () => {
        // The old rule was "any crit anywhere makes the group a crit", which at
        // merge sizes is the same as "always": 20% crit chance over sixteen
        // folded hits fired 97% of the time. Every number came out big and
        // orange and the play-test read it as "far too many crits".
        numbers.spawn({ x: 0, y: 0 }, 40, true);
        for (let i = 0; i < 12; i++) numbers.spawn({ x: 10, y: 10 }, 40, false);

        const merged = entries(numbers).find(e => e.hits > 1)!;
        expect(merged.hits).toBe(13);
        expect(merged.isCrit).toBe(false);
    });

    it('a crit that dominates its total still reads as one', () => {
        // The case worth keeping: a real crit among a few chip hits IS what
        // happened there, and should look like it.
        numbers.spawn({ x: 0, y: 0 }, 400, true);
        numbers.spawn({ x: 10, y: 10 }, 20, false);
        numbers.spawn({ x: 10, y: 10 }, 20, false);

        const merged = entries(numbers).find(e => e.hits > 1)!;
        expect(merged.isCrit).toBe(true);
    });

    it('a plain sweep never turns orange', () => {
        zoneTick(numbers, 20, 320);
        expect(entries(numbers).every(e => !e.isCrit)).toBe(true);
    });
});

describe('damage taken', () => {
    let numbers: DamageNumbers;
    beforeEach(() => { numbers = new DamageNumbers(); });

    it('never folds into damage dealt', () => {
        numbers.spawn({ x: 0, y: 0 }, 50);
        numbers.spawnTaken({ x: 0, y: 0 }, 9);

        expect(numbers.count).toBe(2);
        expect(entries(numbers).every(e => e.hits === 1)).toBe(true);
    });

    it('ignores drips too small to print', () => {
        numbers.spawnTaken({ x: 0, y: 0 }, 0.2);
        expect(numbers.count).toBe(0);
    });
});
