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
        // The bloom does not just infect harder, it takes more ground — but it
        // used to double on top of a per-level radius bonus AND the area
        // powerups, and three multipliers on one circle put a maxed mat at 517
        // radius, which is taller than the screen. Two of the three are gone;
        // this one stays because watching the mould take ground is the weapon.
        this.growOver(1, 1.6);
    }
}

export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Fungal patch that infects anything walking through it.";
    zoneEmoji = "";
    interval = 1;

    /**
     * How many mats the colony can sustain at once — the whole balance of this
     * weapon now sits on this number.
     *
     * A mat lived up to 48 seconds against a 2.4 second cooldown, so a maxed
     * build had **twenty** of them down at once, each one screen-sized. That is
     * not a weapon with a big area, it is a floor: every enemy on the arena
     * stood in eight or ten overlapping patches, and the weapon reported 66% of
     * all damage in the run that prompted this.
     *
     * Capping live mats is the same fix Frost Nova got when three novas
     * overlapping turned the arena permanently slow ("that is not a weapon, it
     * is wallpaper"), and the same shape as Teemo's shrooms: the ground you own
     * is limited, so *where* you put it is the decision. The weapon holds fire
     * at the cap rather than queueing, so the cooldown never banks patches to
     * dump later.
     */
    private static readonly MAX_MATS = 2;
    private static readonly MAX_MATS_EVOLVED = 3;

    /**
     * Seconds of extra life a mat may bank from kills: `2 + level`, capped.
     *
     * It used to be a multiple of the mat's own life (`life * (0.5 + level/2)`,
     * so 3.5x at level 6) which compounded with `duration` powerups and with
     * everything else — a maxed mat could bank 37 seconds on top of 10. In flat
     * seconds the ceiling is a number you can hold in your head, and it does
     * not move when the rest of the build does.
     */
    private static readonly BUDGET_CAP = 8;

    readonly stats = {
        // Raised 10 -> 16 against the mat cap above. The weapon lost most of
        // its output to having a tenth as many patches down; the patches that
        // remain should be worth standing on. This is a deliberate
        // under-compensation — the run that forced this is the measurement, and
        // the next one decides whether 16 is right.
        damage: 16,
        cooldown: 4,
        area: 50,
        speed: 0,
        duration: 3,
    };

    /** Mats currently on the ground, oldest first */
    private mats: SporeZone[] = [];

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.duration = this.stats.duration;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    /**
     * The mat is the size the weapon and the area powerups say, and nothing
     * else.
     *
     * There used to be a +8% per level term here as well. It was written when
     * levelling this weapon bought nothing but damage, and the comment right
     * below it already argued the replacement — the mycelium feeding on its own
     * kills is what a level buys. The bonus stayed anyway, and it multiplied
     * with `stats.area` and with the bloom's growth ramp until a maxed patch
     * reached 517 radius. Three multipliers on one circle is how an area weapon
     * stops having an area.
     */
    private zoneRadius(): number {
        return this.area * this.owner.stats.area;
    }

    /**
     * Seconds a mat may bank from kills. This is what levelling this weapon
     * actually buys.
     *
     * The mycelium feeding on what it kills is the one behaviour that makes
     * this weapon play differently from everything else in the pool: every
     * other weapon fires and forgets, and this one holds ground for as long as
     * the ground keeps paying. It is also the mechanic the mat cap protects —
     * with only two or three patches down, "how long does this one last" is a
     * decision about where you are willing to stand, not a way to carpet the
     * floor.
     *
     * Flat seconds, so the ceiling does not move with the rest of the build:
     * a mat cannot outlive `life + BUDGET_CAP`, however many bodies fall on it.
     */
    private extensionBudget(): number {
        return Math.min(SporeCloudWeapon.BUDGET_CAP, 2 + this.level);
    }

    /** Live mats the colony is currently sustaining */
    private matCap(): number {
        return this.evolved ? SporeCloudWeapon.MAX_MATS_EVOLVED : SporeCloudWeapon.MAX_MATS;
    }

    /**
     * Hold fire while the colony is full.
     *
     * Same shape as Frost Nova's single field, one step looser: the cooldown is
     * not what limits this weapon any more, the ground is. Parking the cooldown
     * at zero rather than letting it run negative means a rotted mat is
     * replaced on the next frame instead of instantly *and* three more behind
     * it — banking spawns is how a rate limit turns into a burst.
     */
    update(dt: number) {
        for (let i = this.mats.length - 1; i >= 0; i--) {
            if (this.mats[i].isDead) this.mats.splice(i, 1);
        }

        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        if (this.mats.length >= this.matCap()) {
            this.cooldown = 0;
            return;
        }

        this.spawnZone();
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
    }

    spawnZone() {
        const baseInterval = Math.max(0.1, this.interval * this.owner.stats.cooldown);
        const radius = this.zoneRadius();

        let zone: SporeZone;
        if (this.evolved) {
            const life = this.stats.duration * this.owner.stats.duration * 2;
            zone = new FungalBloomZone(
                this.owner.pos.x,
                this.owner.pos.y,
                radius,
                life,
                this.damage * 0.6,
                baseInterval
            );
            // Contact damage is cut; the infection is where the damage went
            zone.infectDps = this.damage * 0.9;
            zone.infectDuration = 5;
        } else {
            const life = this.duration * this.owner.stats.duration;
            zone = new SporeZone(
                this.owner.pos.x,
                this.owner.pos.y,
                radius,
                life,
                this.damage * 0.6,
                baseInterval
            );
            zone.infectDps = this.damage * 0.55;
            zone.infectDuration = 3;
        }

        zone.extensionBudget = this.extensionBudget();
        zone.source = this;
        this.mats.push(zone);
        this.onSpawn(zone);
    }
}
