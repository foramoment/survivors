/**
 * Behaviour locks for the reworked Orbital Strike and Phantom Slash.
 *
 * These cover the things that were actually wrong before: an evolved tier that
 * dumped one enormous nuke, targeting that ignored the enemies next to you,
 * and per-frame emoji rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../core/ParticleSystem', () => ({
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

vi.mock('../core/SpatialHash', () => ({
    levelSpatialHash: {
        getWithinRadius: vi.fn(() => []),
        getNearby: vi.fn(() => []),
    },
}));

import { OrbitalStrikeWeapon, OrbitalStrikeZone } from '../weapons/implementations/OrbitalStrikeWeapon';
import { PhantomSlashWeapon, SlashArc, DimensionalRiftZone } from '../weapons/implementations/PhantomSlashWeapon';
import { levelSpatialHash } from '../core/SpatialHash';
import { damageSystem } from '../core/DamageSystem';
import { particles } from '../core/ParticleSystem';

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

    it('evolves into a staggered salvo instead of one nuke', () => {
        weapon.evolved = true;
        weapon.cooldown = 0;
        weapon.update(0.016);

        // Four shells plus the heavy finisher. Six read as visual spam — the
        // finisher that is meant to be the payoff was lost among the reticles.
        expect(spawned.length).toBe(5);
        const delays = spawned.map((z: any) => z.delay);
        // Fuses are staggered, so the salvo rolls across the field
        expect(new Set(delays).size).toBe(delays.length);
        expect(Math.max(...delays)).toBeGreaterThan(Math.min(...delays));
    });

    it('gives the barrage exactly one heavy finisher, landing last', () => {
        weapon.evolved = true;
        weapon.cooldown = 0;
        weapon.update(0.016);

        const heavies = spawned.filter((z: any) => z.heavy);
        expect(heavies).toHaveLength(1);
        expect(heavies[0].delay).toBe(Math.max(...spawned.map((z: any) => z.delay)));
        expect(heavies[0].radius).toBeGreaterThan(spawned.find((z: any) => !z.heavy).radius);
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
        weapon.update(0.016);

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
