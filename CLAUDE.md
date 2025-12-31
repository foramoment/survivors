# 🎮 Survivors - AI Context

> Vampire Survivors-like roguelike на TypeScript + Canvas. Бесконечные волны врагов, XP, прокачка оружий.

---

## 📁 Структура проекта

```
src/game/
├── GameManager.ts        # 🎯 Главный файл: game loop, UI, спавн, столкновения
├── Weapon.ts             # Базовый абстрактный класс оружия
├── Entity.ts             # Базовая сущность (pos, radius)
├── core/                 # Ядро движка
│   ├── DamageSystem.ts   # ⚔️ Singleton: расчёт урона, криты, might
│   ├── ParticleSystem.ts # ✨ Singleton: эффекты частиц
│   ├── SpatialHash.ts    # 🗺️ Оптимизация поиска сущностей O(1)
│   ├── StateMachine.ts   # Состояния игры: PLAYING, LEVEL_UP, PAUSED
│   ├── EventBus.ts       # Pub/sub система событий
│   ├── PlayerStats.ts    # Типы и дефолты статов
│   ├── Input.ts          # WASD/мышь/тач ввод
│   └── Utils.ts          # Vector2, distance, normalize
├── data/
│   └── GameData.ts       # 📊 Конфиг: классы, powerups, враги, оружия
├── entities/
│   ├── Player.ts         # Игрок со статами
│   ├── Enemy.ts          # Враги с сепарацией
│   └── XPCrystal.ts      # Кристаллы XP
├── weapons/
│   ├── base/             # Базовые классы
│   │   ├── WeaponBase.ts # ProjectileWeapon, ZoneWeapon
│   │   ├── Projectile.ts # Projectile, BouncingProjectile, OrbitingProjectile
│   │   ├── Zone.ts       # Zone, FrostZone, AcidZone, NanobotCloud
│   │   └── Beam.ts       # Beam, VoidRayBeam, ChainLightning
│   └── implementations/  # 14 оружий (каждое в своём файле)
└── ui/
    ├── ScreenManager.ts  # Менеджер экранов
    ├── BaseScreen.ts     # Базовый класс экрана
    └── screens/          # MainMenu, ClassSelection, Game и т.д.
```

---

## 🎲 Ключевые системы

### DamageSystem (Singleton)
**Файл:** `core/DamageSystem.ts`

Централизованный расчёт урона. **Весь урон** проходит через эту систему:

```typescript
// С модификаторами (crit + might):
damageSystem.dealDamage({ baseDamage: 10, source: weapon, target: enemy, position: enemy.pos })

// Без модификаторов (для зон с пре-калькулированным уроном):
damageSystem.dealRawDamage(enemy, 50, enemy.pos)
```

**Формула урона:**
```
finalDamage = baseDamage × might × critMultiplier(если крит)
critChance = player.stats.critChance (default 5%)
critDamage = player.stats.critDamage (default 1.5x)
```

### SpatialHash
**Файл:** `core/SpatialHash.ts`

Оптимизация поиска сущностей. Пространство делится на ячейки 100x100px.

```typescript
levelSpatialHash.clear();
levelSpatialHash.insertAll(enemies);
const nearby = levelSpatialHash.getWithinRadius(pos, radius);
```

### ParticleSystem (Singleton)
**Файл:** `core/ParticleSystem.ts`

Богатая библиотека эффектов:
- `emitHit()`, `emitExplosion()` — базовые
- `emitOrbitalStrike()`, `emitNuclear()` — эпические
- `emitLightning()`, `emitFrost()`, `emitPoison()` — элементальные
- `emitBeamCharge()`, `emitTrail()` — вспомогательные

---

## 📊 Статы игрока

**Файл:** `core/PlayerStats.ts` + `entities/Player.ts`

| Стат         | Default | Описание                              |
| ------------ | ------- | ------------------------------------- |
| `might`      | 1.0     | Множитель урона                       |
| `area`       | 1.0     | Множитель радиуса оружий              |
| `cooldown`   | 1.0     | Множитель кулдауна (меньше = быстрее) |
| `speed`      | 1.0     | Скорость снарядов                     |
| `duration`   | 1.0     | Длительность эффектов                 |
| `moveSpeed`  | 1.0     | Скорость передвижения                 |
| `magnet`     | 100     | Радиус притяжения XP кристаллов       |
| `growth`     | 1.0     | Множитель получаемого XP              |
| `armor`      | 0       | Снижение урона                        |
| `regen`      | 0       | HP/сек регенерации                    |
| `critChance` | 0.05    | Шанс крита (5%)                       |
| `critDamage` | 1.5     | Множитель крит урона                  |
| `tick`       | 0       | Уменьшение интервала тика зон         |

---

## ⚔️ Система оружий

### Иерархия классов

```
Weapon (abstract)
├── ProjectileWeapon (abstract) — стреляет снарядами
│   └── Переопределяй createProjectile() для своих типов снарядов
├── ZoneWeapon (abstract) — создаёт зоны урона
│   └── Переопределяй spawnZone() для своих типов зон
└── Кастомные (VoidRayWeapon, LightningChainWeapon и т.д.)
```

### Типы снарядов (`weapons/base/Projectile.ts`)

| Класс                   | Описание                   |
| ----------------------- | -------------------------- |
| `Projectile`            | Базовый летящий снаряд     |
| `BouncingProjectile`    | Отскакивающий (ChronoDisc) |
| `SingularityProjectile` | Чёрная дыра, тянет врагов  |
| `PlasmaProjectile`      | Взрывается при смерти      |
| `OrbitingProjectile`    | Вращается вокруг владельца |
| `LobbedProjectile`      | Летит по дуге к цели       |

### Типы зон (`weapons/base/Zone.ts`)

| Класс                  | Описание                         |
| ---------------------- | -------------------------------- |
| `Zone`                 | Базовая зона урона               |
| `FrostZone`            | Замедляет врагов (`slowEffect`)  |
| `AcidZone`             | Кислотная лужа с пузырьками      |
| `SporeZone`            | Облако спор                      |
| `NanobotCloud`         | Следует за игроком               |
| `MindBlastZone`        | Пульсирующая пси-волна           |
| `DelayedExplosionZone` | Задержка + взрыв (OrbitalStrike) |
| `AbsoluteZeroZone`     | Замораживающий взрыв             |

### Типы лучей (`weapons/base/Beam.ts`)

| Класс            | Описание                                  |
| ---------------- | ----------------------------------------- |
| `Beam`           | Простой визуальный луч                    |
| `VoidRayBeam`    | Заряжающийся луч (фазы: charge→fire→fade) |
| `ChainLightning` | Молния, прыгающая между врагами           |

### Эволюция оружий

При достижении **уровня 6** оружие эволюционирует:
- `evolved = true`
- `damage *= 2`
- `area *= 1.3`
- Новое имя и эмоджи из `WEAPONS[id].evolution`

**Важно:** Эволюция НЕ уменьшает cooldown! Кулдаун меняется только через powerups.

### Апгрейд оружий

```typescript
// Weapon.ts - базовый upgrade()
upgrade(): void {
    this.level++;
    this.evolved = this.level >= 6;
    this.damage *= this.damageScaling; // 1.2x
}
```

**Правило баланса:** При апгрейде увеличивается ТОЛЬКО урон (×1.2). Площадь/скорость/длительность — через powerups.

---

## 👾 Система врагов

### Конфигурация (`data/GameData.ts`)

```typescript
ENEMY_CONFIG = {
    baseHp: 10,
    hpMultiplier: 2,      // HP удваивается для каждого следующего типа
    baseDamage: 5,
    damageMultiplier: 1.5, // Урон ×1.5 для следующего типа
    baseXp: 1,
    xpMultiplier: 1.5,
    baseSpeed: 100,
}
```

### Список врагов (11 типов)

| Index | Имя              | Emoji | Speed Mod |
| ----- | ---------------- | ----- | --------- |
| 0     | Void Bat         | 🦇     | 1.0       |
| 1     | Scout Drone      | 🛸     | 0.8       |
| 2     | Xeno Spider      | 🕷️     | 0.7       |
| 3     | Alien Grunt      | 👾     | 0.9       |
| 4     | Mech Trooper     | 🤖     | 0.6       |
| 5     | Asteroid Golem   | 🪨     | 0.4       |
| 6     | Void Wraith      | 🌀     | 1.1       |
| 7     | Death Walker     | 💀     | 1.2       |
| 8     | Tentacle Horror  | 🐙     | 0.5       |
| 9     | Plasma Elemental | ⚡     | 0.9       |
| 10    | Doom Harbinger   | ☠️     | 1.0       |

### Логика спавна

**Файл:** `GameManager.ts` → `spawnEnemy()`

```typescript
// Волна = 60 секунд
// Переход 90%/10% → 10%/90% между двумя соседними врагами

const waveIndex = Math.floor(gameTime / 60);
const waveProgress = (gameTime % 60) / 60;

const primaryIndex = min(waveIndex, ENEMIES.length - 2);
const secondaryIndex = min(waveIndex + 1, ENEMIES.length - 1);

const secondaryChance = 0.1 + (waveProgress * 0.8);  // 10% → 90%
const type = random() < secondaryChance ? ENEMIES[secondaryIndex] : ENEMIES[primaryIndex];
```

**Временное усиление:**
- HP × min(timeMultiplier, 3) — кап на 3x
- Урон × timeMultiplier — без капа

**Elite враги:** 1% шанс, ×5 HP, ×1.5 размер, цветное свечение.

### Сепарация врагов

Враги не пересекаются благодаря силам сепарации (SpatialHash):

```typescript
// GameManager.update()
for (const enemy of enemies) {
    const nearby = levelSpatialHash.getNearby(enemy.pos, enemy.radius * 3);
    for (const other of nearby) {
        if (other !== enemy) enemy.addSeparationFrom(other, 200);
    }
}
```

---

## 🎨 Анимации оружий

### Пример: OrbitalStrikeWeapon

Сложные оружия комбинируют несколько фаз:

```typescript
class DelayedExplosionZone {
    // Фаза 1: Targeting (0-1s)
    // - Красный круг расширяется
    // - Мигающий warning индикатор
    
    // Фаза 2: Explosion (мгновенно)
    // - Урон всем врагам в радиусе
    // - particles.emitOrbitalStrike()
    
    // Фаза 3: Fade (0.5s)
    // - Shockwave расширяется
    // - Alpha → 0
}
```

### Проблема

Код оружий смешивает:
1. **Targeting** — найти позицию
2. **Damage** — нанести урон
3. **Visual** — анимация фаз

**Возможное решение:** Animation System с `SequenceAnimation` и `ParallelAnimation`.

---

## 🎯 Паттерны кода

### Создание нового оружия

```typescript
// weapons/implementations/MyWeapon.ts
import { ProjectileWeapon } from '../base';
import type { Player } from '../../entities/Player';

export class MyWeapon extends ProjectileWeapon {
    name = "My Weapon";
    emoji = "🔫";
    description = "Does something cool.";
    projectileEmoji = "⚡";
    pierce = 1;

    readonly stats = {
        damage: 20,
        cooldown: 1.5,
        area: 100,
        speed: 400,
        duration: 2,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    // Override для evolved поведения:
    protected createProjectile(params: ProjectileParams): Entity {
        if (this.evolved) {
            return new MyEvolvedProjectile(...);
        }
        return super.createProjectile(params);
    }
}
```

### Добавление в игру

1. Добавь класс в `weapons/implementations/index.ts`
2. Добавь в `data/GameData.ts` → `WEAPONS` массив
3. (Опционально) Добавь класс в `CLASSES` если это стартовое оружие

---

## 🧪 Тестирование

**Запуск:** `npm test`

**Структура тестов:** `src/game/tests/`

```
tests/
├── gameData.test.ts      # Валидация GameData
├── weapons.test.ts       # Тесты оружий
├── projectile.test.ts    # Тесты снарядов
├── zone.test.ts          # Тесты зон
└── ...
```

---

## 🚀 Быстрые команды

```bash
npm run dev        # Запуск dev-сервера
npm run build      # Продакшн сборка
npm test           # Запуск тестов
npx cap sync       # Синхронизация с Android
```

---

## 📐 Coding Conventions

### Расчёт расстояний

**Используй утилиты из `core/Utils.ts`:**

```typescript
// ✅ Правильно: расстояние между двумя точками
import { distance } from '../../core/Utils';
const dist = distance(this.pos, enemy.pos);

// ✅ Правильно: длина вектора (magnitude)
const speed = Math.hypot(velocity.x, velocity.y);

// ❌ Неправильно: ручной расчёт
const dist = Math.sqrt(dx * dx + dy * dy);
```

**Когда что использовать:**

| Случай                           | Функция                |
| -------------------------------- | ---------------------- |
| Расстояние между двумя `Vector2` | `distance(a, b)`       |
| Длина вектора (speed, magnitude) | `Math.hypot(v.x, v.y)` |
| Нормализация вектора             | `normalize(v)`         |

### Избегай дублирования

- **Не изобретай велосипед** — проверь `core/Utils.ts` перед написанием утилит
- **DamageSystem** — весь урон через `damageSystem.dealDamage()` или `dealRawDamage()`
- **SpatialHash** — используй `levelSpatialHash.getNearby()` вместо итерации по всем врагам

---

## ⚠️ Важные правила

1. **Урон всегда через DamageSystem** — не вызывай `enemy.takeDamage()` напрямую
2. **Cooldown НЕ уменьшается при апгрейде** — только через powerups
3. **Эволюция = level >= 6** — проверяй `this.evolved`, не `this.level === 6`
4. **Статы оружия в конструкторе** — копируй из `this.stats` в свойства
5. **onSpawn/onDamage** — используй колбэки, не напрямую GameManager
6. **Язык игры — английский** — весь код, комментарии и строки на английском
7. **Коммиты на английском** — сообщения коммитов всегда на английском языке
8. **Git Flow** — используем conventional commits:
   - `feat:` — новая фича
   - `fix:` — исправление бага  
   - `refactor:` — рефакторинг без изменения поведения
   - `docs:` — документация
   - `test:` — тесты
   - `perf:` — оптимизация производительности
   
   **Формат:** краткий заголовок, пустая строка, тело с bullet points:
   ```
   refactor(damage): centralize damage calculation
   
   - Remove Player.getDamage() method
   - Add source property to Projectile and Zone
   - Update all weapon implementations
   ```

---

## 🤝 Collaboration Guidelines

Этот проект развивается в тесном сотрудничестве с AI-ассистентом. **Важно:**

- **Будь проактивным** — предлагай улучшения, замечай потенциальные проблемы
- **Давай обратную связь** — если видишь лучший подход, скажи об этом
- **Спорь конструктивно** — не принимай всё как истину, задавай вопросы
- **Объясняй решения** — особенно неочевидные архитектурные выборы
- **Предупреждай о рисках** — breaking changes, edge cases, performance issues

Цель — быть равноправным напарником в разработке, а не просто исполнителем задач.

---

## 🤖 AI Development Guidelines

### Parallel Tool Calls
<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool calls, make all of the independent tool calls in parallel. Prioritize calling tools simultaneously whenever the actions can be done in parallel rather than sequentially. For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files into context at the same time. Maximize use of parallel tool calls where possible to increase speed and efficiency. However, if some tool calls depend on previous calls to inform dependent values like the parameters, do NOT call these tools in parallel and instead call them sequentially. Never use placeholders or guess missing parameters in tool calls.
</use_parallel_tool_calls>

### Context Window Management
Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Therefore, do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to memory before the context window refreshes. Always be as persistent and autonomous as possible and complete tasks fully, even if the end of your budget is approaching. Never artificially stop any task early regardless of the context remaining.

---

*Обновлено: Декабрь 2025*
