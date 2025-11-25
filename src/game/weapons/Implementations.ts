import { ProjectileWeapon, ZoneWeapon, ExplodingProjectile, Zone, BouncingProjectile } from './WeaponTypes';

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
        this.speed = 400;
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
    interval = 0.5;

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
    interval = 1;

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
    interval = 0.1; // Instant damage mostly

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.duration = 0.5;
        this.damage = 40;
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
        this.damage = 8; // Low damage, but bounces multiple times
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

        // Bounces = 1 + level (starts at 1 bounce, +1 per level)
        const bounces = 1 + (this.level - 1);

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
