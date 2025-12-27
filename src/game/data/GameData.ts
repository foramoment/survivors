import {
    VoidRayWeapon, PhantomSlashWeapon, PlasmaCannonWeapon, NanobotSwarmWeapon,
    SporeCloudWeapon, SingularityOrbWeapon, OrbitalStrikeWeapon, MindBlastWeapon,
    ChronoDiscWeapon, AcidPoolWeapon, LightningChainWeapon, SpinningEmberWeapon,
    FrostNovaWeapon, FanOfKnivesWeapon
} from '../weapons/implementations';

export const CLASSES = [
    { name: "Void Walker", emoji: "🌑", bonus: "Speed +10%", weaponId: 'void_ray', hp: 90, stats: { moveSpeed: 1.1 } },
    { name: "Cyber Samurai", emoji: "🤖", bonus: "Crit +10%", weaponId: 'phantom_slash', hp: 85, stats: { critChance: 0.15 } },
    { name: "Heavy Gunner", emoji: "🦍", bonus: "Might +20%, Speed -10%", weaponId: 'plasma_cannon', hp: 110, stats: { might: 1.2, moveSpeed: 0.9 } },
    { name: "Technomancer", emoji: "🧙‍♂️", bonus: "Duration +20%", weaponId: 'nanobot_swarm', hp: 100, stats: { duration: 1.2 } },
    { name: "Astro Biologist", emoji: "👨‍🔬", bonus: "Regen +1", weaponId: 'spore_cloud', hp: 95, stats: { regen: 1 } },
    { name: "Quantum Physicist", emoji: "⚛️", bonus: "Cooldown -10%", weaponId: 'singularity_orb', hp: 80, stats: { cooldown: 0.9 } },
    { name: "Exo Marine", emoji: "👮", bonus: "Armor +2", weaponId: 'orbital_strike', hp: 130, stats: { armor: 2 } },
    { name: "Psionicist", emoji: "🧠", bonus: "Area +20%", weaponId: 'mind_blast', hp: 75, stats: { area: 1.2 } },
    { name: "Time Keeper", emoji: "⏳", bonus: "Proj Speed +20%", weaponId: 'chrono_disc', hp: 100, stats: { speed: 1.2 } },
    { name: "Alien Symbiote", emoji: "👽", bonus: "Growth +20%", weaponId: 'acid_pool', hp: 95, stats: { growth: 1.2 } },
    { name: "Storm Mage", emoji: "⚡", bonus: "Might +15%", weaponId: 'lightning_chain', hp: 70, stats: { might: 1.15 } },
    { name: "Berserker", emoji: "🔥", bonus: "HP +50%, Armor -2, Might +10%", weaponId: 'spinning_ember', hp: 150, stats: { armor: -2, might: 1.1 } },
    { name: "Ice Mage", emoji: "🧊", bonus: "Area +15%, Cooldown -10%", weaponId: 'frost_nova', hp: 85, stats: { area: 1.15, cooldown: 0.9 } },
    { name: "Shadow Assassin", emoji: "🥷", bonus: "Crit +15%, Move Speed +15%", weaponId: 'fan_of_knives', hp: 80, stats: { critChance: 0.2, moveSpeed: 1.15 } },
];

export const POWERUPS = [
    // Basic
    { name: "Nano-Repair", description: "Regen +0.5/s", type: "regen", value: 0.5, emoji: "❤️" },
    { name: "Targeting HUD", description: "Crit +5%", type: "critChance", value: 0.05, emoji: "🎯" },
    { name: "Plasma Core", description: "Might +5%", type: "might", value: 0.05, emoji: "💪" },
    { name: "Cooling System", description: "Cooldown -5%", type: "cooldown", value: -0.05, emoji: "❄️" },

    // Creative
    { name: "Gravity Well", description: "Pull range +20%", type: "magnet", value: 20, emoji: "🧲" },
    { name: "Chain Reaction", description: "Area +10%", type: "area", value: 0.1, emoji: "💣" },
    { name: "Vampiric Link", description: "Growth +10%", type: "growth", value: 0.1, emoji: "🧛" },
    { name: "Temporal Flux", description: "Duration +15%", type: "duration", value: 0.15, emoji: "⏰" },
    { name: "Berserker Rage", description: "Crit Dmg +25%", type: "critDamage", value: 0.25, emoji: "😡" },
    { name: "Barrier Field", description: "Max HP +10", type: "maxHp", value: 10, emoji: "🔮" },
    { name: "Overclock", description: "Speed +10%", type: "speed", value: 0.1, emoji: "⏩" },
    { name: "Phase Shift", description: "Move Speed +10%", type: "moveSpeed", value: 0.1, emoji: "👻" },
    { name: "Rapid Tick", description: "Zone tick -0.1s", type: "tick", value: 0.1, emoji: "⏱️" },
    { name: "Void Shield", description: "Armor +1", type: "armor", value: 1, emoji: "🌌" },
];

export const WEAPONS = [
    {
        id: 'void_ray',
        name: "Void Ray",
        emoji: "🔫",
        description: "Fires beams at enemies",
        class: VoidRayWeapon,
        evolution: {
            name: "Void Cannon",
            emoji: "💜",
            description: "Massive void beam with AOE explosion"
        }
    },
    {
        id: 'phantom_slash',
        name: "Phantom Slash",
        emoji: "⚔️",
        description: "Instantly cuts random enemies",
        class: PhantomSlashWeapon,
        evolution: {
            name: "Dimensional Blade",
            emoji: "🗡️",
            description: "Cuts through dimensions, pierces all"
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
        description: "Damaging aura around player",
        class: NanobotSwarmWeapon,
        evolution: {
            name: "Nano Plague",
            emoji: "☣️",
            description: "Spreads between enemies, massive area"
        }
    },
    {
        id: 'spore_cloud',
        name: "Spore Cloud",
        emoji: "🍄",
        description: "Leaves damaging zones",
        class: SporeCloudWeapon,
        evolution: {
            name: "Fungal Apocalypse",
            emoji: "🍄‍🟫",
            description: "Giant toxic zones that last forever"
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
        description: "Calls down random explosions",
        class: OrbitalStrikeWeapon,
        evolution: {
            name: "Atomic Bomb",
            emoji: "☢️",
            description: "Massive nuclear explosion with mushroom cloud"
        }
    },
    {
        id: 'mind_blast',
        name: "Mind Blast",
        emoji: "🧠",
        description: "Explosion at enemy location",
        class: MindBlastWeapon,
        evolution: {
            name: "Psychic Storm",
            emoji: "🌀",
            description: "Multiple explosions, stuns enemies"
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
        description: "Chains between enemies",
        class: LightningChainWeapon,
        evolution: {
            name: "Thunderstorm",
            emoji: "🌩️",
            description: "Infinite chain lightning"
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
        id: 'fan_of_knives',
        name: "Fan of Knives",
        emoji: "🗡️",
        description: "Fires a spread of knives",
        class: FanOfKnivesWeapon,
        evolution: {
            name: "Void Blades",
            emoji: "🌑",
            description: "Daggers split into shadow clones"
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
