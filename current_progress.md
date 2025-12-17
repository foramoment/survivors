# EVOLVE Weapon System - Progress Log

## Overview
Overhauling the EVOLVE weapon system to make evolved weapons unique and exciting rather than simple stat upgrades. All evolved logic now lives in separate classes in `EvolutionTypes.ts`.

---

## Session 1: Architecture & Priority Weapons

### Architecture Setup
- **Created `EvolutionTypes.ts`** with evolved weapon classes
- **Added `evolved: boolean`** property to base `Weapon` class in `Weapon.ts`
- **Fixed `GameManager.evolveWeapon()`** to properly set:
  - `weapon.evolved = true`
  - `weapon.level = 6`
  - Apply damage/area bonuses (NOT cooldown reduction)

### Critical Bug Fixed
**Problem**: Evolved mechanics weren't triggering because `weapon.level` was never reaching 6.

**Root Cause**: `GameManager.evolveWeapon()` only set `weaponLevels.set(weaponId, 6)` (a Map in GameManager), but never updated `weapon.level`.

**Solution**: Added `existingWeapon.level = 6` in `evolveWeapon()`, then refactored to use `this.evolved` flag instead of `level >= 6` check (cleaner).

### Priority EVOLVE Weapons Implemented

| Weapon            | Evolution    | Class                                   | Mechanic                               |
| ----------------- | ------------ | --------------------------------------- | -------------------------------------- |
| ⚡ Lightning Chain | Thunderstorm | `ThunderstormLightning`                 | 10% split chance, purple glow, CD +50% |
| ⚫ Singularity Orb | Black Hole   | `BlackHoleProjectile` + `BlackHoleZone` | Dark lightning, 3s collapse zone       |
| ☢️ Orbital Strike  | Atomic Bomb  | `AtomicBombZone`                        | Massive radius 300, mushroom cloud     |

---

## Session 2: Refactoring Inline Logic

### Refactored Inline `this.evolved` Checks
Moved all inline evolved logic from `Implementations.ts` to separate classes in `EvolutionTypes.ts`:

| Weapon          | Evolution         | New Class               | Visual Effect                       |
| --------------- | ----------------- | ----------------------- | ----------------------------------- |
| ⚔️ Phantom Slash | Dimensional Blade | `DimensionalRiftZone`   | Swirling portal 🌀, 50% slow         |
| 🔋 Plasma Cannon | Fusion Core       | `FusionCoreSingularity` | Green pull zone with rotating lines |
| 🧠 Mind Blast    | Psychic Storm     | `PsychicStormZone`      | Brain waves, 2s stun                |
| ❄️ Frost Nova    | Absolute Zero     | `AbsoluteZeroZone`      | Ice crystals, 100% freeze           |

### Files Changed This Session
| File                 | Changes                                          |
| -------------------- | ------------------------------------------------ |
| `EvolutionTypes.ts`  | Added 4 new classes (340 lines)                  |
| `Implementations.ts` | Updated to use new evolved classes, cleaner code |

---

## Current State: EvolutionTypes.ts Classes

**7 evolved classes total:**
1. `ThunderstormLightning` - splitting lightning chains
2. `BlackHoleProjectile` - dark lightning orb
3. `BlackHoleZone` - collapse zone after orb death
4. `AtomicBombZone` - nuclear explosion with mushroom cloud
5. `DimensionalRiftZone` - swirling portal rifts
6. `FusionCoreSingularity` - plasma pull zone
7. `PsychicStormZone` - stun waves
8. `AbsoluteZeroZone` - complete freeze with ice shards

---

## Remaining Work (Future Sessions)

### Weapons Still Using Simple isEvolved Checks
- **Void Ray** - just 2x damage (simple, may not need class)

### Weapons Without Evolved Effects Yet
These need new evolved classes created:
- Nanobot Swarm → Nano Plague
- Spore Cloud → Fungal Apocalypse
- Chrono Disc → Time Shatter
- Acid Pool → Toxic Deluge
- Spinning Ember → Inferno Lash
- Fan of Knives → Void Blades

---

## Key Files
- `src/game/weapons/EvolutionTypes.ts` - all evolved weapon classes
- `src/game/weapons/Implementations.ts` - base weapon classes
- `src/game/Weapon.ts` - base class with `evolved` property
- `src/game/GameManager.ts` - `evolveWeapon()` method
- `src/game/data/GameData.ts` - weapon definitions and evolution names

## Balance Rule
> **Upgrading weapons or reaching EVOLVE versions must NOT reduce cooldown.** Cooldown can only increase (for balance), never decrease.
