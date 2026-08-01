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

export const CLASSES = [
    {
        id: 'void_walker', name: "Void Walker", emoji: "🌑",
        bonus: "Speed +10% · +1% damage per level",
        weaponId: 'void_ray', hp: 90,
        stats: { moveSpeed: 1.1 },
        perLevel: { stat: 'might', value: 0.01 } as ClassPerLevel,
    },
    {
        id: 'cyber_samurai', name: "Cyber Samurai", emoji: "🤖",
        bonus: "Crit 15% · +1% crit damage per level",
        weaponId: 'phantom_slash', hp: 85,
        stats: { critChance: 0.15 },
        perLevel: { stat: 'critDamage', value: 0.01 } as ClassPerLevel,
    },
    {
        id: 'exo_marine', name: "Exo Marine", emoji: "🛡️",
        bonus: "Armor +2 · +1% max HP per level",
        weaponId: 'orbital_strike', hp: 130,
        stats: { armor: 2 },
        perLevel: { stat: 'maxHp', value: 0.01 } as ClassPerLevel,
    },
    {
        // Regen kept in step with the flat Nano-Repair stack (0.1 HP/s): a
        // class perk is worth ~2.5 picks, not 6.
        id: 'astro_biologist', name: "Astro Biologist", emoji: "🧬",
        bonus: "Regen +0.25 · +1% area per level",
        weaponId: 'spore_cloud', hp: 95,
        stats: { regen: 0.25, area: 1.1 },
        perLevel: { stat: 'area', value: 0.01 } as ClassPerLevel,
    },
    {
        id: 'storm_mage', name: "Storm Mage", emoji: "⚡",
        bonus: "Might +15% · −1% cooldown per level",
        weaponId: 'lightning_chain', hp: 75,
        stats: { might: 1.15 },
        perLevel: { stat: 'cooldown', value: -0.01 } as ClassPerLevel,
    },
    {
        // The only class that starts with a tactic: adrenaline turns its
        // missing armour into the reason to keep fighting at low HP
        id: 'berserker', name: "Berserker", emoji: "🔥",
        bonus: "HP +50%, Armor −2, Adrenaline · +1% crit per level",
        weaponId: 'spinning_ember', hp: 150,
        stats: { armor: -2, might: 1.1, adrenaline: 0.15 },
        perLevel: { stat: 'critChance', value: 0.01 } as ClassPerLevel,
    },
];

// Base values are the FIRST pick; repeat picks stack and grow 25% per stack
// (see core/UpgradePool.ts getPowerupValue). `stackGrowth: 1` opts a powerup
// out of that curve — every stack is then worth exactly `value`.
export interface PowerupData {
    /** Stable key for translations (see data/locales) */
    id: string;
    name: string;
    description: string;
    /** Key in Player.stats (plus the special-cased `maxHp`) */
    type: string;
    value: number;
    emoji: string;
    /** Per-stack multiplier. Omit for the global 25% curve; 1 = flat stacking. */
    stackGrowth?: number;
}

export const POWERUPS: PowerupData[] = [
    // Basic
    // Regen is the one powerup that can invalidate the whole game: enough of it
    // and standing still inside a crowd out-heals the incoming damage. It is
    // deliberately FLAT (no 25% compounding) at 0.1 HP/s per stack, so the
    // 8-stack cap is 0.8 HP/s — noticeable between fights, never a substitute
    // for moving. It used to compound to ~1.4 HP/s, which did exactly that.
    { id: 'nano_repair', name: "Nano-Repair", description: "Hull nanites knit you back together", type: "regen", value: 0.1, stackGrowth: 1, emoji: "❤️" },
    { id: 'targeting_hud', name: "Targeting HUD", description: "Weak-point overlay for your visor", type: "critChance", value: 0.06, emoji: "🎯" },
    { id: 'plasma_core', name: "Plasma Core", description: "Raw damage amplifier", type: "might", value: 0.08, emoji: "💪" },
    { id: 'cooling_system', name: "Cooling System", description: "Weapons fire more often", type: "cooldown", value: -0.06, emoji: "❄️" },

    // Creative
    { id: 'gravity_well', name: "Gravity Well", description: "Crystals fly to you from farther away", type: "magnet", value: 30, emoji: "🧲" },
    { id: 'chain_reaction', name: "Chain Reaction", description: "Bigger blasts, wider zones", type: "area", value: 0.09, emoji: "💣" },
    { id: 'vampiric_link', name: "Vampiric Link", description: "Drain more XP from every kill", type: "growth", value: 0.12, emoji: "🧛" },
    { id: 'temporal_flux', name: "Temporal Flux", description: "Effects linger longer", type: "duration", value: 0.18, emoji: "⏰" },
    { id: 'berserker_rage', name: "Berserker Rage", description: "Crits hit like a freight train", type: "critDamage", value: 0.3, emoji: "😡" },
    { id: 'barrier_field', name: "Barrier Field", description: "Reinforced hull plating", type: "maxHp", value: 15, emoji: "🔮" },
    { id: 'phase_shift', name: "Phase Shift", description: "Move faster between phases", type: "moveSpeed", value: 0.1, emoji: "👻" },
    { id: 'rapid_tick', name: "Rapid Tick", description: "Zones damage more frequently", type: "tick", value: 0.1, emoji: "⏱️" },
    // Armor is subtracted from every touching enemy's damage-per-second, so it
    // compounds with crowd size on its own. Left on the 25% curve the 8-stack
    // cap would be ~20 armor and shrug off a late-game swarm entirely; flat
    // stacking caps it at 8, which is a real but survivable wall.
    { id: 'void_shield', name: "Void Shield", description: "Flat damage reduction", type: "armor", value: 1, stackGrowth: 1, emoji: "🌌" },

    // Tactics — these switch a behaviour on instead of nudging a number, so
    // they all stack FLAT: a compounding chance-to-trigger runs past 100% long
    // before the 8-pick cap and stops meaning anything. Rules and numbers live
    // in core/Tactics.ts. Overclock (+projectile speed) was removed to make
    // room: it was the one powerup whose effect you could not feel.
    { id: 'static_discharge', name: "Static Discharge", description: "Damage taken charges a capacitor that blows the crowd off you", type: "discharge", value: 1, stackGrowth: 1, emoji: "⚡" },
    { id: 'kill_echo', name: "Kill Echo", description: "The dead sometimes detonate", type: "killEcho", value: 0.06, stackGrowth: 1, emoji: "☠️" },
    { id: 'adrenal_surge', name: "Adrenal Surge", description: "Hit harder and move faster while nearly dead", type: "adrenaline", value: 0.1, stackGrowth: 1, emoji: "🩸" },
    { id: 'vital_siphon', name: "Vital Siphon", description: "Kills sometimes leave a repair cell behind", type: "siphon", value: 0.025, stackGrowth: 1, emoji: "💗" },
];

export const WEAPONS = [
    {
        id: 'void_ray',
        name: "Void Ray",
        emoji: "🔫",
        description: "Charged lance that burns through everything in its path",
        class: VoidRayWeapon,
        evolution: {
            name: "Void Cannon",
            emoji: "💜",
            description: "Overshoots the target and collapses the impact point"
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
        description: "Fires massive explosive plasma rounds",
        class: PlasmaCannonWeapon,
        evolution: {
            name: "Fusion Core",
            emoji: "⚛️",
            description: "Plasma rounds create black holes on impact"
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
        description: "Slow moving destruction",
        class: SingularityOrbWeapon,
        evolution: {
            name: "Black Hole",
            emoji: "🕳️",
            description: "Sucks in and crushes all enemies"
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
            description: "A rolling salvo of shells, heavy round last"
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
        description: "Boomerang disc",
        class: ChronoDiscWeapon,
        evolution: {
            name: "Time Shatter",
            emoji: "⏰",
            description: "Disc splits into temporal echoes"
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
        name: "Spinning Ember",
        emoji: "🔥",
        description: "A ring of embers that never goes out and sets things alight",
        class: SpinningEmberWeapon,
        evolution: {
            name: "Inferno Lash",
            emoji: "🌋",
            description: "The ring whips outward and lays burning ground"
        }
    },
    {
        id: 'frost_nova',
        name: "Frost Nova",
        emoji: "❄️",
        description: "Freezing field dropped on the thickest part of the crowd",
        class: FrostNovaWeapon,
        evolution: {
            name: "Absolute Zero",
            emoji: "🧊",
            description: "Freezes enemies in place, then shatters them"
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
    baseHp: 10,           // Базовое HP первого врага
    hpMultiplier: 2,      // Множитель HP для каждого следующего (x2)
    baseDamage: 5,        // Контактный урон в секунду у первого врага
    damageMultiplier: 1.22, // Множитель урона для каждого следующего
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
    damage: Math.floor(ENEMY_CONFIG.baseDamage * Math.pow(ENEMY_CONFIG.damageMultiplier, index)),
    xpValue: Math.floor(ENEMY_CONFIG.baseXp * Math.pow(ENEMY_CONFIG.xpMultiplier, index)),
    emoji: template.emoji,
}));
