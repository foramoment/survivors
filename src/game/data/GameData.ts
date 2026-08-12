import {
    VoidRayWeapon, PhantomSlashWeapon, PlasmaCannonWeapon, NanobotSwarmWeapon,
    SporeCloudWeapon, SingularityOrbWeapon, OrbitalStrikeWeapon, MindBlastWeapon,
    ChronoDiscWeapon, AcidPoolWeapon, LightningChainWeapon, SpinningEmberWeapon,
    FrostNovaWeapon, PlasmaGrenadeWeapon
} from '../weapons/implementations';

/**
 * Playable characters.
 *
 * There used to be fourteen, one per weapon, so "choosing a character" was
 * really "choosing a starting weapon" and every class was a tinted copy of the
 * same astronaut. Six is the number that lets each one have its own pixel
 * silhouette (see data/CharacterSprites), a starting weapon that plays
 * differently from the others, and a growth stat of its own. The other eight
 * weapons did not go anywhere — they are still in the level-up pool, they just
 * are not starting weapons.
 *
 * `perLevel` is applied on every level-up, so a class keeps mattering for the
 * whole run instead of being a stat block you forget by minute two. ~1% per
 * level lands around +50% over a full clear — noticeable, but not enough to
 * out-scale the powerups you pick.
 *
 * `id` is the stable key for translations, sprites and save data.
 */
export interface ClassPerLevel {
    /** Key in Player.stats, or the special-cased `maxHp` */
    stat: string;
    /** Signed: cooldown wants a negative value */
    value: number;
}

/**
 * A class bonus line must list **everything** the class actually starts with.
 * These used to be a rough summary — the Astro Biologist's +10% area and the
 * Berserker's +10% damage were simply missing, and "Might +15%" told a Storm
 * Mage player nothing, because the stat is called `might` in the code and
 * "damage" in the player's head.
 *
 * No class grants move speed any more. The player already outruns the fastest
 * enemy by 60% at base, so a class-wide head start on top of that was the
 * difference between kiting and being untouchable.
 */
export const CLASSES = [
    {
        id: 'void_walker', name: "Void Walker", emoji: "🌑",
        bonus: "Damage +10% · +1% damage per level",
        weaponId: 'void_ray', hp: 90,
        stats: { might: 1.1 },
        perLevel: { stat: 'might', value: 0.01 } as ClassPerLevel,
    },
    {
        id: 'cyber_samurai', name: "Cyber Samurai", emoji: "🤖",
        bonus: "Crit chance 15% · +1% crit damage per level",
        weaponId: 'phantom_slash', hp: 85,
        stats: { critChance: 0.15 },
        perLevel: { stat: 'critDamage', value: 0.01 } as ClassPerLevel,
    },
    {
        id: 'exo_marine', name: "Exo Marine", emoji: "🛡️",
        bonus: "Armor +2 · +1% max HP per level",
        weaponId: 'orbital_strike', hp: 130,
        // Armour is a curve now, `K / (armour + K)`, but K was chosen so the
        // familiar values still read right: +2 is ~17% off all contact damage,
        // which is two Void Shield picks.
        stats: { armor: 2 },
        perLevel: { stat: 'maxHp', value: 0.01 } as ClassPerLevel,
    },
    {
        // Regen kept in step with the Nano-Repair stack: one pick's worth.
        id: 'astro_biologist', name: "Astro Biologist", emoji: "🧬",
        bonus: "Regen 1%/s of missing HP, Area +10% · +1% area per level",
        weaponId: 'spore_cloud', hp: 95,
        stats: { regen: 0.01, area: 1.1 },
        perLevel: { stat: 'area', value: 0.01 } as ClassPerLevel,
    },
    {
        // Mind Blast rather than Lightning Chain: an AoE stun on a shrinking
        // cooldown is the one pairing where this class's −1%/level actually
        // changes how the run plays, instead of just firing the same bolt more
        // often. It is safe to hand out because stun has a hard downtime rule
        // (core/StatusEffects): an enemy is frozen at most a third of the time
        // no matter how much cooldown the Mage stacks.
        id: 'storm_mage', name: "Storm Mage", emoji: "⚡",
        bonus: "Damage +15% · −1% cooldown per level",
        weaponId: 'mind_blast', hp: 75,
        stats: { might: 1.15 },
        perLevel: { stat: 'cooldown', value: -0.01 } as ClassPerLevel,
    },
    {
        // Deliberately spare: the biggest HP pool in the game paired with
        // negative armour, so it survives by being enormous rather than by
        // being careful. It carried Adrenal Surge as a signature tactic until
        // that perk was removed.
        id: 'berserker', name: "Berserker", emoji: "🔥",
        bonus: "HP +50%, Damage +10%, Armor −2 · +1% crit chance per level",
        weaponId: 'spinning_ember', hp: 150,
        // Negative armour runs through the same curve and comes out at +25%
        // damage taken. It is clamped well short of the pole at -K, so no stack
        // of debuffs can ever flip the sign (see armorMultiplier).
        stats: { armor: -2, might: 1.1 },
        perLevel: { stat: 'critChance', value: 0.01 } as ClassPerLevel,
    },
    {
        /**
         * The seventh class exists to give the Singularity Orb an owner.
         *
         * It was the strongest weapon left unclaimed, and it is the only one
         * that plays the game backwards: every other weapon is about surviving
         * the crowd, and the orb is about *making* one. So the stats support
         * that and nothing else — a wider event horizon, a longer hold, and
         * just enough armour to stand next to the pile you just gathered.
         *
         * Deliberately NOT given damage or crit: the Warden's payoff is that
         * everything else you own gets to hit a crowd standing still in one
         * spot, which is worth more than any number this line could add.
         */
        id: 'null_warden', name: "Null Warden", emoji: "🕳️",
        bonus: "Area +15%, Armor +1 · +1% effect duration per level",
        weaponId: 'singularity_orb', hp: 105,
        stats: { area: 1.15, armor: 1 },
        perLevel: { stat: 'duration', value: 0.01 } as ClassPerLevel,
    },
];

/**
 * Powerups stack FLAT: every pick of the same card is worth exactly `value`,
 * and `maxStacks` says how many picks it takes before the card stops being
 * offered.
 *
 * It used to be a 25%-per-stack compounding curve with one shared cap of 8,
 * which meant every powerup was secretly worth **19.8x its base value** by the
 * time it was maxed. That is where "+18% duration" turned into +357% and every
 * zone in the game could be kept up permanently; where +10% move speed turned
 * into +198% and nothing could ever touch the player; and where two of the
 * cards (Rapid Tick, Cooling System) hit an internal floor several picks before
 * their cap and then did literally nothing while still promising a bonus.
 *
 * Flat + a cap per card is the Vampire Survivors model: you can read the
 * ceiling off the card, a maxed stat is done, and the pool moves on to
 * something else. A card can still opt back into a curve with `stackGrowth`.
 */
export interface PowerupData {
    /** Stable key for translations (see data/locales) */
    id: string;
    name: string;
    description: string;
    /** Key in Player.stats (plus the special-cased `maxHp`) */
    type: string;
    /** Worth of ONE pick. Flat unless `stackGrowth` says otherwise. */
    value: number;
    emoji: string;
    /** Per-stack multiplier. Omit for flat stacking (the default). */
    stackGrowth?: number;
    /** How many times this powerup can be taken. Always set it. */
    maxStacks: number;
}

export const POWERUPS: PowerupData[] = [
    // Basic
    // A fraction of MISSING health per second, and only out of combat (see
    // REGEN_COMBAT_DELAY).
    //
    // 1% of missing per stack, capped at three picks.
    //
    // **The cap does the balancing, not the per-stack value.** A previous cut
    // solved for "a quarter to three quarters in exactly one minute" and landed
    // on 0.35% a stack, which could not even render: `Math.round(0.0035 * 100)`
    // is 0, so the card offered "+0%" and previewed "0% → 0%". A number a
    // percentage cannot express is a number the player cannot reason about, and
    // that is a good enough reason on its own to keep it round.
    //
    // At the cap (plus the Astro Biologist's pick-equivalent) that is a quarter
    // to three quarters in roughly half a minute of going untouched. Health is
    // a budget for the whole run (see core/ContactDamage), so regen is a
    // trickle that rewards clearing your space — the "oh god I'm dying / oh
    // thank god" swing belongs to repair cells, which are flat, instant, and
    // work while enemies are still on you.
    { id: 'nano_repair', name: "Nano-Repair", description: "Hull nanites knit you back together between fights", type: "regen", value: 0.01, maxStacks: 3, emoji: "❤️" },
    // Crit starts at 0%, so this is the only way to build it (bar the Samurai's
    // 15%). 40% at the cap makes crit a direction you commit to rather than a
    // certainty you trip over — the old curve reached a guaranteed crit on the
    // seventh pick.
    { id: 'targeting_hud', name: "Targeting HUD", description: "Chance for a hit to land as a critical", type: "critChance", value: 0.05, maxStacks: 8, emoji: "🎯" },
    // Still the tightest cap in the pool — raw damage multiplies with
    // everything else you own, so it decides whether the late game is a fight
    // or a formality. +36% over six picks.
    //
    // The first cut of this was Vampire Survivors' exact number (+5% x5), but
    // that game spreads its damage across many more sources; here the only
    // three are this, crit and weapon level, so Might carries more of the load
    // and 25% left nothing to build toward.
    { id: 'plasma_core', name: "Plasma Core", description: "Raw damage amplifier", type: "might", value: 0.06, maxStacks: 6, emoji: "💪" },
    // Also speeds up how often damage zones tick — that used to be its own
    // powerup (Rapid Tick) which hit an internal floor after three picks and
    // then did nothing at all.
    { id: 'cooling_system', name: "Cooling System", description: "Weapons fire and zones tick more often", type: "cooldown", value: -0.05, maxStacks: 8, emoji: "🌬️" },

    // Creative
    //
    // No XP-gain card lives here any more. Vampiric Link (+10% growth a pick,
    // six picks) was the last one, and a bonus to XP has no honest middle
    // setting: it is priced against the level curve, and the curve is the one
    // thing in the game that compounds against itself.
    //
    // On the old geometric curve six picks bought about FIVE levels — strictly
    // a loss, a trap card. On the linear tail (see Player.XP_LINEAR_FROM) the
    // same six buy fourteen, a net +8 picks, which makes it the obvious first
    // card in every run. The fix moved it straight from "dumb" to "mandatory"
    // without ever passing through "a decision", because both of those are the
    // same card seen from either side of break-even.
    { id: 'chain_reaction', name: "Chain Reaction", description: "Bigger blasts, wider zones", type: "area", value: 0.08, maxStacks: 8, emoji: "🎆" },
    // Duration times cooldown reduction is what lets a zone weapon cover the
    // ground permanently. +80% at the cap keeps a puddle worth stacking without
    // turning the arena into a carpet you never have to re-lay.
    { id: 'temporal_flux', name: "Temporal Flux", description: "Effects linger longer", type: "duration", value: 0.1, maxStacks: 8, emoji: "⌛" },
    // Crit damage starts at 2x, so the cap is a clean 4x. It used to reach
    // 7.95x, which — multiplied by a guaranteed crit — was most of the reason
    // late-game enemies evaporated.
    { id: 'berserker_rage', name: "Berserker Rage", description: "Crits hit like a freight train", type: "critDamage", value: 0.25, maxStacks: 8, emoji: "😡" },
    { id: 'barrier_field', name: "Barrier Field", description: "Reinforced hull plating", type: "maxHp", value: 20, maxStacks: 8, emoji: "🔮" },
    // An absorb buffer that refills only out of contact — the rules live in
    // core/Tactics (SHIELD_RECHARGE_DELAY) and Player.shield.
    //
    // **Deliberately tiny: 30 HP over three picks.** A class pool is 75–150,
    // and a measured 15-minute Void Nexus clear took 1374 damage against a 190
    // pool while healing 1261 of it back — sustain is already solved, by three
    // picks of Nano-Repair, on a class with *negative* armour. A generous
    // shield on top of that would not add a decision, it would remove the one
    // the contact model is built to pose.
    //
    // 30 HP is roughly four seconds of a full ring at the numbers in
    // core/ContactDamage: enough to make walking through a crowd a plan
    // instead of a gamble, not enough to make standing in one survivable.
    { id: 'kinetic_deflector', name: "Kinetic Deflector", description: "A buffer that soaks hits and refills once you break away", type: "shield", value: 10, maxStacks: 3, emoji: "💠" },
    // The player already outruns the fastest enemy by a wide margin at base
    // speed, so this is a nudge, not a build: three picks, +15% total. At the
    // old ceiling (+198%) nothing on the map could reach you and the station
    // blackout — which speeds enemies up — stopped meaning anything.
    { id: 'phase_shift', name: "Phase Shift", description: "Move faster between phases", type: "moveSpeed", value: 0.05, maxStacks: 3, emoji: "👻" },
    // Same 1-a-stack it always was, but through a curve now (see ARMOR_K), so
    // eight stacks is 44% off every point of damage and x1.8 effective health.
    // As flat subtraction the maxed card removed 8 from a bite that had grown
    // to 87 — the stat evaporated exactly when it was supposed to matter.
    { id: 'void_shield', name: "Void Shield", description: "Damage reduction that scales", type: "armor", value: 1, maxStacks: 8, emoji: "🌌" },

    // Tactics — these switch a behaviour on instead of nudging a number. Rules
    // and numbers live in core/Tactics.ts. Overclock (+projectile speed) was
    // removed because it was the one powerup whose effect you could not feel;
    // Rapid Tick (+zone tick rate) followed it into Cooling System.
    { id: 'static_discharge', name: "Static Discharge", description: "Damage taken charges a capacitor that blows the crowd off you", type: "discharge", value: 1, maxStacks: 8, emoji: "🔌" },
    // Capped at six: at eight, half of everything you killed was detonating,
    // which is visual noise on top of a perk that already had to be defused
    { id: 'kill_echo', name: "Kill Echo", description: "The dead sometimes detonate and set the survivors alight", type: "killEcho", value: 0.06, maxStacks: 6, emoji: "☠️" },
    // The one damage bonus that cannot feed a cascade: it only ever applies to
    // an opening hit, so it can never help finish anything. See
    // DamageSystem.openerBonus.
    { id: 'first_strike', name: "First Strike", description: "Hit far harder on anything still untouched", type: "firstStrike", value: 0.12, maxStacks: 6, emoji: "🩹" },
    // Capped at five. At eight it is a 20% drop chance, and a twenty-minute run
    // kills enough to turn that into 3-4 HP/s of free sustain — four times what
    // maxed regen gives, on a perk that is not supposed to be the regen perk.
    { id: 'vital_siphon', name: "Vital Siphon", description: "Kills sometimes leave a repair cell behind", type: "siphon", value: 0.025, maxStacks: 5, emoji: "💗" },
    // Hard-capped at two: every level-up already comes with one free reroll, and
    // past three the draw stops being a decision and becomes a menu you shop in
    { id: 'extra_roll', name: "Spare Cartridge", description: "One more reroll on every level-up", type: "reroll", value: 1, maxStacks: 2, emoji: "🎲" },
];

export const WEAPONS = [
    {
        id: 'void_ray',
        name: "Void Bolt",
        emoji: "🔫",
        description: "Punches through a column and tears a rip where it stops",
        class: VoidRayWeapon,
        evolution: {
            name: "Void Volley",
            emoji: "💜",
            description: "Three bolts in a fan, deeper punch-through, wider rips"
        }
    },
    {
        id: 'phantom_slash',
        name: "Phantom Slash",
        emoji: "⚔️",
        description: "Cuts harder the more enemies are pressed against you",
        class: PhantomSlashWeapon,
        evolution: {
            name: "Dimensional Blade",
            emoji: "🗡️",
            description: "Every cut tears a rift that slows and grinds"
        }
    },
    {
        id: 'plasma_cannon',
        name: "Plasma Cannon",
        emoji: "🔋",
        description: "Heavy round that bursts on impact into igniting shards",
        class: PlasmaCannonWeapon,
        evolution: {
            name: "Fusion Core",
            emoji: "⚛️",
            description: "Every shard that bites bursts into more shards"
        }
    },
    {
        id: 'nanobot_swarm',
        name: "Nanobot Swarm",
        emoji: "🦠",
        description: "Aura of nanites with drones that lunge at what comes close",
        class: NanobotSwarmWeapon,
        evolution: {
            name: "Nanite Hive",
            emoji: "☣️",
            description: "Twice the drones, and every strike seeds a nanite rot"
        }
    },
    {
        id: 'spore_cloud',
        name: "Spore Cloud",
        emoji: "🍄",
        description: "Fungal patch that infects, and widens with every level",
        class: SporeCloudWeapon,
        evolution: {
            name: "Fungal Bloom",
            emoji: "🍄‍🟫",
            description: "The infection turns contagious and spreads from the dead"
        }
    },
    {
        id: 'singularity_orb',
        name: "Singularity Orb",
        emoji: "⚫",
        description: "Slow orb that drags everything toward it",
        class: SingularityOrbWeapon,
        evolution: {
            name: "Black Hole",
            emoji: "🕳️",
            description: "Collapses into an event horizon, then implodes"
        }
    },
    {
        id: 'orbital_strike',
        name: "Orbital Strike",
        emoji: "🛰️",
        description: "Marks a spot, then drops a kinetic round on it",
        class: OrbitalStrikeWeapon,
        evolution: {
            name: "Orbital Barrage",
            emoji: "☄️",
            description: "A wall of shells walked across the crowd, then one heavy round"
        }
    },
    {
        id: 'mind_blast',
        name: "Mind Blast",
        emoji: "🧠",
        description: "Psionic detonation that stuns everything it catches",
        class: MindBlastWeapon,
        evolution: {
            name: "Psychic Cascade",
            emoji: "🌀",
            description: "The blast jumps from mind to mind, stunning as it goes"
        }
    },
    {
        id: 'chrono_disc',
        name: "Chrono Disc",
        emoji: "💿",
        description: "Ricochet saw that bounces between enemies",
        class: ChronoDiscWeapon,
        evolution: {
            name: "Time Shatter",
            emoji: "⏰",
            description: "Cuts stack into a wound that bleeds"
        }
    },
    {
        id: 'acid_pool',
        name: "Acid Pool",
        emoji: "🧪",
        description: "Corrodes a crowd so everything else hits it harder",
        class: AcidPoolWeapon,
        evolution: {
            name: "Toxic Deluge",
            emoji: "☢️",
            description: "Three flasks, deeper corrosion and a lingering acid burn"
        }
    },
    {
        id: 'lightning_chain',
        name: "Lightning Chain",
        emoji: "⚡",
        description: "A bolt from the sky arcs between nearby enemies",
        class: LightningChainWeapon,
        evolution: {
            name: "Thunderstorm",
            emoji: "🌩️",
            description: "Slower arcs that leave crackling static fields"
        }
    },
    {
        id: 'spinning_ember',
        name: "Blood Cleaver",
        emoji: "🔥",
        description: "A heavy sweep. Hits harder up close, and harder still the more health you are missing",
        class: SpinningEmberWeapon,
        evolution: {
            name: "Ruin",
            emoji: "🌋",
            description: "The sweep lands twice and sets what it cuts alight"
        }
    },
    {
        id: 'frost_nova',
        name: "Frost Nova",
        emoji: "❄️",
        description: "Chilling field dropped on the thickest part of the crowd",
        class: FrostNovaWeapon,
        evolution: {
            name: "Absolute Zero",
            emoji: "🧊",
            description: "Freezes the pack solid on impact, holds it, then shatters"
        }
    },
    {
        id: 'plasma_grenade',
        name: "Plasma Grenade",
        emoji: "💣",
        description: "Grenades that blow up and concuss whatever they catch",
        class: PlasmaGrenadeWeapon,
        evolution: {
            name: "Cluster Bomb",
            emoji: "💥",
            description: "Three canisters, longer concussion, chained secondaries"
        }
    },
];



// ⚙️ Конфигурация врагов — измени эти значения для балансировки
//
// ВАЖНО: `damage` — это урон В СЕКУНДУ, пока враг стоит на игроке
// (см. core/ContactDamage). Раньше он не применялся вообще — любой враг бил
// ровно на 1, — поэтому кривая ×1.5 за тир никогда не проверялась в бою.
// При включённом уроне последние тиры давали 100+ урона в секунду, то есть
// мгновенную смерть, так что множитель снижен до ×1.22:
//   5, 6, 7, 9, 11, 13, 16, 20, 24, 30, 36
// Поверх ложится масштаб времени/сложности (DifficultyDirector) и стейджа.
export const ENEMY_CONFIG = {
    // Rebased from 10 when GLOBAL_DAMAGE was deleted from DamageSystem. Every
    // point of player damage used to be silently doubled, so enemy health was
    // written in half-points; halving it here keeps every time-to-kill in the
    // game exactly where it was and makes the numbers on screen mean what the
    // weapon cards say. Do not "restore" this without reading DamageSystem.
    baseHp: 5,            // Базовое HP первого врага
    hpMultiplier: 2,      // Множитель HP для каждого следующего (x2)
    // Contact damage per second, and it is deliberately TINY and nearly flat.
    //
    // This column used to read 5 and climb x1.22 a tier, and then GameManager
    // multiplied it again by run time, adaptive intensity and stage damageScale
    // — x33 end to end, against a player pool that grows about x1.2. That is
    // the whole reason contact damage was rewritten four times; see
    // core/ContactDamage for the argument, and do not "restore" these numbers
    // without reading it.
    //
    // Health is a budget for the entire run. Late game escalates through enemy
    // count and health (hpMultiplier, hpScale, spawn rate), which is what
    // DifficultyDirector was always documented as doing.
    //
    // **This is the one dial for how scary contact is.** Nothing else multiplies
    // it, which is the entire point of the rework — if the game feels soft, this
    // number goes up and everything follows.
    //
    // It went 1 ("I am not afraid of the enemies at all") -> 1.5 -> 2.2, and the
    // last step came with the crowd term changing from a sum to a square root.
    // Those two belong together: under linear stacking there was no value that
    // worked, because anything that made a lone enemy worth respecting made a
    // pile of twenty instant death. Compressing the crowd is what freed this
    // number to be big enough for one body to matter. Do not raise one without
    // looking at the other.
    baseDamage: 2.2,      // Контактный урон в секунду у первого врага
    damageMultiplier: 1.08, // Множитель урона для каждого следующего
    baseXp: 1,            // Базовый XP первого врага
    xpMultiplier: 1.5,    // Множитель XP для каждого следующего (x1.5)
    baseSpeed: 100,       // Базовая скорость
};

// Шаблоны врагов — только имя, эмоджи и модификатор скорости
const ENEMY_TEMPLATES = [
    { name: "Void Bat", emoji: "🦇", speedMod: 1.0 },
    { name: "Scout Drone", emoji: "🛸", speedMod: 0.8 },
    { name: "Xeno Spider", emoji: "🕷️", speedMod: 0.7 },
    { name: "Alien Grunt", emoji: "👾", speedMod: 0.9 },
    { name: "Mech Trooper", emoji: "🤖", speedMod: 0.6 },
    { name: "Asteroid Golem", emoji: "🪨", speedMod: 0.4 },
    { name: "Void Wraith", emoji: "🌀", speedMod: 1.1 },
    { name: "Death Walker", emoji: "💀", speedMod: 1.2 },
    { name: "Tentacle Horror", emoji: "🐙", speedMod: 0.5 },  // НОВЫЙ
    { name: "Plasma Elemental", emoji: "�", speedMod: 0.9 },  // НОВЫЙ
    { name: "Doom Harbinger", emoji: "☠️", speedMod: 1.0 },  // НОВЫЙ
];

// Генерация массива врагов с динамическими статами
export const ENEMIES = ENEMY_TEMPLATES.map((template, index) => ({
    name: template.name,
    hp: Math.floor(ENEMY_CONFIG.baseHp * Math.pow(ENEMY_CONFIG.hpMultiplier, index)),
    speed: Math.floor(ENEMY_CONFIG.baseSpeed * template.speedMod),
    // Rounded to one decimal, not floored: contact damage spans 1.0-2.2 now, and
    // Math.floor would collapse the first nine tiers into a single flat 1.
    damage: Math.round(ENEMY_CONFIG.baseDamage * Math.pow(ENEMY_CONFIG.damageMultiplier, index) * 10) / 10,
    xpValue: Math.floor(ENEMY_CONFIG.baseXp * Math.pow(ENEMY_CONFIG.xpMultiplier, index)),
    emoji: template.emoji,
}));
