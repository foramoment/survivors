import { ProjectileWeapon, ZoneWeapon, Zone, BouncingProjectile, ChainLightning, Beam, OrbitingProjectile, LobbedProjectile, DelayedExplosionZone, Projectile, MindBlastZone, VoidRayBeam, FrostZone, AcidZone, SporeZone, SingularityProjectile, PlasmaProjectile, NanobotCloud } from './WeaponTypes';
import { distance, type Vector2 } from '../core/Utils';
import { Weapon } from '../Weapon';
import { Entity } from '../Entity';
import { WEAPON_STATS } from '../data/GameData';
import { particles } from '../core/ParticleSystem';

// Helper to get stats for a weapon
function getStats(weaponId: string) {
    const stats = WEAPON_STATS[weaponId];
    if (!stats) {
        console.warn(`No stats found for weapon: ${weaponId}`);
        return {
            damage: 10, damageScaling: 1.2, cooldown: 1.0,
            area: 100, areaScaling: 1.0, speed: 300, duration: 1.0
        };
    }
    return stats;
}

// 1. Void Ray
export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a powerful charging beam.";
    private stats = getStats('void_ray');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < 600 && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                const isEvolved = this.level >= 6;
                const damage = (this.owner as any).getDamage(this.damage).damage * (isEvolved ? 2 : 1);

                const beam = new VoidRayBeam(
                    this.owner,
                    target,
                    damage,
                    isEvolved,
                    (pos, amount) => this.onDamage(pos, amount)
                );
                this.onSpawn(beam);

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 2. Phantom Slash
export class PhantomSlashWeapon extends Weapon {
    name = "Phantom Slash";
    emoji = "⚔️";
    description = "Instantly cuts random enemies.";
    private stats = getStats('phantom_slash');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < this.area * (this.owner as any).stats.area);

            if (targets.length > 0) {
                const count = (this.stats.count || 3) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
                for (let i = 0; i < count; i++) {
                    if (targets.length === 0) break;
                    const idx = Math.floor(Math.random() * targets.length);
                    const target = targets[idx];
                    targets.splice(idx, 1);

                    const { damage } = (this.owner as any).getDamage(this.damage);
                    (target as any).takeDamage(damage);
                    this.onDamage(target.pos, damage);

                    const slash = new Zone(target.pos.x, target.pos.y, 40, 0.2, 0, 1, '⚔️');
                    this.onSpawn(slash);
                }
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 3. Plasma Cannon
export class PlasmaCannonWeapon extends ProjectileWeapon {
    name = "Plasma Cannon";
    emoji = "🔋";
    description = "Fires massive explosive plasma rounds.";
    projectileEmoji = "🟢";
    pierce = 999;
    private stats = getStats('plasma_cannon');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);

        const plasma = new PlasmaProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration,
            damage,
            1 // Low pierce so it explodes on first hit
        );

        this.onSpawn(plasma);
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }
}

// 4. Nanobot Swarm
export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Swarm of nanobots that devour enemies.";
    private activeCloud: NanobotCloud | null = null;
    private stats = getStats('nanobot_swarm');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.duration = this.stats.duration;
        this.area = this.stats.area;
    }

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        // Clean up dead cloud
        if (this.activeCloud && this.activeCloud.isDead) {
            this.activeCloud = null;
        }

        if (this.cooldown <= 0 && !this.activeCloud) {
            const radius = 60 + this.level * 10 * (this.owner as any).stats.area;
            const baseInterval = Math.max(0.1, 0.5 - (this.owner as any).stats.tick);
            const boostedInterval = baseInterval / speedBoost;

            const cloud = new NanobotCloud(
                this.owner,
                radius,
                this.duration * (this.owner as any).stats.duration,
                (this.owner as any).getDamage(this.damage).damage,
                Math.max(0.05, boostedInterval)
            );
            this.onSpawn(cloud);
            this.activeCloud = cloud;

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= 1.1;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 5. Spore Cloud
export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "";
    interval = 1;
    private stats = getStats('spore_cloud');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.duration = this.stats.duration;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    spawnZone() {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const baseInterval = Math.max(0.1, this.interval - (this.owner as any).stats.tick);
        const boostedInterval = baseInterval / speedBoost;

        const { damage } = (this.owner as any).getDamage(this.damage);

        const zone = new SporeZone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * (this.owner as any).stats.area,
            this.duration * (this.owner as any).stats.duration,
            damage,
            Math.max(0.01, boostedInterval)
        );
        this.onSpawn(zone);
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }
}

// 6. Singularity Orb
export class SingularityOrbWeapon extends ProjectileWeapon {
    name = "Singularity Orb";
    emoji = "⚫";
    description = "Slow moving orb of destruction.";
    projectileEmoji = "";
    pierce = 999;
    private stats = getStats('singularity_orb');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    fire(target: Entity) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);
        const isEvolved = this.level >= 6;

        const proj = new SingularityProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            damage,
            this.pierce
        );
        proj.pullStrength = isEvolved ? 150 : 80;
        this.onSpawn(proj);
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }
}

// 7. Orbital Strike
export class OrbitalStrikeWeapon extends Weapon {
    name = "Orbital Strike";
    emoji = "🛰️";
    description = "Calls down random explosions.";
    private stats = getStats('orbital_strike');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const isEvolved = this.level >= 6;

            if (isEvolved) {
                const zone = new DelayedExplosionZone(
                    this.owner.pos.x + (Math.random() - 0.5) * 400,
                    this.owner.pos.y + (Math.random() - 0.5) * 300,
                    500,
                    4.0,
                    (this.owner as any).getDamage(this.damage * 10).damage,
                    '☢️',
                    (pos, amount) => {
                        for (let i = 0; i < 8; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const dist = 150 + Math.random() * 300;
                            const miniZone = new DelayedExplosionZone(
                                pos.x + Math.cos(angle) * dist,
                                pos.y + Math.sin(angle) * dist,
                                80,
                                0.5,
                                amount * 0.1,
                                '💥',
                                (p, a) => this.onDamage(p, a)
                            );
                            this.onSpawn(miniZone);
                        }
                        this.onDamage(pos, amount);
                    },
                    true
                );
                this.onSpawn(zone);
                this.cooldown = this.baseCooldown * 5 * (this.owner as any).stats.cooldown;
            } else {
                const count = (this.stats.count || 1) + Math.floor((this.level - 1) * (this.stats.countScaling || 0.5));

                for (let i = 0; i < count; i++) {
                    const offsetX = (Math.random() - 0.5) * 1000;
                    const offsetY = (Math.random() - 0.5) * 800;

                    const zone = new DelayedExplosionZone(
                        this.owner.pos.x + offsetX,
                        this.owner.pos.y + offsetY,
                        this.area * (this.owner as any).stats.area * (1 + this.level * 0.1),
                        1.0,
                        (this.owner as any).getDamage(this.damage).damage,
                        '💥',
                        (pos, amount) => this.onDamage(pos, amount)
                    );
                    this.onSpawn(zone);
                }
                this.cooldown = this.baseCooldown * (1 + this.level * 0.05) * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 8. Mind Blast
export class MindBlastWeapon extends Weapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic storm at enemy location.";
    private stats = getStats('mind_blast');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < 600);

            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                const isEvolved = this.level >= 6;

                const zone = new MindBlastZone(
                    target.pos.x,
                    target.pos.y,
                    this.area * (this.owner as any).stats.area,
                    (this.owner as any).getDamage(this.damage).damage,
                    (pos, amount) => this.onDamage(pos, amount),
                    isEvolved ? 2.0 : 0
                );
                this.onSpawn(zone);

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 9. Chrono Disc
export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 0;
    private stats = getStats('chrono_disc');
    private pendingDiscs: { delay: number; target: Entity }[] = [];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        // Process pending discs (staggered spawn)
        for (let i = this.pendingDiscs.length - 1; i >= 0; i--) {
            this.pendingDiscs[i].delay -= dt;
            if (this.pendingDiscs[i].delay <= 0) {
                this.fire(this.pendingDiscs[i].target);
                this.pendingDiscs.splice(i, 1);
            }
        }

        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < this.area * (this.owner as any).stats.area && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                // Calculate disc count from stats
                const count = (this.stats.count || 1) + Math.floor((this.level - 1) * (this.stats.countScaling || 0));

                // First disc fires immediately
                this.fire(target);

                // Additional discs spawn with stagger
                for (let i = 1; i < count; i++) {
                    this.pendingDiscs.push({
                        delay: i * 0.2, // 0.2s between each disc
                        target: target
                    });
                }

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const bounces = (this.stats.pierce || 5) + this.level;

        const projectile = new BouncingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            (this.owner as any).getDamage(this.damage).damage,
            bounces,
            this.projectileEmoji,
            this.stats.area
        );

        this.onSpawn(projectile);
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
    }
}

// 10. Acid Pool
export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Throws acid flasks that create puddles.";
    private stats = getStats('acid_pool');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            let target: any = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < 500 && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                const lob = new LobbedProjectile(
                    this.owner.pos.x,
                    this.owner.pos.y,
                    target.pos,
                    0.8,
                    '🧪'
                );

                lob.onLand = (x, y) => {
                    particles.emitPoison(x, y);
                    const zone = new AcidZone(
                        x, y,
                        this.area * (this.owner as any).stats.area,
                        this.stats.duration * (this.owner as any).stats.duration,
                        (this.owner as any).getDamage(this.damage).damage,
                        0.5
                    );
                    this.onSpawn(zone);
                };

                this.onSpawn(lob);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 11. Lightning Chain
export class LightningChainWeapon extends ProjectileWeapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Lightning that chains between enemies.";
    projectileEmoji = "⚡";
    pierce = 3;
    private stats = getStats('lightning_chain');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = 0;
        this.duration = this.stats.duration;
    }

    fire(target: any) {
        const { damage } = (this.owner as any).getDamage(this.damage);

        target.takeDamage(damage);
        this.onDamage(target.pos, damage);
        particles.emitLightning(target.pos.x, target.pos.y);

        const beam = new Beam(this.owner.pos, target.pos, 0.1, '#ffff00', 2);
        this.onSpawn(beam);

        const isEvolved = this.level >= 6;
        const bounces = isEvolved ? 999 : (this.stats.pierce || 5) + this.level;
        const maxChainLength = isEvolved ? 10000 : this.stats.area;

        const chain = new ChainLightning(target.pos.x, target.pos.y, damage, bounces, maxChainLength);
        chain.hitEnemies.add(target);

        chain.onHit = (t: any, d: number) => {
            t.takeDamage(d);
            this.onDamage(t.pos, d);
            particles.emitLightning(t.pos.x, t.pos.y);
        };

        this.onSpawn(chain);
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
    }
}

// 12. Spinning Ember
export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: OrbitingProjectile[] = [];
    private stats = getStats('spinning_ember');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
    }

    update(dt: number, _enemies: Entity[]) {
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const count = (this.stats.count || 2) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
            const duration = this.stats.duration * (this.owner as any).stats.duration;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const proj = new OrbitingProjectile(
                    this.owner,
                    this.stats.area,
                    this.stats.speed,
                    duration,
                    (this.owner as any).getDamage(this.damage).damage,
                    '🔥'
                );
                proj.angle = angle;
                this.onSpawn(proj);
                this.projectiles.push(proj);
            }

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown + duration;
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 13. Frost Nova
export class FrostNovaWeapon extends Weapon {
    name = "Frost Nova";
    emoji = "❄️";
    description = "Throws freezing grenades.";
    private stats = getStats('frost_nova');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const range = 400;
            const offsetX = (Math.random() - 0.5) * 2 * range;
            const offsetY = (Math.random() - 0.5) * 2 * range;
            const target = { x: this.owner.pos.x + offsetX, y: this.owner.pos.y + offsetY };

            const lob = new LobbedProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                target,
                0.6,
                '❄️'
            );

            lob.onLand = (x, y) => {
                const isEvolved = this.level >= 6;
                particles.emitFrost(x, y);
                const zone = new FrostZone(
                    x, y,
                    this.area * (this.owner as any).stats.area,
                    this.stats.duration * (this.owner as any).stats.duration,
                    (this.owner as any).getDamage(this.damage).damage,
                    0.5,
                    isEvolved ? 0.9 : 0.5
                );
                this.onSpawn(zone);
            };

            this.onSpawn(lob);
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
        this.area *= this.stats.areaScaling;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 14. Fan of Knives
export class FanOfKnivesWeapon extends ProjectileWeapon {
    name = "Fan of Knives";
    emoji = "🗡️";
    description = "Fires a spread of knives.";
    projectileEmoji = "🗡️";
    pierce = 2;
    private stats = getStats('fan_of_knives');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
        this.pierce = this.stats.pierce || 2;
    }

    fire(target: any) {
        const count = (this.stats.count || 3) + Math.floor((this.level - 1) * (this.stats.countScaling || 0.5));
        const spread = Math.PI / 4;

        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const baseAngle = Math.atan2(dir.y, dir.x);

        for (let i = 0; i < count; i++) {
            const offset = count > 1 ? -spread / 2 + (spread / (count - 1)) * i : 0;
            const angle = baseAngle + offset;

            const velocity = {
                x: Math.cos(angle) * this.speed * (this.owner as any).stats.speed,
                y: Math.sin(angle) * this.speed * (this.owner as any).stats.speed
            };

            const proj = new Projectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * (this.owner as any).stats.duration,
                (this.owner as any).getDamage(this.damage).damage,
                this.pierce,
                this.projectileEmoji
            );
            this.onSpawn(proj);
        }
    }

    upgrade() {
        this.level++;
        this.damage *= this.stats.damageScaling;
    }
}
