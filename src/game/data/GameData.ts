import {
    VoidRayWeapon, PhantomSlashWeapon, PlasmaCannonWeapon, NanobotSwarmWeapon,
    SporeCloudWeapon, SingularityOrbWeapon, OrbitalStrikeWeapon, MindBlastWeapon,
    ChronoDiscWeapon, AcidPoolWeapon, LightningChainWeapon, SpinningEmberWeapon,
    FrostNovaWeapon, PlasmaGrenadeWeapon
} from '../weapons/implementations';

/** `id` is the stable key for translations (see data/locales) and save data */
export const CLASSES = [
    { id: 'void_walker', name: "Void Walker", emoji: "🌑", bonus: "Speed +10%", weaponId: 'void_ray', hp: 90, stats: { moveSpeed: 1.1 } },
    { id: 'cyber_samurai', name: "Cyber Samurai", emoji: "🤖", bonus: "Crit 15%", weaponId: 'phantom_slash', hp: 85, stats: { critChance: 0.15 } },
    { id: 'heavy_gunner', name: "Heavy Gunner", emoji: "🦍", bonus: "Might +20%, Speed -10%", weaponId: 'plasma_cannon', hp: 110, stats: { might: 1.2, moveSpeed: 0.9 } },
    { id: 'technomancer', name: "Technomancer", emoji: "🧙‍♂️", bonus: "Duration +20%", weaponId: 'nanobot_swarm', hp: 100, stats: { duration: 1.2 } },
    // Kept in step with the flat Nano-Repair stack (0.1 HP/s): a class perk is
    // worth ~2.5 picks, not 6.
    { id: 'astro_biologist', name: "Astro Biologist", emoji: "👨‍🔬", bonus: "Regen +0.25", weaponId: 'spore_cloud', hp: 95, stats: { regen: 0.25 } },
    { id: 'quantum_physicist', name: "Quantum Physicist", emoji: "⚛️", bonus: "Cooldown -10%", weaponId: 'singularity_orb', hp: 80, stats: { cooldown: 0.9 } },
    { id: 'exo_marine', name: "Exo Marine", emoji: "👮", bonus: "Armor +2", weaponId: 'orbital_strike', hp: 130, stats: { armor: 2 } },
    { id: 'psionicist', name: "Psionicist", emoji: "🧠", bonus: "Area +20%", weaponId: 'mind_blast', hp: 75, stats: { area: 1.2 } },
    { id: 'time_keeper', name: "Time Keeper", emoji: "⏳", bonus: "Proj Speed +20%", weaponId: 'chrono_disc', hp: 100, stats: { speed: 1.2 } },
    { id: 'alien_symbiote', name: "Alien Symbiote", emoji: "👽", bonus: "Growth +20%", weaponId: 'acid_pool', hp: 95, stats: { growth: 1.2 } },
    { id: 'storm_mage', name: "Storm Mage", emoji: "⚡", bonus: "Might +15%", weaponId: 'lightning_chain', hp: 70, stats: { might: 1.15 } },
    { id: 'berserker', name: "Berserker", emoji: "🔥", bonus: "HP +50%, Armor -2, Might +10%", weaponId: 'spinning_ember', hp: 150, stats: { armor: -2, might: 1.1 } },
    { id: 'ice_mage', name: "Ice Mage", emoji: "🧊", bonus: "Area +15%, Cooldown -10%", weaponId: 'frost_nova', hp: 85, stats: { area: 1.15, cooldown: 0.9 } },
    { id: 'demolitions_expert', name: "Demolitions Expert", emoji: "💣", bonus: "Area +20%, Might +10%", weaponId: 'plasma_grenade', hp: 100, stats: { area: 1.2, might: 1.1 } },
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
    { id: 'overclock', name: "Overclock", description: "Projectiles travel faster", type: "speed", value: 0.12, emoji: "⏩" },
    { id: 'phase_shift', name: "Phase Shift", description: "Move faster between phases", type: "moveSpeed", value: 0.1, emoji: "👻" },
    { id: 'rapid_tick', name: "Rapid Tick", description: "Zones damage more frequently", type: "tick", value: 0.1, emoji: "⏱️" },
    { id: 'void_shield', name: "Void Shield", description: "Flat damage reduction", type: "armor", value: 1, emoji: "🌌" },
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
        description: "Blinks between the closest enemies and cuts them",
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
        description: "Aura of nanites that grinds down anything close",
        class: NanobotSwarmWeapon,
        evolution: {
            name: "Nanite Hive",
            emoji: "☣️",
            description: "Drones orbit the aura and lunge at anything close"
        }
    },
    {
        id: 'spore_cloud',
        name: "Spore Cloud",
        emoji: "🍄",
        description: "Fungal patch that infects anything walking through it",
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
        description: "Throws acid flasks",
        class: AcidPoolWeapon,
        evolution: {
            name: "Toxic Deluge",
            emoji: "☢️",
            description: "Acid puddles on impact, lingering damage"
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
        description: "Fireballs that orbit you",
        class: SpinningEmberWeapon,
        evolution: {
            name: "Inferno Lash",
            emoji: "🌋",
            description: "Leaves burning trails"
        }
    },
    {
        id: 'frost_nova',
        name: "Frost Nova",
        emoji: "❄️",
        description: "Freezing aura that slows enemies",
        class: FrostNovaWeapon,
        evolution: {
            name: "Absolute Zero",
            emoji: "🧊",
            description: "Freezes enemies solid, massive damage"
        }
    },
    {
        id: 'plasma_grenade',
        name: "Plasma Grenade",
        emoji: "💣",
        description: "Throws plasma grenades that explode on impact",
        class: PlasmaGrenadeWeapon,
        evolution: {
            name: "Cluster Bomb",
            emoji: "💥",
            description: "Three canisters per throw with chained secondaries"
        }
    },
];



// ⚙️ Конфигурация врагов — измени эти значения для балансировки
export const ENEMY_CONFIG = {
    baseHp: 10,           // Базовое HP первого врага
    hpMultiplier: 2,      // Множитель HP для каждого следующего (x2)
    baseDamage: 5,        // Базовый урон первого врага
    damageMultiplier: 1.5, // Множитель урона для каждого следующего (x1.5)
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
