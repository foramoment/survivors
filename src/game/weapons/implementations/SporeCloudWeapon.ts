/**
 * SPORE CLOUD WEAPON
 * Leaves damaging zone at player position.
 */
import { ZoneWeapon, SporeZone } from '../base';
import type { Player } from '../../entities/Player';

export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "";
    interval = 1;

    readonly stats = {
        damage: 10,
        cooldown: 2,
        area: 50,
        speed: 0,
        duration: 5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.duration = this.stats.duration;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    spawnZone() {
        const baseInterval = Math.max(0.1, this.interval - this.owner.stats.tick);

        const { damage } = this.owner.getDamage(this.damage);

        const zone = new SporeZone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * this.owner.stats.area,
            this.duration * this.owner.stats.duration,
            damage,
            Math.max(0.01, baseInterval)
        );
        this.onSpawn(zone);
    }
}
