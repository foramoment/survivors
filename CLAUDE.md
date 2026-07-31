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
│   ├── DifficultyDirector.ts # 🎚️ Адаптивная сложность, спавн, волны, мини-боссы
│   ├── SpriteFactory.ts  # 🎨 Процедурные пиксельные спрайты (враги/игрок/фон) — БЕЗ ассетов
│   ├── StageBackdrop.ts  # 🌠 Параллакс арены (небула/звёзды/пол/пыль) + свет стейджа
│   ├── PropField.ts      # 🪨 Препятствия: чанковая генерация, коллизии, отрисовка
│   ├── ArenaEvents.ts    # ☄️ События арены: метеориты, блэкаут, разломы
│   ├── PixelFont.ts      # 🔤 Битмап-шрифт 5×7 в коде (титры, damage numbers)
│   ├── AudioSystem.ts    # 🔊 Процедурный чиптюн Web Audio (SFX + генеративная музыка)
│   ├── JuiceSystem.ts    # 💥 Game feel: тряска, hit-stop, вспышки, zoom, ударные волны
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
    ├── BaseScreen.ts     # Базовый класс экрана + createPixelButton()
    ├── MenuBackdrop.ts   # 🌌 Анимированный пиксельный космос под всеми меню
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

// Без модификаторов (зоны с пре-калькулированным уроном, урон окружения):
damageSystem.dealDamage({ baseDamage: 50, source: null, target: enemy, position: enemy.pos, skipModifiers: true })
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

### JuiceSystem (Singleton)
**Файл:** `core/JuiceSystem.ts`

Весь «game feel». Косметика, никакой игровой логики.

```typescript
juice.addTrauma(0.3);                 // тряска: offset = trauma², спад линейный
juice.hitStop(0.06);                  // заморозка мира на несколько кадров
juice.slowMo(0.3, 0.5);               // замедление времени
juice.flash('#ff0022', 0.3, 0.28);    // полноэкранная вспышка
juice.zoomPunch(0.7);                 // пружинный «удар» камеры
juice.shockwave(x, y, 300, '#fff');   // расширяющееся кольцо в мире
juice.pulseVignette(0.8);             // виньетка (опасность/босс)
```

**Правила:**
1. `Engine` умножает `dt` на `juice.timeScale`; сам `juice.update()` всегда получает **реальное** время.
2. Тряска через trauma — все источники делят один бюджет, стакинг невозможен (кап 1.0).
3. `juice.enabled = false` (Options → Screen FX) полностью отключает эффекты.
4. Старый `gameManager.shake(magnitude, duration)` сохранён и проксирует в trauma.

### AudioSystem (Singleton)
**Файл:** `core/AudioSystem.ts`

Чиптюн по схеме NES: PULSE1 (лид, duty + вибрато), PULSE2 (арпеджио),
TRIANGLE (бас), NOISE (ударные). Тема стейджа сидирует тональность, темп,
последовательность аккордов и 8-нотный мотив. Секции (INTRO → VERSE → CHORUS →
BRIDGE → FINALE) выбираются по `setMusicIntensity(0..1)`.

Шина музыки: waveshaper drive → delay с обратной связью → lowpass, который
открывается с интенсивностью → компрессор. Никаких ассетов и библиотек.

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
| `ChainLightning` | Молния: удар с неба + прыжки по врагам    |

**ChainLightning** прыгает **по одному врагу за `hopInterval`**, а не за один кадр:
геометрия каждой дуги «запекается» при создании (не рандомится каждый кадр),
первый сегмент падает с неба. Настройки: `chainRange`, `hopInterval`,
`damageFalloff`, `maxChainLength`, колбэки `onHit` и `onArc` (последний —
для AoE-следов эволюции).

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

### Логика спавна и адаптивная сложность

**Файлы:** `core/DifficultyDirector.ts` + `GameManager.ts` → `spawnEnemy()`

Спавном управляет **DifficultyDirector** (singleton `difficultyDirector`):
- Спавн через аккумулятор (независим от FPS): `spawnRate = min(30, (2 + gameTime/45) × intensity)`
- **intensity** (0.6–3.0) адаптируется раз в секунду по HP игрока и скорости зачистки (kills/sec vs spawns/sec)
- HP врагов: `(1 + gameTime/240) × (0.75 + 0.25 × intensity)` × `stage.hpScale` — **кап 3x убран**
- Урон: `(1 + gameTime/300) × (0.85 + 0.15 × intensity)` × `stage.damageScale`
- Elite: шанс растёт со временем и intensity, кап 8%
- События на границе волны (каждые 60с): **burst** (кольцо врагов, 8 + wave×4) и **miniboss** (×12 HP, ×2 радиус, HP-бар)

Выбор типа врага — из `stage.enemyPool` (индексы в ENEMIES), микс 90%/10% → 10%/90% внутри волны, как раньше.

### Стейджи

**Файлы:** `data/StageData.ts`, `ui/screens/StageSelectionScreen.ts` (screen id `level_select`)

3 стейджа с собственным пулом врагов, темой фона, множителями и длительностью. По истечении `duration` спавнится финальный босс (miniboss ×3 HP); его смерть = победа (`showVictory`).

Каждый стейдж несёт палитру `visuals: StageVisuals` (цвет пустоты, небулы,
звёзд, пыли, hue пола, экранный свет + виньетка, `flicker`/`pulse`). Её читает
`core/StageBackdrop.ts` — единственное место, где рисуется фон арены:

```
far   (0.22×)  запечённая плитка небула+звёзды        ← ctx.createPattern
stars (0.22×)  ~160 живых мерцающих точек
floor (1.00×)  плитка пола, полупрозрачная (швы вырезаны destination-out)
near  (1.45×)  пыль и обломки перед игроком
```

`drawLighting()` (screen-space, вызывается из `GameManager.draw` после снятия
zoom-трансформа) кладёт цветную заливку + виньетку; `flicker` даёт аварийные
лампы станции, `pulse` — «дыхание» Нексуса. Всё анимированное отключается
вместе с `juice.enabled` (Options → Screen FX).

### Препятствия (PropField)

`props: StageProps` в стейдже задаёт стиль (`rock`/`crate`/`crystal`),
плотность и разброс радиусов. `core/PropField.ts` генерирует их **по чанкам
520×520** из сида `(theme, cx, cy)` — та же клетка всегда даёт те же
препятствия, хранить/стримить нечего, дальние чанки просто выбрасываются.
Круг радиусом 300 вокруг начала координат всегда чист (спавн игрока).

Это единственная часть «глубины уровней», которая влияет на геймплей:

```typescript
propField.update(player.pos);            // стрим чанков
propField.resolve(player);               // выталкивание из препятствия
propField.resolve(enemy, player.pos, enemy.speed * 0.7, dt); // + скольжение вдоль
```

Враги скользят по касательной в сторону игрока — иначе они утыкаются в камень
и стоят. Боссы препятствия игнорируют (проламываются). Снаряды и зоны летят
поверх: препятствия не блокируют урон.

### События арены (ArenaEvents)

`DifficultyDirector` шлёт `{ type: 'arena' }` раз в 30–60с (первое — на 45с,
константы в `ArenaSchedule`), `GameManager` превращает это в `stage.event`:

| Kind       | Стейдж     | Что делает                                                     |
| ---------- | ---------- | -------------------------------------------------------------- |
| `meteors`  | Asteroids  | Метеориты с наземным телеграфом → урон врагам и 8% HP игроку   |
| `blackout` | Station    | Свет гаснет на ~10с (`stageBackdrop.blackout`), враги +30% скор. |
| `rifts`    | Void Nexus | 4 разлома открываются и льют врагов, пока не схлопнутся          |

Правила: **сначала телеграф, потом урон** (баннер + кольцо/спираль), одно
событие за раз, урон окружения — доля от max HP (`hazardDamage`), чтобы
хазарды не обесценивались к концу забега.

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

**CI:** пуш в `main` → `deploy-pages.yml` (тесты + сборка + GitHub Pages).
Сборка Android APK (`android-build.yml`) запускается **только вручную** через
вкладку Actions — чтобы каждый коммит не ждал Gradle.

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

### UI: пиксельная тема

`src/style.css` — единая дизайн-система (токены в `:root`):

- Никаких скруглений и мягких теней. Рамки — `box-shadow: 0 0 0 var(--px) color`,
  глубина — жёсткие смещённые тени с `blur: 0`.
- Анимации короткие и «ступенчатые» (`steps()`, 90–300ms), не плавные фейды.
- Кнопки — только `this.createPixelButton()` из `BaseScreen` (он же вешает
  звуки `uiHover`/`uiSelect`).
- Текст на canvas — `drawPixelText()` из `core/PixelFont`, не `ctx.fillText`.
- Уважай `prefers-reduced-motion` (блок в конце style.css).

### VFX оружий: правила производительности

1. **Никаких эмодзи в игровом рендере.** `ctx.fillText('🌀')` каждый кадр на
   каждой зоне — самый дорогой способ что-то нарисовать. Рисуй фигурами
   (`arc`, `fillRect`, полилинии).
2. **Запекай геометрию один раз.** Зигзаг молнии, спираль разлома, точки
   искр — считай в конструкторе (или раз в 0.05–0.1с), а не каждый кадр:
   иначе эффект «кипит» и жрёт CPU.
3. **Растягивай урон по кадрам.** Цепочка/залп, который наносит 20 ударов в
   одном кадре, даёт всплеск из damage numbers, партиклов и glow. Делай это
   через таймер (`hopInterval`, staggered `delay`).
4. **Бюджет партиклов.** У пресетов разная цена: `emitNuclear` ≈ 390 частиц,
   `emitOrbitalStrike` ≈ 165, `emitOrbitalImpact` ≈ 34. Для залпов бери лёгкие.
5. **`shadowBlur` — дорого.** Максимум один проход на эффект, не на каждый
   штрих.

### Избегай дублирования

- **Не изобретай велосипед** — проверь `core/Utils.ts` перед написанием утилит
- **DamageSystem** — весь урон через `damageSystem.dealDamage()` (с `skipModifiers: true` для пре-калькулированного)
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
