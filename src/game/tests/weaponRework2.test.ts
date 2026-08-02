/**
 * Behaviour tests for the second weapon rework pass:
 * Spore Cloud (infection), Nanobot Swarm (hive drones), Void Ray (swept lance
 * + burning trail), Plasma Grenade (cluster + capped chains), Mind Blast
 * (stun + cascade).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SporeCloudWeapon, FungalBloomZone } from '../weapons/implementations/SporeCloudWeapon';
import { NanobotSwarmWeapon, NaniteHiveCloud } from '../weapons/implementations/NanobotSwarmWeapon';
import { VoidRayWeapon } from '../weapons/implementations/VoidRayWeapon';
import { PlasmaGrenadeWeapon } from '../weapons/implementations/PlasmaGrenadeWeapon';
import { MindBlastWeapon, PsiBlastZone } from '../weapons/implementations/MindBlastWeapon';
import { LobbedProjectile, PlasmaExplosionZone, SporeZone, BurningTrailZone } from '../weapons/base';
import { Enemy } from '../entities/Enemy';
import { levelSpatialHash } from '../core/SpatialHash';
import { damageSystem } from '../core/DamageSystem';

const TYPE = { name: 'Void Bat', hp: 1000, speed: 100, damage: 5, xpValue: 1, emoji: '🦇' };

function mockOwner() {
    return {
        pos: { x: 0, y: 0 },
        stats: {
            might: 1, area: 1, cooldown: 1, speed: 1, duration: 1,
            critChance: 0, critDamage: 1.5,
        },
    } as any;
}

function enemyAt(x: number, y: number): Enemy {
    return new Enemy(x, y, { ...TYPE });
}

function collect(weapon: any) {
    const spawned: any[] = [];
    weapon.onSpawn = (e: any) => spawned.push(e);
    return spawned;
}

beforeEach(() => {
    levelSpatialHash.clear();
    vi.restoreAllMocks();
});

describe('Spore Cloud', () => {
    it('infects what stands in the patch instead of only ticking contact damage', () => {
        const weapon = new SporeCloudWeapon(mockOwner());
        const spawned = collect(weapon);
        weapon.spawnZone();

        const zone = spawned[0] as SporeZone;
        expect(zone.infectDps).toBeGreaterThan(0);
        expect(zone.contagious).toBe(false);

        const enemy = enemyAt(0, 0);
        zone.onOverlap(enemy);
        expect(enemy.infection).not.toBeNull();
        expect(enemy.infection?.contagious).toBe(false);
    });

    it('evolves into a contagious, growing bloom', () => {
        const weapon = new SporeCloudWeapon(mockOwner());
        weapon.level = 6;
        weapon.evolved = true;
        const spawned = collect(weapon);
        weapon.spawnZone();

        const zone = spawned[0] as FungalBloomZone;
        expect(zone).toBeInstanceOf(FungalBloomZone);
        expect(zone.contagious).toBe(true);

        const startRadius = zone.radius;
        for (let i = 0; i < 60; i++) zone.update(1 / 60);
        expect(zone.radius).toBeGreaterThan(startRadius);

        const enemy = enemyAt(0, 0);
        zone.onOverlap(enemy);
        expect(enemy.infection?.contagious).toBe(true);
    });
});

describe('Nanobot Swarm', () => {
    it('evolved spawns a hive whose drones strike nearby enemies', () => {
        const weapon = new NanobotSwarmWeapon(mockOwner());
        weapon.level = 6;
        weapon.evolved = true;
        const spawned = collect(weapon);
        weapon.update(0.1);

        const cloud = spawned[0];
        expect(cloud).toBeInstanceOf(NaniteHiveCloud);

        const enemy = enemyAt(40, 0);
        levelSpatialHash.insertAll([enemy]);
        const spy = vi.spyOn(damageSystem, 'dealDamage').mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });

        for (let i = 0; i < 30; i++) cloud.update(1 / 60);
        expect(spy).toHaveBeenCalled();
    });

    it('area scales the whole radius, not just the per-level part', () => {
        const owner = mockOwner();
        owner.stats.area = 2;
        const weapon = new NanobotSwarmWeapon(owner);
        const spawned = collect(weapon);
        weapon.update(0.1);
        // (60 + level*10) * 2 with level 1 = 140
        expect(spawned[0].radius).toBe(140);
    });
});

describe('Void Ray', () => {
    /** Run a lance to completion — charge, then the whole sweep */
    function runLance(lance: any) {
        for (let i = 0; i < 240 && !lance.isDead; i++) lance.update(1 / 60);
    }

    it('cuts everything the swept line crosses, not just the lock-on target', () => {
        const weapon = new VoidRayWeapon(mockOwner());
        const spawned = collect(weapon);

        const target = enemyAt(300, 0);
        const bystander = enemyAt(150, 5);
        const offAxis = enemyAt(150, 400);
        levelSpatialHash.insertAll([target, bystander, offAxis]);
        (weapon as any).findClosestEnemy = () => target as any;
        // Keep the shot to its lock-on leg so the assertion is about the line,
        // not about where the sweep happened to swing
        (weapon as any).pickSweepTarget = () => null;

        const hits: any[] = [];
        vi.spyOn(damageSystem, 'dealDamage').mockImplementation((p: any) => {
            hits.push(p.target);
            return { finalDamage: 0, isCrit: false, killed: false };
        });

        weapon.update(0.1);
        runLance(spawned[0]);

        expect(hits).toContain(target);
        expect(hits).toContain(bystander);
        expect(hits).not.toContain(offAxis);
    });

    it('cuts a body on the line exactly once, however long the sweep takes', () => {
        const weapon = new VoidRayWeapon(mockOwner());
        const spawned = collect(weapon);

        const target = enemyAt(300, 0);
        // On the beam's path but far from the impact point, so it is only ever
        // touched by the line — the target itself also takes the impact burst
        const bystander = enemyAt(150, 4);
        levelSpatialHash.insertAll([target, bystander]);
        (weapon as any).findClosestEnemy = () => target as any;
        (weapon as any).pickSweepTarget = () => null;

        const spy = vi.spyOn(damageSystem, 'dealDamage')
            .mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });

        weapon.update(0.1);
        runLance(spawned[0]);

        expect(spy.mock.calls.filter(c => (c[0] as any).target === bystander)).toHaveLength(1);
    });

    it('detonates a small burst on the body it settles on', () => {
        const weapon = new VoidRayWeapon(mockOwner());
        const spawned = collect(weapon);

        const target = enemyAt(300, 0);
        levelSpatialHash.insertAll([target]);
        (weapon as any).findClosestEnemy = () => target as any;
        (weapon as any).pickSweepTarget = () => null;

        const spy = vi.spyOn(damageSystem, 'dealDamage')
            .mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });

        weapon.update(0.1);
        runLance(spawned[0]);

        // Line cut plus the impact burst, and the burst sets it alight
        expect(spy.mock.calls.filter(c => (c[0] as any).target === target)).toHaveLength(2);
        expect(target.infection?.kind).toBe('burn');
    });

    it('leaves burning ground along the path it swept', () => {
        const weapon = new VoidRayWeapon(mockOwner());
        const spawned = collect(weapon);

        const target = enemyAt(400, 0);
        levelSpatialHash.insertAll([target]);
        (weapon as any).findClosestEnemy = () => target as any;
        (weapon as any).pickSweepTarget = () => null;

        weapon.update(0.1);
        runLance(spawned[0]);

        const fires = spawned.filter(e => e instanceof BurningTrailZone);
        expect(fires.length).toBeGreaterThan(0);
        expect(fires.every(f => (f as any).burnDps > 0)).toBe(true);
    });

    it('evolved zigzags through three further targets on a longer cooldown', () => {
        const weapon = new VoidRayWeapon(mockOwner());
        weapon.level = 6;
        weapon.evolved = true;
        const spawned = collect(weapon);

        // A line of enemies each beyond SWEEP_MIN_REACH of the last
        const chain = [enemyAt(200, 0), enemyAt(200, 200), enemyAt(0, 200), enemyAt(-200, 200)];
        levelSpatialHash.insertAll(chain);
        (weapon as any).findClosestEnemy = () => chain[0] as any;

        weapon.update(0.1);

        const lance = spawned[0] as any;
        // owner + lock-on + three sweeps
        expect(lance.nodes).toHaveLength(5);
        expect(weapon.cooldown).toBeCloseTo(weapon.baseCooldown * 1.35);
    });
});

describe('Plasma Grenade', () => {
    it('throws one visible canister, three when evolved', () => {
        const weapon = new PlasmaGrenadeWeapon(mockOwner());
        const spawned = collect(weapon);
        const target = enemyAt(200, 0);
        (weapon as any).findClosestEnemy = () => target as any;

        weapon.update(0.1);
        expect(spawned.filter(e => e instanceof LobbedProjectile)).toHaveLength(1);

        weapon.evolved = true;
        weapon.cooldown = 0;
        spawned.length = 0;
        weapon.update(0.1);
        const lobs = spawned.filter(e => e instanceof LobbedProjectile) as LobbedProjectile[];
        expect(lobs).toHaveLength(3);
        // Staggered so the volley doesn't land in a single frame
        expect(new Set(lobs.map(l => l.delay)).size).toBe(3);
    });

    it('gains a canister every second level, and each one hits for less', () => {
        const weapon = new PlasmaGrenadeWeapon(mockOwner());
        const spawned = collect(weapon);
        const target = enemyAt(200, 0);
        (weapon as any).findClosestEnemy = () => target as any;

        const counts: number[] = [];
        for (let level = 1; level <= 5; level++) {
            weapon.level = level;
            weapon.cooldown = 0;
            spawned.length = 0;
            weapon.update(0.1);
            counts.push(spawned.filter(e => e instanceof LobbedProjectile).length);
        }
        expect(counts).toEqual([1, 1, 2, 2, 3]);

        // Total output grows as sqrt(count), so extra canisters buy reach and
        // not a free damage multiplier
        expect((weapon as any).canisterPower(4)).toBeCloseTo(0.5);
    });

    it('caps and delays chain explosions', () => {
        const weapon = new PlasmaGrenadeWeapon(mockOwner());
        weapon.evolved = true;
        const spawned = collect(weapon);
        const target = enemyAt(200, 0);
        (weapon as any).findClosestEnemy = () => target as any;

        weapon.update(0.1);
        const lob = spawned.find(e => e instanceof LobbedProjectile) as LobbedProjectile;
        spawned.length = 0;
        lob.onLand(200, 0);

        const blast = spawned.find(e => e instanceof PlasmaExplosionZone) as PlasmaExplosionZone;
        expect(blast.onChainExplosion).toBeDefined();

        // Ten enemies in the blast must not spawn ten secondary explosions
        for (let i = 0; i < 10; i++) blast.onChainExplosion!(i * 10, 0);
        const chains = spawned.filter(e => e instanceof PlasmaExplosionZone && e !== blast) as PlasmaExplosionZone[];
        expect(chains.length).toBeLessThanOrEqual(3);
        expect(chains.every(c => c.detonationDelay > 0)).toBe(true);
    });
});

describe('Mind Blast', () => {
    it('stuns what it catches', () => {
        const weapon = new MindBlastWeapon(mockOwner());
        const spawned = collect(weapon);
        const target = enemyAt(100, 0);
        levelSpatialHash.insertAll([target]);
        (weapon as any).findRandomEnemies = () => [target] as any;

        weapon.update(0.1);
        const blast = spawned[0] as PsiBlastZone;
        blast.update(1 / 60);

        expect(target.stunTimer).toBeGreaterThan(0);
    });

    it('evolved cascades to a new target on a delay', () => {
        const weapon = new MindBlastWeapon(mockOwner());
        weapon.level = 6;
        weapon.evolved = true;
        const spawned = collect(weapon);

        const first = enemyAt(0, 0);
        const second = enemyAt(220, 0);
        levelSpatialHash.insertAll([first, second]);
        (weapon as any).findRandomEnemies = () => [first] as any;

        weapon.update(0.1);
        (spawned[0] as PsiBlastZone).update(1 / 60);
        expect(spawned).toHaveLength(1);

        // The jump lands a fraction of a second later, not in the same frame
        for (let i = 0; i < 20; i++) weapon.update(1 / 60);
        expect(spawned.length).toBeGreaterThan(1);
    });
});
