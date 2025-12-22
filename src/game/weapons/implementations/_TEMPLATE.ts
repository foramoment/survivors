/**
 * WEAPON TEMPLATE
 * 
 * Copy this file to create a new weapon.
 * Replace all [PLACEHOLDERS] with actual values.
 * 
 * Steps:
 * 1. Copy this file as [WeaponName]Weapon.ts
 * 2. Replace placeholders
 * 3. Add export to index.ts
 * 4. Add entry to GameData.ts WEAPON_STATS
 * 5. Add to CLASSES weapon options in GameData.ts
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { Projectile, Zone as _Zone } from '../base';
import { WEAPON_STATS } from '../../data/GameData';
import { levelSpatialHash } from '../../core/SpatialHash';

export class TemplateWeapon extends Weapon {
    // === BASIC INFO ===
    name = "[WEAPON NAME]";      // Display name
    emoji = "[EMOJI]";           // Icon: 🔫 ⚔️ 💥 ❄️ ⚡ etc
    description = "[DESCRIPTION]";

    private stats = WEAPON_STATS['[weapon_id]']; // Match WEAPON_STATS key

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        // this.speed = this.stats.speed;     // For projectile weapons
        // this.duration = this.stats.duration; // For zones/projectiles
    }

    // === MAIN UPDATE LOOP ===
    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            // Find target (closest enemy in range)
            let target: Entity | null = null;
            let minDst = this.area * (this.owner as any).stats.area;

            const searchRadius = this.area * (this.owner as any).stats.area;
            const potentialTargets = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of potentialTargets) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);

                // Evolved version might have different cooldown
                const cdMultiplier = this.evolved ? 1.5 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
            }
        }
    }

    // === FIRE METHOD ===
    fire(target: Entity) {
        const { damage } = (this.owner as any).getDamage(this.damage);
        const isEvolved = this.evolved;

        if (isEvolved) {
            // === EVOLVED BEHAVIOR ===
            // Example: Create a zone
            // const zone = new EvolvedZone(target.pos.x, target.pos.y, damage);
            // this.onSpawn(zone);
        } else {
            // === NORMAL BEHAVIOR ===
            // Example: Spawn a projectile
            const dir = {
                x: target.pos.x - this.owner.pos.x,
                y: target.pos.y - this.owner.pos.y
            };
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

            const speed = 300 * (this.owner as any).stats.speed;
            const velocity = { x: (dir.x / len) * speed, y: (dir.y / len) * speed };

            const proj = new Projectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                1.0, // duration
                damage,
                1,   // pierce
                '💫' // emoji
            );
            this.onSpawn(proj);
        }
    }

    // === UPGRADE BEHAVIOR ===
    // Uses base class upgrade() which:
    // - Increments level
    // - Sets evolved = true at level 6
    // - Multiplies damage by 1.2x

    // === DRAW (usually empty for weapons) ===
    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}
