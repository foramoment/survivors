# 🎮 Game Mechanics Documentation

This document describes the internal game mechanics, formulas, and how to modify game behavior. Useful for developers, contributors, and AI agents working on the codebase.

---

## 📁 Key Files

| File                                  | Purpose                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| `src/game/data/GameData.ts`           | All game data: classes, weapons, enemies, powerups, **WEAPON_STATS** |
| `src/game/weapons/Implementations.ts` | Weapon behavior implementations                                      |
| `src/game/weapons/WeaponTypes.ts`     | Base weapon classes (Projectile, Zone, etc.)                         |
| `src/game/entities/Player.ts`         | Player stats, movement, knockback                                    |
| `src/game/entities/Enemy.ts`          | Enemy AI, separation, knockback                                      |
| `src/game/GameManager.ts`             | Main game loop, collisions, spawning                                 |
| `src/game/core/SpatialHash.ts`        | Spatial partitioning for efficient collision detection               |

---

## ⚔️ Weapon System

### Weapon Types

All weapons extend from base classes in `WeaponTypes.ts`:

| Base Class         | Behavior                                | Examples                                  |
| ------------------ | --------------------------------------- | ----------------------------------------- |
| `Weapon`           | Custom logic                            | VoidRay, PhantomSlash, NanobotSwarm       |
| `ProjectileWeapon` | Fires projectiles at nearest enemy      | SingularityOrb, PlasmaCannon, FanOfKnives |
| `ZoneWeapon`       | Creates damage zones at player position | SporeCloud                                |

### Weapon Stats Configuration

All weapon stats are centralized in `WEAPON_STATS` in `GameData.ts`:

```typescript
export const WEAPON_STATS = {
    weapon_id: {
        damage: number,        // Base damage
        damageScaling: number, // Multiplier on upgrade (1.2 = +20%)
        cooldown: number,      // Seconds between attacks
        area: number,          // Size/radius (context-dependent)
        areaScaling: number,   // Area multiplier on upgrade
        speed: number,         // Projectile speed (px/sec)
        duration: number,      // Effect duration (seconds)
        pierce?: number,       // Piercing count or bounces
        count?: number,        // Number of projectiles
        countScaling?: number, // Count increase per level
    }
}
```

### How Range Works (Per Weapon Type)

**⚠️ IMPORTANT**: Range is calculated differently for each weapon type!

| Weapon Type            | Range Formula           | Config Fields       |
| ---------------------- | ----------------------- | ------------------- |
| **Projectile weapons** | `speed × duration`      | `speed`, `duration` |
| **Zone weapons**       | Direct radius           | `area`              |
| **Target-seeking**     | Max target distance     | `area`              |
| **Chain weapons**      | Max chain jump distance | `area`              |
| **Beam weapons**       | Hardcoded in class      | N/A                 |

#### Detailed Examples:

**1. Projectile Range** (SingularityOrb, PlasmaCannon, FanOfKnives)
```
Range = speed × duration
Example: SingularityOrb with speed=50, duration=2.5 → Range = 125px
```

**2. Zone Radius** (SporeCloud, FrostNova, AcidPool)
```
Zone size = area × player.stats.area
Example: FrostNova with area=120 → 120px radius zone
```

**3. Target Search Range** (PhantomSlash, MindBlast)
```
Max target distance = area × player.stats.area
Example: PhantomSlash with area=250 → targets within 250px
```

**4. Chain/Bounce Range** (LightningChain, ChronoDisc)
```
Max chain jump = area (for LightningChain)
Max bounce range = area (for ChronoDisc)
Example: LightningChain with area=800 → chains up to 800px
```

**5. Hardcoded Range** (VoidRay)
```typescript
// In VoidRayWeapon.update():
if (dst < 600 && dst < minDst) { // Hardcoded 600px range
```

---

## 👾 Enemy System

### Enemy Behavior

Enemies move toward the player using simple steering:

```typescript
direction = normalize(playerPos - enemyPos)
velocity = direction × speed × speedMultiplier
```

### Separation (Anti-Stacking)

Enemies push each other apart using **Spatial Hash Grid** for O(1) neighbor lookup:

```typescript
// In GameManager.update():
1. enemyGrid.insertAll(enemies)           // Build spatial hash
2. For each enemy:
   nearby = enemyGrid.getNearby(pos)      // O(1) lookup
   for other in nearby:
     enemy.addSeparationFrom(other, 200)  // Accumulate push force
3. enemy.update() applies all forces
```

**Separation Force Formula:**
```
overlap = 1 - (distance / minDistance)
force = overlap × separationStrength × directionAway
```

### Knockback System

Both Player and Enemy support knockback:

```typescript
// On collision:
player.applyKnockback(nx, ny, 150)      // Player pushed away
enemy.applyKnockback(-nx, -ny, 75)      // Enemy pushed back (less)

// In update():
position += knockback × dt
knockback *= decayRate  // 0.85 for player, 0.9 for enemy
```

---

## 🎯 Collision Detection

### Spatial Hash Grid

Located in `src/game/core/SpatialHash.ts`. Divides world into cells for efficient spatial queries.

```typescript
const grid = new SpatialHashGrid(50);  // 50px cell size
grid.insertAll(enemies);
const nearby = grid.getNearby(pos, radius);  // O(1) average
```

### Collision Checks

```typescript
checkCollision(a, b) = distance(a.pos, b.pos) < a.radius + b.radius
```

---

## 📊 Player Stats

All player stats in `Player.stats`:

| Stat         | Default | Effect                               |
| ------------ | ------- | ------------------------------------ |
| `might`      | 1.0     | Damage multiplier                    |
| `area`       | 1.0     | Weapon size multiplier               |
| `cooldown`   | 1.0     | Cooldown multiplier (lower = faster) |
| `speed`      | 1.0     | Projectile speed multiplier          |
| `duration`   | 1.0     | Effect duration multiplier           |
| `moveSpeed`  | 1.0     | Player movement speed multiplier     |
| `magnet`     | 100     | XP crystal pickup range              |
| `armor`      | 0       | Damage reduction                     |
| `regen`      | 0       | HP/second regeneration               |
| `critChance` | 0.05    | Critical hit chance (5%)             |
| `critDamage` | 1.5     | Critical damage multiplier           |
| `growth`     | 1.0     | XP gain multiplier                   |
| `luck`       | 1.0     | (Reserved for future use)            |
| `greed`      | 1.0     | (Reserved for future use)            |
| `timeSpeed`  | 1.0     | Weapon cooldown speed multiplier     |
| `tick`       | 0       | Zone tick interval reduction         |

---

## 🔄 Game Loop

```
1. Spawn enemies (if below max)
2. Player.update() - movement, knockback decay, regen
3. Weapon.update() - fire weapons
4. Reset enemy forces
5. Build spatial hash grid
6. Calculate enemy separation forces
7. Projectile.update() - move projectiles
8. Projectile-Enemy collisions
9. Enemy.update() - move toward player with forces
10. Player-Enemy collisions + knockback
11. Remove dead enemies, spawn XP
12. XP crystal collection
13. Check game over
14. Update camera & HUD
```

---

## 🎚️ Balance Tuning Quick Reference

### To change weapon damage:
```typescript
WEAPON_STATS.weapon_id.damage = newValue;
```

### To change weapon range:
- **Projectiles**: Adjust `speed` or `duration`
- **Zones**: Adjust `area`
- **Target-seeking**: Adjust `area`

### To change cooldown:
```typescript
WEAPON_STATS.weapon_id.cooldown = newSeconds;
```

### To change enemy stats:
```typescript
// In GameData.ts ENEMIES array:
{ name: "Snake", hp: 10, speed: 100, damage: 5, xpValue: 1, emoji: "🪱" }
```

### To change spawn rates:
```typescript
// In GameManager.spawnEnemy():
if (this.enemies.length < Math.min(400, 30 + this.gameTime / 5)) {
    if (Math.random() < 0.05 + (this.gameTime / 1000)) {
        this.spawnEnemy();
    }
}
```

---

## 🧪 Testing Tips

1. Enable **Developer Mode** in class selection for access to all weapons
2. Use browser DevTools to modify `gameManager.gameTime` for time-based testing
3. Modify `WEAPON_STATS` values and save - Vite hot-reloads automatically

---

*Last updated: 2024-12-10*
