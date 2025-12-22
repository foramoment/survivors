/**
 * SPORE CLOUD WEAPON
 * Leaves damaging zone at player position.
 */
import { ZoneWeapon, SporeZone } from '../base';

export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "";
    interval = 1;

    static readonly CONFIG = {
        damage: 10,
        cooldown: 2,
        area: 50,
        speed: 0,
        duration: 5,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = SporeCloudWeapon.CONFIG.cooldown;
        this.duration = SporeCloudWeapon.CONFIG.duration;
        this.damage = SporeCloudWeapon.CONFIG.damage;
        this.area = SporeCloudWeapon.CONFIG.area;
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

    // Uses base class upgrade()
}
