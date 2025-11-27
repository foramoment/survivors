import {
    VoidRayWeapon, PhantomSlashWeapon, DroneSupportWeapon, NanobotSwarmWeapon,
    SporeCloudWeapon, SingularityOrbWeapon, OrbitalStrikeWeapon, MindBlastWeapon,
    ChronoDiscWeapon, AcidPoolWeapon, LightningChainWeapon, SpinningEmberWeapon,
    FrostNovaWeapon, FanOfKnivesWeapon
} from '../weapons/Implementations';

export const CLASSES = [
    { name: "Void Walker", emoji: "🌑", bonus: "Speed +10%", weaponId: 'void_ray', hp: 90, stats: { moveSpeed: 1.1 } },
    { name: "Cyber Samurai", emoji: "🤖", bonus: "Crit +10%", weaponId: 'phantom_slash', hp: 85, stats: { critChance: 0.15 } },
    { name: "Heavy Gunner", emoji: "🦍", bonus: "Might +20%, Speed -10%", weaponId: 'drone_support', hp: 110, stats: { might: 1.2, moveSpeed: 0.9 } },
    { name: "Technomancer", emoji: "🧙‍♂️", bonus: "Duration +20%", weaponId: 'nanobot_swarm', hp: 100, stats: { duration: 1.2 } },
    { name: "Astro Biologist", emoji: "👨‍🔬", bonus: "Regen +1", weaponId: 'spore_cloud', hp: 95, stats: { regen: 1 } },
    { name: "Quantum Physicist", emoji: "⚛️", bonus: "Cooldown -10%", weaponId: 'singularity_orb', hp: 80, stats: { cooldown: 0.9 } },
    { name: "Exo Marine", emoji: "👮", bonus: "Armor +2", weaponId: 'orbital_strike', hp: 130, stats: { armor: 2 } },
    { name: "Psionicist", emoji: "🧠", bonus: "Area +20%", weaponId: 'mind_blast', hp: 75, stats: { area: 1.2 } },
    { name: "Time Keeper", emoji: "⏳", bonus: "Proj Speed +20%", weaponId: 'chrono_disc', hp: 100, stats: { speed: 1.2 } },
    { name: "Alien Symbiote", emoji: "👽", bonus: "Growth +20%", weaponId: 'acid_pool', hp: 95, stats: { growth: 1.2 } },
    { name: "Storm Mage", emoji: "⚡", bonus: "Lightning chains enemies", weaponId: 'lightning_chain', hp: 70, stats: { might: 1.15 } },
    { name: "Berserker", emoji: "🔥", bonus: "HP +50%, Armor -2", weaponId: 'spinning_ember', hp: 150, stats: { armor: -2, might: 1.1 } },
    { name: "Ice Mage", emoji: "🧊", bonus: "Area +15%, Cooldown -10%", weaponId: 'frost_nova', hp: 85, stats: { area: 1.15, cooldown: 0.9 } },
    { name: "Shadow Assassin", emoji: "🥷", bonus: "Crit +15%, Move Speed +15%", weaponId: 'fan_of_knives', hp: 80, stats: { critChance: 0.2, moveSpeed: 1.15 } },
];

export const POWERUPS = [
    // Basic
    { name: "Titanium Plating", description: "Armor +1", type: "armor", value: 1, emoji: "🛡️" },
    { name: "Nano-Repair", description: "Regen +0.5/s", type: "regen", value: 0.5, emoji: "❤️" },
    { name: "Targeting HUD", description: "Crit +5%", type: "critChance", value: 0.05, emoji: "🎯" },
    { name: "Plasma Core", description: "Might +5%", type: "might", value: 0.05, emoji: "💪" },
    { name: "Cooling System", description: "Cooldown -5%", type: "cooldown", value: -0.05, emoji: "❄️" },
    { name: "Vitality Booster", description: "Max HP +5", type: "maxHp", value: 5, emoji: "🏥" },

    // Creative
    { name: "Gravity Well", description: "Pull range +20%", type: "magnet", value: 20, emoji: "🧲" },
    { name: "Chain Reaction", description: "Area +10%", type: "area", value: 0.1, emoji: "💣" },
    { name: "Energy Shield", description: "Armor +1", type: "armor", value: 1, emoji: "🛡️" },
    { name: "Vampiric Link", description: "Growth +10%", type: "growth", value: 0.1, emoji: "🧛" },
    { name: "Static Field", description: "Duration +10%", type: "duration", value: 0.1, emoji: "⚡" },
    { name: "Bounty Hunter", description: "Greed +20%", type: "greed", value: 0.2, emoji: "💰" },
    { name: "Berserker Rage", description: "Crit Dmg +25%", type: "critDamage", value: 0.25, emoji: "😡" },
    { name: "Barrier Field", description: "Max HP +10", type: "maxHp", value: 10, emoji: "🔮" },
    { name: "Overclock", description: "Speed +10%", type: "speed", value: 0.1, emoji: "⏩" },
    { name: "Phase Shift", description: "Move Speed +10%", type: "moveSpeed", value: 0.1, emoji: "👻" },
    { name: "Scavenger", description: "Luck +20%", type: "luck", value: 0.2, emoji: "🎲" },
    { name: "Rapid Tick", description: "Zone tick -0.1s", type: "tick", value: 0.1, emoji: "⏱️" },
    { name: "Temporal Flux", description: "Duration +15%", type: "duration", value: 0.15, emoji: "⏰" },
    { name: "Void Shield", description: "Armor +2", type: "armor", value: 2, emoji: "🌌" },
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
        id: 'drone_support',
        name: "Drone Support",
        emoji: "🛸",
        description: "Deploys a drone that fights for you",
        class: DroneSupportWeapon,
        evolution: {
            name: "Gatling Storm",
            emoji: "⚙️",
            description: "Fires multiple bullets per shot"
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
            name: "Nuclear Barrage",
            emoji: "☢️",
            description: "Explosive chain reaction missiles"
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

export const ENEMIES = [
    { name: "Snake", hp: 10, speed: 100, damage: 5, xpValue: 1, emoji: "🪱" },
    { name: "Lizard", hp: 20, speed: 80, damage: 8, xpValue: 2, emoji: "🦎" },
    { name: "Hedgehog", hp: 30, speed: 70, damage: 10, xpValue: 3, emoji: "🦔" },
    { name: "Alien", hp: 50, speed: 90, damage: 12, xpValue: 4, emoji: "👽" },
    { name: "Mecha", hp: 80, speed: 60, damage: 15, xpValue: 6, emoji: "🤖" },
    { name: "Boss", hp: 500, speed: 120, damage: 30, xpValue: 100, emoji: "👹" },
];
