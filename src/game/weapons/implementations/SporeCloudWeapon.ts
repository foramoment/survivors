/**
 * SPORE CLOUD WEAPON
 * Leaves damaging zone at player position.
 */
import { ZoneWeapon, SporeZone } from '../base';
import { WEAPON_STATS } from '../../data/GameData';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, speed: 0, duration: 1.0
    };
}

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

    // Uses base class upgrade()
}
