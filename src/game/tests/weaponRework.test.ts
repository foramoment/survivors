/**
 * Behaviour locks for the reworked Orbital Strike and Phantom Slash.
 *
 * These cover the things that were actually wrong before: an evolved tier that
 * dumped one enormous nuke, targeting that ignored the enemies next to you,
 * and per-frame emoji rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../engine/ParticleSystem', () => ({
    particles: {
        emitHit: vi.fn(),
        emitExplosion: vi.fn(),
        emitOrbitalStrike: vi.fn(),
        emitOrbitalImpact: vi.fn(),
        emitNuclear: vi.fn(),
        emitLightning: vi.fn(),
    },
}));

vi.mock('../core/DamageSystem', () => ({
    damageSystem: {
        dealDamage: vi.fn(() => ({ finalDamage: 20, isCrit: false, killed: false })),
        dealRawDamage: vi.fn(),
    },
}));

vi.mock('../../engine/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => []),
        getNearby: vi.fn(() => []),
    },
}));

import { OrbitalStrikeWeapon, OrbitalStrikeZone } from '../weapons/implementations/OrbitalStrikeWeapon';
import { PhantomSlashWeapon, SlashArc, DimensionalRiftZone } from '../weapons/implementations/PhantomSlashWeapon';
import { levelSpatialHash } from '../../engine/SpatialHash';
import { damageSystem } from '../core/DamageSystem';
import { particles } from '../../engine/ParticleSystem';

function makeOwner(): any {
    return {
        pos: { x: 0, y: 0 },
        stats: { might: 1, area: 1, cooldown: 1, speed: 1, duration: 1 },
        weapons: [],
    };
}

function makeEnemy(x: number, y: number): any {
    return { pos: { x, y }, radius: 12, isDead: false, takeDamage: vi.fn() };
}

describe('OrbitalStrikeWeapon', () => {
    let weapon: OrbitalStrikeWeapon;
    let spawned: any[];

    /** Shells launch on a stagger, so a salvo needs a few frames to leave */
    function runSalvo(w: any) {
        for (let t = 0; t < 2; t += 0.05) w.update(0.05);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
        weapon = new OrbitalStrikeWeapon(makeOwner());
        spawned = [];
        weapon.onSpawn = (e: any) => spawned.push(e);
    });

    it('drops a single shell per cooldown at base tier', () => {
        weapon.cooldown = 0;
        weapon.update(0.016);
        expect(spawned).toHaveLength(1);
        expect(spawned[0]).toBeInstanceOf(OrbitalStrikeZone);
        expect(spawned[0].heavy).toBe(false);
    });

    it('lands on an enemy when there is one in range', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([makeEnemy(300, 0)] as any);
        weapon.cooldown = 0;
        weapon.update(0.016);
        // Within the lead-the-target jitter of the enemy position
        expect(Math.abs(spawned[0].pos.x - 300)).toBeLessThanOrEqual(20);
    });

    it('launches the salvo over time, not all on one frame', () => {
        weapon.evolved = true;
        weapon.cooldown = 0;
        weapon.update(0.016);

        // Only the first shell is in the sky. Every shell used to spawn on the
        // same frame with staggered fuses, so every reticle in the salvo was on
        // the ground at once — which is why the count was frozen at four.
        // Launching on a stagger is what lets it grow with level.
        expect(spawned.length).toBe(1);

        runSalvo(weapon);
        // Level 1 evolved: 1 base + 3 for evolving, plus the heavy finisher
        expect(spawned.length).toBe(5);
    });

    it('grows the salvo with level, at both tiers', () => {
        const salvoAt = (level: number, evolved: boolean) => {
            const w = new OrbitalStrikeWeapon(makeOwner());
            const out: any[] = [];
            w.onSpawn = (e: any) => out.push(e);
            w.level = level;
            w.evolved = evolved;
            w.cooldown = 0;
            runSalvo(w);
            return out.length;
        };

        // +1 shell every second level, and evolving keeps adding rather than
        // replacing — the trap that had the evolved Plasma Cannon handing back
        // fewer shards than level five
        expect(salvoAt(3, false)).toBe(salvoAt(1, false) + 1);
        expect(salvoAt(5, false)).toBe(salvoAt(3, false) + 1);
        expect(salvoAt(6, true)).toBeGreaterThan(salvoAt(6, false));
        expect(salvoAt(8, true)).toBeGreaterThan(salvoAt(6, true));
    });

    it('gives the barrage exactly one heavy finisher, landing last', () => {
        weapon.evolved = true;
        weapon.cooldown = 0;
        runSalvo(weapon);

        const heavies = spawned.filter((z: any) => z.heavy);
        expect(heavies).toHaveLength(1);
        expect(spawned[spawned.length - 1].heavy).toBe(true);
        expect(heavies[0].radius).toBeGreaterThan(spawned.find((z: any) => !z.heavy).radius);
    });

    it('gives the base tier no finisher — that is what evolving buys', () => {
        weapon.cooldown = 0;
        runSalvo(weapon);
        expect(spawned.some((z: any) => z.heavy)).toBe(false);
    });

    it('puts the evolved tier on a long cooldown', () => {
        weapon.evolved = true;
        weapon.cooldown = 0;
        weapon.update(0.016);
        expect(weapon.cooldown).toBeGreaterThan(weapon.baseCooldown * 2);
    });

    it('walks the salvo across the crowd, not across the player', () => {
        // The shells used to be laid along a 420px line centred on the player
        // with 90px of jitter, so they landed a screen apart on empty floor
        const crowd = [makeEnemy(600, 0), makeEnemy(640, 30), makeEnemy(620, -20)];
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue(crowd as any);
        weapon.evolved = true;
        weapon.cooldown = 0;
        runSalvo(weapon);

        const heavy = spawned.find((z: any) => z.heavy)!;
        // Every shell lands within a couple of blast radii of the crowd centre
        for (const shell of spawned) {
            const offset = Math.hypot(shell.pos.x - heavy.pos.x, shell.pos.y - heavy.pos.y);
            expect(offset).toBeLessThan(heavy.radius * 2);
        }
    });

    it('uses the lean impact burst, not the nuclear one', () => {
        const zone = new OrbitalStrikeZone(0, 0, 100, 0.1, 40);
        zone.update(0.2); // past the fuse → explodes
        expect(zone.exploded).toBe(true);
        expect(particles.emitOrbitalImpact).toHaveBeenCalledTimes(1);
        expect(particles.emitNuclear).not.toHaveBeenCalled();
        expect(particles.emitOrbitalStrike).not.toHaveBeenCalled();
    });
});

describe('PhantomSlashWeapon', () => {
    let weapon: PhantomSlashWeapon;
    let spawned: any[];

    beforeEach(() => {
        vi.clearAllMocks();
        weapon = new PhantomSlashWeapon(makeOwner());
        spawned = [];
        weapon.onSpawn = (e: any) => spawned.push(e);
    });

    it('cuts the closest enemies, not random ones', () => {
        const far = makeEnemy(240, 0);
        const near = makeEnemy(30, 0);
        const mid = makeEnemy(120, 0);
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([far, near, mid] as any);

        weapon.cooldown = 0;
        weapon.update(0.016);

        const cutOrder = vi.mocked(damageSystem.dealDamage).mock.calls.map(c => c[0].target);
        expect(cutOrder).toEqual([near, mid, far]);
    });

    it('spawns one procedural slash arc per cut and no emoji zones', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([
            makeEnemy(30, 0), makeEnemy(60, 0),
        ] as any);

        weapon.cooldown = 0;
        weapon.update(0.016);

        expect(spawned).toHaveLength(2);
        expect(spawned.every((e: any) => e instanceof SlashArc)).toBe(true);
        expect(spawned.every((e: any) => e.emoji === '')).toBe(true);
    });

    it('leaves a rift per cut when evolved', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([
            makeEnemy(30, 0), makeEnemy(60, 0),
        ] as any);

        weapon.evolved = true;
        weapon.cooldown = 0;
        weapon.update(0.016);

        const rifts = spawned.filter((e: any) => e instanceof DimensionalRiftZone);
        expect(rifts).toHaveLength(2);
        // Slow now runs through Zone.onOverlap, which Enemy actually reads
        const enemy: any = { speedMultiplier: 1 };
        rifts[0].onOverlap(enemy);
        expect(enemy.speedMultiplier).toBeLessThan(1);
    });

    it('does not fire when nothing is in range', () => {
        vi.mocked(levelSpatialHash.getWithinRadius).mockReturnValue([]);
        weapon.cooldown = 0;
        weapon.update(0.016);
        expect(spawned).toHaveLength(0);
        // Cooldown is not consumed either
        expect(weapon.cooldown).toBeLessThanOrEqual(0);
    });

    it('slash arcs expire on their own', () => {
        const arc = new SlashArc(0, 0, 0, 30, '#fff');
        arc.update(0.1);
        expect(arc.isDead).toBe(false);
        arc.update(0.3);
        expect(arc.isDead).toBe(true);
    });
});
