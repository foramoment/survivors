# 🧟 Survivors

A **Vampire Survivors-like** roguelike game built with TypeScript and Vite. Battle endless waves of enemies, collect XP, level up, and evolve your weapons!

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)

### ▶️ [Play in your browser](https://foramoment.github.io/survivors/)

## 🎮 Features

- **14 Unique Classes** — Each with different starting weapons and stat bonuses
- **14 Weapons** — All with unique mechanics and evolutions at level 6
- **16+ Powerups** — Enhance your stats and abilities
- **8 Enemy Types** — From basic snakes to powerful bosses
- **XP Crystals** — Different sizes and values from defeated enemies
- **Mobile Support** — Touch controls with virtual joystick for Android

> 📖 **For developers**: See [GAME_MECHANICS.md](GAME_MECHANICS.md) for detailed documentation on weapon systems, formulas, and how to modify game behavior.

## 🛠️ Tech Stack

| Technology         | Purpose                                     |
| ------------------ | ------------------------------------------- |
| **TypeScript**     | Core game logic with strong typing          |
| **Vite**           | Fast development server and bundler         |
| **Canvas API**     | Game rendering (no frameworks, pure canvas) |
| **Capacitor**      | Android APK builds                          |
| **GitHub Actions** | CI/CD for automated Android builds          |

## 📁 Project Structure

```
survivors/
├── src/
│   ├── game/
│   │   ├── core/           # Utilities, input handling, rendering
│   │   ├── data/           # Game data (classes, weapons, enemies, powerups)
│   │   ├── entities/       # Player, Enemy, XP Crystal entities
│   │   ├── weapons/        # Weapon implementations and types
│   │   ├── ui/             # In-game UI (joystick for mobile)
│   │   ├── Entity.ts       # Base entity class
│   │   ├── Weapon.ts       # Base weapon class
│   │   └── GameManager.ts  # Main game loop and state management
│   ├── style.css           # Game styling
│   └── main.ts             # Entry point
├── android/                # Capacitor Android project
├── .github/workflows/      # GitHub Actions CI/CD
└── dist/                   # Production build output
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Development
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Android Build
```bash
# Sync web assets to Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

Or push to GitHub — the CI/CD pipeline will automatically build and release the APK.

## ⚔️ Weapon Configuration

All weapon stats are centralized in `src/game/data/GameData.ts` in the `WEAPON_STATS` object for easy balancing:

```typescript
export const WEAPON_STATS: Record<string, WeaponConfig> = {
    void_ray: { damage: 25, cooldown: 2.0, ... },
    nanobot_swarm: { damage: 0.8, ... },
    // ... all 14 weapons
};
```

### Configuration Parameters

| Parameter       | Description                                     |
| --------------- | ----------------------------------------------- |
| `damage`        | Base damage dealt                               |
| `damageScaling` | Damage multiplier on upgrade (e.g., 1.2 = +20%) |
| `cooldown`      | Base cooldown in seconds                        |
| `area`          | Base size/radius                                |
| `areaScaling`   | Size multiplier on upgrade                      |
| `speed`         | Projectile speed                                |
| `duration`      | Effect duration                                 |
| `pierce`        | Piercing / bounce count                         |
| `count`         | Base projectile count                           |
| `countScaling`  | Count increase per level                        |

### Weapons List

| ID                | Weapon            | Class             | Description                                |
| ----------------- | ----------------- | ----------------- | ------------------------------------------ |
| `void_ray`        | 🔫 Void Ray        | Void Walker       | Fires a powerful charging beam             |
| `phantom_slash`   | ⚔️ Phantom Slash   | Cyber Samurai     | Instantly cuts random enemies              |
| `plasma_cannon`   | 🔋 Plasma Cannon   | Heavy Gunner      | Explosive plasma rounds                    |
| `nanobot_swarm`   | 🦠 Nanobot Swarm   | Technomancer      | Swarming nanobots that devour enemies      |
| `spore_cloud`     | 🍄 Spore Cloud     | Astro Biologist   | Leaves damaging zones                      |
| `singularity_orb` | ⚫ Singularity Orb | Quantum Physicist | Slow-moving orb of destruction             |
| `orbital_strike`  | 🛰️ Orbital Strike  | Exo Marine        | Calls down random explosions               |
| `mind_blast`      | 🧠 Mind Blast      | Psionicist        | Psionic explosion at enemy location        |
| `chrono_disc`     | 💿 Chrono Disc     | Time Keeper       | Ricochet disc that bounces between enemies |
| `acid_pool`       | 🧪 Acid Pool       | Alien Symbiote    | Throws acid flasks creating puddles        |
| `lightning_chain` | ⚡ Lightning Chain | Storm Mage        | Lightning that chains between enemies      |
| `spinning_ember`  | 🔥 Spinning Ember  | Berserker         | Fireballs that orbit the player            |
| `frost_nova`      | ❄️ Frost Nova      | Ice Mage          | Freezing grenades that slow enemies        |
| `fan_of_knives`   | 🗡️ Fan of Knives   | Shadow Assassin   | Fires a spread of knives                   |

## 🎯 Game Controls

### Desktop
- **WASD / Arrow Keys** — Movement
- **Mouse** — Aim direction (optional)

### Mobile
- **Virtual Joystick** — Touch and drag to move

## 📜 License

This project is licensed under the **MIT License** — you're free to use, modify, and distribute it however you like! Just keep the copyright notice. See [LICENSE](LICENSE) for details.

---

*Made with 💜 and TypeScript*
