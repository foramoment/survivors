/**
 * SPORE CLOUD WEAPON
 *
 * Drops a fungal patch under the player: light contact damage, but everything
 * that walks through gets *infected* and keeps taking damage after it leaves
 * (core/StatusEffects). The zone is the delivery mechanism, the infection is
 * the weapon.
 *
 * Evolved — Fungal Bloom: the infection turns contagious. An infected host
 * that dies bursts and infects its neighbours (up to three generations), so a
 * single patch can roll through a whole pack. The patch also keeps growing and
 * sprouts more mushrooms as it does.
 */
import { ZoneWeapon, SporeZone } from '../base';
import type { Player } from '../../entities/Player';

// ============================================
// FUNGAL BLOOM ZONE - Contagious patch that creeps faster
// ============================================

/**
 * The evolved patch is the same organism, growing harder: every SporeZone
 * creeps now (see the base class), the bloom just does it twice as fast and
 * spreads its infection from the dead.
 *
 * It used to also stroke a dashed ellipse around itself to mark "the infectious
 * edge". That was a HUD element drawn into the world, and the patch's own edge
 * already says the same thing.
 */
export class FungalBloomZone extends SporeZone {
    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval);
        this.contagious = true;
        this.creepRate = 0.14;
    }
}

export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Fungal patch that infects anything walking through it.";
    zoneEmoji = "";
    interval = 1;

    readonly stats = {
        damage: 10,
        cooldown: 4,
        area: 50,
        speed: 0,
        duration: 3,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.duration = this.stats.duration;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    /**
     * The patch itself gets bigger with every level, not just harder-hitting.
     *
     * Standard weapon upgrades only touch damage, and area comes from powerups —
     * but a fungal patch that never grows is a patch enemies can walk around,
     * so its whole delivery mechanism stops working as the crowd gets thicker.
     * +8% per level compounds with the area powerups rather than replacing them.
     */
    private zoneRadius(): number {
        return this.area * this.owner.stats.area * (1 + (this.level - 1) * 0.08);
    }

    spawnZone() {
        const baseInterval = Math.max(0.1, this.interval * this.owner.stats.cooldown);
        const radius = this.zoneRadius();

        if (this.evolved) {
            const zone = new FungalBloomZone(
                this.owner.pos.x,
                this.owner.pos.y,
                radius,
                this.stats.duration * this.owner.stats.duration * 2,
                this.damage * 0.6,
                baseInterval
            );
            // Contact damage is halved; the infection is where the damage went
            zone.infectDps = this.damage * 0.75;
            zone.infectDuration = 5;
            zone.source = this;
            this.onSpawn(zone);
        } else {
            const zone = new SporeZone(
                this.owner.pos.x,
                this.owner.pos.y,
                radius,
                this.duration * this.owner.stats.duration,
                this.damage * 0.6,
                baseInterval
            );
            zone.infectDps = this.damage * 0.45;
            zone.infectDuration = 3;
            zone.source = this;
            this.onSpawn(zone);
        }
    }
}
