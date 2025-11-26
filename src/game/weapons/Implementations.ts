import { ProjectileWeapon, ZoneWeapon, ExplodingProjectile, Zone, BouncingProjectile, ChainLightning, Beam } from './WeaponTypes';

// 1. Void Ray
export class VoidRayWeapon extends ProjectileWeapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a beam at nearest enemy.";
    projectileEmoji = "🟣";
    pierce = 1;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.5;
        this.damage = 15;
        this.speed = 0; // Instant
    }

    fire(target: any) {
        // Instant damage
        const dmg = this.damage * (this.owner as any).stats.might;
        target.takeDamage(dmg);
        this.onDamage(target.pos, dmg);

        // Visual beam
        // Glowing purple beam
        const beam = new Beam(this.owner.pos, target.pos, 0.2, '#bd00ff', 4);
        this.onSpawn(beam);
    }
}

// 2. Plasma Katana (Implemented as Zone for simplicity or short range projectile)
// Let's make it a short range projectile that moves with player? 
// Or just a Zone that appears in front.
// For simplicity, let's make it a Projectile that goes towards mouse or nearest?
// "Slashes in front of player"
export class PlasmaKatanaWeapon extends ProjectileWeapon {
    name = "Plasma Katana";
    emoji = "⚔️";
    description = "Slashes nearest enemy.";
    projectileEmoji = "⚡";
    pierce = 999;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.2;
        this.damage = 25;
        this.speed = 500;
        this.duration = 0.2; // Short range
        this.area = 150; // Detection range
    }
}

// 3. Autocannon
export class AutocannonWeapon extends ProjectileWeapon {
    name = "Autocannon";
    emoji = "🤖";
    description = "Rapid fire projectiles.";
    projectileEmoji = "🔸";
    pierce = 0;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 0.3;
        this.damage = 8;
        this.speed = 600;
    }
}

// 4. Nanobot Swarm (Zone)
export class NanobotSwarmWeapon extends ZoneWeapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Damaging aura around player.";
    zoneEmoji = "🌫️";
    interval = 1; // tick-based damage

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.duration = 2;
        this.damage = 5;
        this.area = 80;
    }
}

// 5. Spore Cloud (Zone)
export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "🤢";
    interval = 1; // tick-based damage

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2;
        this.duration = 5;
        this.damage = 10;
        this.area = 50;
    }
}

// 6. Singularity Orb
export class SingularityOrbWeapon extends ProjectileWeapon {
    name = "Singularity Orb";
    emoji = "⚫";
    description = "Slow moving orb of destruction.";
    projectileEmoji = "⚫";
    pierce = 999;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 4;
        this.damage = 50;
        this.speed = 50; // Changed from 100 to 50 (2x slower)
        this.area = 600; // Max range
        this.duration = 12; // 600 / 50 = 12 seconds max travel time
    }
}

// 7. Rocket Salvo
export class RocketSalvoWeapon extends ProjectileWeapon {
    name = "Rocket Salvo";
    emoji = "🚀";
    description = "Fires missiles.";
    projectileEmoji = "🚀";
    pierce = 0;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.5;
        this.damage = 30;
        this.speed = 300;
    }

    // Override fire to create exploding projectiles
    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const projectile = new ExplodingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            this.damage * (this.owner as any).stats.might,
            this.pierce,
            this.projectileEmoji,
            60, // Explosion radius
            this.damage * 0.5 * (this.owner as any).stats.might // Explosion damage = 50% of direct hit
        );

        // Set explosion callback
        projectile.onExplode = (x: number, y: number, radius: number, damage: number) => {
            const zone = new Zone(x, y, radius, 0.3, damage, 0.1, '💥');
            this.onSpawn(zone);
        };

        this.onSpawn(projectile);
    }
}



// 8. Mind Blast (Zone)
export class MindBlastWeapon extends ZoneWeapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Explosion at enemy location.";
    zoneEmoji = "💥";
    interval = 1; // tick-based damage

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.duration = 0.5;
        this.damage = 10; // Reduced from 40 (4x reduction)
        this.area = 100;
    }
}

// 9. Chrono Disc - Bouncing disc that ricochets between enemies
export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 0; // Doesn't pierce, bounces instead

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.5;
        this.damage = 2.67; // Reduced by 3x from 8
        this.speed = 500;
        this.duration = 5;
    }

    // Override fire to create bouncing projectiles
    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        // Bounces = 5 + level (starts at 6 bounces, +1 per level)
        const bounces = 5 + this.level;

        const projectile = new BouncingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            this.damage * (this.owner as any).stats.might,
            bounces,
            this.projectileEmoji,
            400 // Bounce range
        );

        this.onSpawn(projectile);
    }

    upgrade() {
        this.level++;
        this.damage *= 1.15; // Smaller damage increase
    }
}


// 10. Acid Spit
export class AcidSpitWeapon extends ProjectileWeapon {
    name = "Acid Spit";
    emoji = "🧪";
    description = "Corrosive projectile.";
    projectileEmoji = "🟢";
    pierce = 0;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.0;
        this.damage = 12;
        this.speed = 450;
    }
}

// 11. Lightning Chain - Chains between enemies
export class LightningChainWeapon extends ProjectileWeapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Lightning that chains between enemies.";
    projectileEmoji = "⚡";
    pierce = 3; // Number of chains per attack

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.0;
        this.damage = 15;
        this.speed = 0; // Instant
        this.duration = 0.3;
    }

    fire(target: any) {
        const dmg = this.damage * (this.owner as any).stats.might;

        // 1. Hit first target immediately
        target.takeDamage(dmg);
        this.onDamage(target.pos, dmg);

        // 2. Visual beam from player to first target
        const beam = new Beam(this.owner.pos, target.pos, 0.1, '#ffff00', 2);
        this.onSpawn(beam);

        // 3. Start chain logic
        // Bounces = 5 + weapon level
        const bounces = 5 + this.level;

        const chain = new ChainLightning(target.pos.x, target.pos.y, dmg, bounces);
        chain.hitEnemies.add(target); // Don't bounce back to first target immediately

        chain.onHit = (t: any, d: number) => {
            t.takeDamage(d);
            this.onDamage(t.pos, d);
        };

        this.onSpawn(chain);
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
        // Bounces increase automatically via level usage in fire()
    }
}

// 12. Flame Whip - Short range burning attacks
export class FlameWhipWeapon extends ProjectileWeapon {
    name = "Flame Whip";
    emoji = "🔥";
    description = "Burning melee strikes.";
    projectileEmoji = "🔥";
    pierce = 2;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 0.8;
        this.damage = 20;
        this.speed = 600;
        this.duration = 0.3; // Short range
    }
}

