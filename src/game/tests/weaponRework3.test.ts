import { describe, it, expect, beforeEach, vi } from 'vitest';

// Input creates DOM elements (joystick) at module load — stub it out
vi.mock('../core/Input', () => ({
    input: {
        getAxis: () => ({ x: 0, y: 0 }),
        isMouseDown: false,
        mousePos: { x: 0, y: 0 },
    },
}));

import { Enemy } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { ENEMIES } from '../data/GameData';
import { levelSpatialHash } from '../core/SpatialHash';
import { status } from '../core/StatusEffects';
import { damageSystem } from '../core/DamageSystem';
import { AcidPoolWeapon, CorrosivePool } from '../weapons/implementations/AcidPoolWeapon';
import { FrostNovaWeapon, AbsoluteZeroZone } from '../weapons/implementations/FrostNovaWeapon';
import { SpinningEmberWeapon } from '../weapons/implementations/SpinningEmberWeapon';
import { BurningTrailZone, Projectile, Zone } from '../weapons/base';
import { PhantomSlashWeapon } from '../weapons/implementations/PhantomSlashWeapon';
import { PlasmaGrenadeWeapon } from '../weapons/implementations/PlasmaGrenadeWeapon';
import { SporeCloudWeapon } from '../weapons/implementations/SporeCloudWeapon';
import { BlackHoleZone } from '../weapons/implementations/SingularityOrbWeapon';
import { NanobotSwarmWeapon } from '../weapons/implementations/NanobotSwarmWeapon';
import type { Entity } from '../Entity';

function makeEnemy(x: number, y: number): Enemy {
    return new Enemy(x, y, ENEMIES[0]);
}

/** Fill the spatial hash the way GameManager does each frame */
function placeEnemies(enemies: Enemy[]) {
    levelSpatialHash.clear();
    levelSpatialHash.insertAll(enemies);
}

describe('Black Hole gravity', () => {
    /** A hole with a player standing off to the right, as the weapon wires it */
    function makeHole(playerX: number) {
        const zone = new BlackHoleZone(0, 0, 200, 3, 5);
        zone.source = { owner: { pos: { x: playerX, y: 0 } } } as any;
        return zone;
    }

    it('holds anything past the horizon completely still', () => {
        const zone = makeHole(600);
        const caught = makeEnemy(10, 0);
        caught.speedMultiplier = 1;
        placeEnemies([caught]);

        zone.update(1 / 60);
        expect(caught.speedMultiplier).toBe(0);
    });

    it('slingshots enemies whose path runs with it, and drags those climbing out', () => {
        const zone = makeHole(600);
        // Both outside the horizon. `behind` walks toward the player *through*
        // the hole; `ahead` has already passed it and is climbing away.
        const behind = makeEnemy(-150, 0);
        const ahead = makeEnemy(150, 0);
        behind.speedMultiplier = 1;
        ahead.speedMultiplier = 1;
        placeEnemies([behind, ahead]);

        zone.update(1 / 60);
        expect(behind.speedMultiplier).toBeGreaterThan(1);
        expect(ahead.speedMultiplier).toBeLessThan(1);
    });

    it('leaves anything outside its reach alone', () => {
        const zone = makeHole(600);
        const far = makeEnemy(900, 0);
        far.speedMultiplier = 1;
        placeEnemies([far]);

        zone.update(1 / 60);
        expect(far.speedMultiplier).toBe(1);
    });
});

describe('Corrosion', () => {
    let enemy: Enemy;

    beforeEach(() => {
        enemy = makeEnemy(0, 0);
    });

    it('amplifies every incoming hit', () => {
        const before = enemy.hp;
        damageSystem.dealDamage({ baseDamage: 10, source: null, target: enemy, position: enemy.pos, skipModifiers: true });
        const plain = before - enemy.hp;

        const other = makeEnemy(0, 0);
        status.corrode(other, { amp: 0.5, duration: 3 });
        const otherBefore = other.hp;
        damageSystem.dealDamage({ baseDamage: 10, source: null, target: other, position: other.pos, skipModifiers: true });
        expect(otherBefore - other.hp).toBeCloseTo(plain * 1.5);
    });

    it('keeps the strongest stack rather than multiplying', () => {
        status.corrode(enemy, { amp: 0.2, duration: 2 });
        status.corrode(enemy, { amp: 0.4, duration: 1 });
        expect(enemy.corrosion!.amp).toBeCloseTo(0.4);
        expect(enemy.corrosion!.timer).toBeCloseTo(2);
    });

    it('expires', () => {
        status.corrode(enemy, { amp: 0.3, duration: 1 });
        status.update(1.1, [enemy]);
        expect(enemy.corrosion).toBeNull();
    });
});

describe('Acid Pool', () => {
    it('aims at the densest cluster, not the closest enemy', () => {
        const player = new Player(0, 0);
        const weapon = new AcidPoolWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        // One straggler close by, a pack far away
        const enemies = [makeEnemy(60, 0)];
        for (let i = 0; i < 6; i++) enemies.push(makeEnemy(300 + i * 12, i * 12));
        placeEnemies(enemies);

        weapon.update(0.1);
        const lob = spawned[0] as any;
        expect(lob).toBeDefined();
        expect(lob.targetPos.x).toBeGreaterThan(200);
    });

    it('corrodes what stands in the pool', () => {
        const pool = new CorrosivePool(0, 0, 60, 3, 5, 0.5);
        pool.corrosionAmp = 0.25;
        const enemy = makeEnemy(10, 10);
        pool.onOverlap(enemy);
        expect(enemy.corrosion?.amp).toBeCloseTo(0.25);
    });

    it('evolved also leaves an acid DoT', () => {
        const pool = new CorrosivePool(0, 0, 60, 3, 5, 0.5);
        pool.acidDps = 8;
        const enemy = makeEnemy(0, 0);
        pool.onOverlap(enemy);
        expect(enemy.infection?.kind).toBe('acid');
    });
});

describe('Frost Nova', () => {
    it('aims at the crowd', () => {
        const player = new Player(0, 0);
        const weapon = new FrostNovaWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        const enemies: Enemy[] = [];
        for (let i = 0; i < 5; i++) enemies.push(makeEnemy(250 + i * 10, 0));
        placeEnemies(enemies);

        weapon.update(0.1);
        const lob = spawned[0] as any;
        expect(lob.targetPos.x).toBeGreaterThan(200);
    });

    it('still casts with nobody in range instead of skipping the turn', () => {
        const player = new Player(0, 0);
        const weapon = new FrostNovaWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);
        placeEnemies([]);

        weapon.update(0.1);
        expect(spawned.length).toBe(1);
    });

    it('only the evolved tier freezes, and it freezes on impact', () => {
        const player = new Player(0, 0);
        const weapon = new FrostNovaWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);
        const enemy = makeEnemy(20, 0);
        placeEnemies([enemy]);

        // Base tier: the charge lands, nobody is frozen — slow is its whole job
        weapon.update(0.1);
        (spawned[0] as any).onLand(0, 0);
        expect(enemy.stunTimer).toBe(0);

        // Evolved: the same landing snaps the pack still
        const evolved = new FrostNovaWeapon(player);
        evolved.evolved = true;
        const evolvedSpawned: Entity[] = [];
        evolved.onSpawn = e => evolvedSpawned.push(e);
        evolved.update(0.1);
        (evolvedSpawned[0] as any).onLand(0, 0);
        expect(enemy.stunTimer).toBeGreaterThan(0);
    });

    it('the slab holds the pack in a slow rather than a rolling stun', () => {
        // Re-applying a stun every frame is the exact shape StatusEffects had
        // to grow a diminishing-returns rule to survive
        const zone = new AbsoluteZeroZone(0, 0, 80, 10, 1, 0.6);
        const enemy = makeEnemy(20, 0);
        placeEnemies([enemy]);

        zone.update(0.1);
        expect(enemy.stunTimer).toBe(0);

        zone.onOverlap(enemy);
        expect(enemy.speedMultiplier).toBeLessThan(1);
    });

    it('shatters everything still inside when the field collapses', () => {
        const zone = new AbsoluteZeroZone(0, 0, 80, 10, 0.05, 0.6);
        zone.shatterDamage = 40;
        const enemy = makeEnemy(10, 0);
        placeEnemies([enemy]);

        const before = enemy.hp;
        zone.update(0.1); // runs the field out, triggering the shatter
        expect(enemy.hp).toBeLessThan(before);
    });
});

describe('Blood Cleaver', () => {
    /** Damage the cleaver lands on one enemy at a given health fraction */
    function swingDamage(hpFraction: number): number {
        const player = new Player(0, 0);
        player.hp = player.maxHp * hpFraction;
        const weapon = new SpinningEmberWeapon(player);
        weapon.onSpawn = () => { };
        const enemy = makeEnemy(30, 0);
        placeEnemies([enemy]);

        const spy = vi.spyOn(damageSystem, 'dealDamage')
            .mockReturnValue({ finalDamage: 0, isCrit: false, killed: false });
        weapon.update(0.1);
        const dealt = (spy.mock.calls[0]?.[0] as any)?.baseDamage ?? 0;
        spy.mockRestore();
        return dealt;
    }

    it('hits harder the more health the wielder is missing', () => {
        // The whole reason this weapon belongs to the Berserker: the class has
        // negative armour and an adrenaline threshold, so it lives down here
        const healthy = swingDamage(1);
        const bloodied = swingDamage(0.35);
        const dying = swingDamage(0.05);

        expect(bloodied).toBeGreaterThan(healthy);
        expect(dying).toBeGreaterThan(bloodied);
        // ...and roughly 2.6x at death's door, not a rounding difference
        expect(dying / healthy).toBeGreaterThan(2);
    });

    it('shoves what it cuts, so being surrounded stays survivable', () => {
        const player = new Player(0, 0);
        const weapon = new SpinningEmberWeapon(player);
        weapon.onSpawn = () => { };
        const enemy = makeEnemy(30, 0);
        placeEnemies([enemy]);

        weapon.update(0.1);
        expect(Math.hypot(enemy.knockback.x, enemy.knockback.y)).toBeGreaterThan(0);
    });

    it('spawns a swing the arena will actually keep and draw', () => {
        // The arc used to extend Entity directly, and GameManager.spawnEntity
        // silently drops anything that is not a Projectile or a Zone. Result:
        // full damage, zero visuals — the weapon looked like it did nothing.
        const player = new Player(0, 0);
        const weapon = new SpinningEmberWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);
        placeEnemies([makeEnemy(30, 0)]);

        weapon.update(0.1);
        expect(spawned.length).toBeGreaterThan(0);
        expect(spawned.every(e => e instanceof Projectile || e instanceof Zone)).toBe(true);
    });

    it('holds the swing when nothing is in reach, and spends it the moment something is', () => {
        const player = new Player(0, 0);
        const weapon = new SpinningEmberWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        placeEnemies([]);
        weapon.update(2);
        expect(spawned).toHaveLength(0);

        // Cooldown was never spent, so the first body to walk in eats it now
        placeEnemies([makeEnemy(30, 0)]);
        weapon.update(0.016);
        expect(spawned.length).toBeGreaterThan(0);
    });

    it('evolved scorches the ground and sets what it cuts alight', () => {
        const player = new Player(0, 0);
        const weapon = new SpinningEmberWeapon(player);
        weapon.evolved = true;
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);
        const enemy = makeEnemy(30, 0);
        placeEnemies([enemy]);

        weapon.update(0.1);
        expect(spawned.some(e => e instanceof BurningTrailZone)).toBe(true);
        expect(enemy.infection?.kind).toBe('burn');
    });
});

describe('Phantom Slash crowd scaling', () => {
    function slashDamage(enemyCount: number): number {
        const player = new Player(0, 0);
        const weapon = new PhantomSlashWeapon(player);
        weapon.onSpawn = () => { };

        const enemies: Enemy[] = [];
        for (let i = 0; i < enemyCount; i++) {
            const angle = (i / enemyCount) * Math.PI * 2;
            enemies.push(makeEnemy(Math.cos(angle) * 40, Math.sin(angle) * 40));
        }
        placeEnemies(enemies);

        // Every enemy sits at the same distance, so which three the blade picks
        // depends on spatial-hash bucket order — measure the hardest cut landed
        const before = enemies.map(e => e.hp);
        weapon.update(2);
        return Math.max(...enemies.map((e, i) => before[i] - e.hp));
    }

    it('cuts harder when the player is surrounded', () => {
        const alone = slashDamage(1);
        const buried = slashDamage(10);
        expect(buried).toBeGreaterThan(alone * 1.5);
    });

    it('caps the bonus so a huge pile is not a one-shot', () => {
        const ten = slashDamage(10);
        const forty = slashDamage(40);
        expect(forty).toBeLessThanOrEqual(ten * 1.35);
    });
});

describe('Plasma Grenade stun', () => {
    it('concusses everything in the blast', () => {
        const player = new Player(0, 0);
        const weapon = new PlasmaGrenadeWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        const enemy = makeEnemy(120, 0);
        placeEnemies([enemy]);

        weapon.update(3);
        const lob = spawned.find(e => (e as any).onLand) as any;
        lob.onLand(enemy.pos.x, enemy.pos.y);

        expect(enemy.stunTimer).toBeGreaterThan(0);
    });

    it('stuns a boss for a fraction of the time', () => {
        const player = new Player(0, 0);
        const weapon = new PlasmaGrenadeWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        const grunt = makeEnemy(120, 0);
        const boss = makeEnemy(120, 20);
        boss.makeBoss();
        placeEnemies([grunt, boss]);

        weapon.update(3);
        const lob = spawned.find(e => (e as any).onLand) as any;
        lob.onLand(120, 10);

        expect(boss.stunTimer).toBeLessThan(grunt.stunTimer);
        expect(boss.stunTimer).toBeGreaterThan(0);
    });
});

describe('Spore Cloud growth', () => {
    it('the patch gets wider with every level, not just stronger', () => {
        const player = new Player(0, 0);
        const weapon = new SporeCloudWeapon(player);
        const spawned: Entity[] = [];
        weapon.onSpawn = e => spawned.push(e);

        weapon.spawnZone();
        const level1 = spawned[0].radius;

        weapon.upgrade();
        weapon.upgrade();
        weapon.spawnZone();
        expect(spawned[1].radius).toBeGreaterThan(level1);
    });
});

describe('Nanobot Swarm', () => {
    it('flies drones even before it evolves', () => {
        const player = new Player(0, 0);
        const weapon = new NanobotSwarmWeapon(player);
        const spawned: any[] = [];
        weapon.onSpawn = e => spawned.push(e);
        placeEnemies([]);

        weapon.update(0.1);
        expect(spawned[0].constructor.name).toBe('NaniteHiveCloud');
    });
});

describe('Phantom Slash cone', () => {
    it('only cuts inside the arc facing the nearest enemy', () => {
        const player = new Player(0, 0);
        const weapon = new PhantomSlashWeapon(player);
        weapon.onSpawn = () => { };

        // One enemy to the right (the blade will face it), one directly behind
        const front = makeEnemy(60, 0);
        const behind = makeEnemy(-70, 0);
        placeEnemies([front, behind]);

        const behindBefore = behind.hp;
        weapon.update(2);

        expect(front.hp).toBeLessThan(front.maxHp);
        // Cutting something 180° away made the weapon read as an aura, not a blade
        expect(behind.hp).toBe(behindBefore);
    });

    it('the evolved blade sweeps wider', () => {
        function hitsAtAngle(evolved: boolean): boolean {
            const player = new Player(0, 0);
            const weapon = new PhantomSlashWeapon(player);
            weapon.evolved = evolved;
            weapon.onSpawn = () => { };

            const front = makeEnemy(60, 0);
            // ~60° off the facing direction: outside the 45° base cone,
            // inside the evolved one
            const wide = makeEnemy(Math.cos(1.05) * 90, Math.sin(1.05) * 90);
            placeEnemies([front, wide]);

            const before = wide.hp;
            weapon.update(2);
            return wide.hp < before;
        }

        expect(hitsAtAngle(false)).toBe(false);
        expect(hitsAtAngle(true)).toBe(true);
    });
});
