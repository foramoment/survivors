import {
    VoidRayWeapon, PlasmaKatanaWeapon, AutocannonWeapon, NanobotSwarmWeapon,
    SporeCloudWeapon, SingularityOrbWeapon, RocketSalvoWeapon, MindBlastWeapon,
    ChronoDiscWeapon, AcidSpitWeapon
} from '../weapons/Implementations';

export const CLASSES = [
    { name: "Void Walker", emoji: "🌑", bonus: "Speed +10%", weaponId: 'void_ray', stats: { moveSpeed: 1.1 } },
    { name: "Cyber Samurai", emoji: "🤖", bonus: "Crit +10%", weaponId: 'plasma_katana', stats: { critChance: 0.15 } },
    { name: "Heavy Gunner", emoji: "🦍", bonus: "Might +20%, Speed -10%", weaponId: 'autocannon', stats: { might: 1.2, moveSpeed: 0.9 } },
    { name: "Technomancer", emoji: "🧙‍♂️", bonus: "Duration +20%", weaponId: 'nanobot_swarm', stats: { duration: 1.2 } },
    { name: "Astro Biologist", emoji: "👨‍🔬", bonus: "Regen +1", weaponId: 'spore_cloud', stats: { regen: 1 } },
    { name: "Quantum Physicist", emoji: "⚛️", bonus: "Cooldown -10%", weaponId: 'singularity_orb', stats: { cooldown: 0.9 } },
    { name: "Exo Marine", emoji: "👮", bonus: "Armor +2", weaponId: 'rocket_salvo', stats: { armor: 2 } },
    { name: "Psionicist", emoji: "🧠", bonus: "Area +20%", weaponId: 'mind_blast', stats: { area: 1.2 } },
    { name: "Time Keeper", emoji: "⏳", bonus: "Proj Speed +20%", weaponId: 'chrono_disc', stats: { speed: 1.2 } },
    { name: "Alien Symbiote", emoji: "👽", bonus: "Growth +20%", weaponId: 'acid_spit', stats: { growth: 1.2 } },
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
    { name: "Mirror Image", description: "Amount +1 (Not Impl)", type: "amount", value: 1, emoji: "👯" },
    { name: "Bounty Hunter", description: "Greed +20%", type: "greed", value: 0.2, emoji: "💰" },
    { name: "Overclock", description: "Speed +10%", type: "speed", value: 0.1, emoji: "⏩" },
    { name: "Phase Shift", description: "Move Speed +10%", type: "moveSpeed", value: 0.1, emoji: "👻" },
    { name: "Scavenger", description: "Luck +20%", type: "luck", value: 0.2, emoji: "🎲" },
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
        id: 'plasma_katana',
        name: "Plasma Katana",
        emoji: "⚔️",
        description: "Slashes nearby enemies",
        class: PlasmaKatanaWeapon,
        evolution: {
            name: "Dimensional Blade",
            emoji: "🗡️",
            description: "Cuts through dimensions, pierces all"
        }
    },
    {
        id: 'autocannon',
        name: "Autocannon",
        emoji: "🤖",
        description: "Rapid fire projectiles",
        class: AutocannonWeapon,
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
        id: 'rocket_salvo',
        name: "Rocket Salvo",
        emoji: "🚀",
        description: "Fires missiles",
        class: RocketSalvoWeapon,
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
        id: 'acid_spit',
        name: "Acid Spit",
        emoji: "🧪",
        description: "Corrosive projectile",
        class: AcidSpitWeapon,
        evolution: {
            name: "Toxic Deluge",
            emoji: "☢️",
            description: "Acid puddles on impact, lingering damage"
        }
    },
];

export const ENEMIES = [
    { name: "Drone", hp: 10, speed: 100, damage: 5, xpValue: 1, emoji: "🛸" },
    { name: "Alien", hp: 20, speed: 80, damage: 8, xpValue: 2, emoji: "👽" },
    { name: "Mecha", hp: 50, speed: 60, damage: 15, xpValue: 5, emoji: "🤖" },
    { name: "Boss", hp: 500, speed: 120, damage: 30, xpValue: 100, emoji: "👹" },
];
