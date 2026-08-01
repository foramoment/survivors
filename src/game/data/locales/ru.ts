/**
 * Russian strings.
 *
 * Two groups:
 *   - UI chrome, mirroring the keys in en.ts
 *   - game data (weapon/class/powerup/stage), keyed by the entity `id`.
 *     English for those lives in GameData/StageData and is used as the
 *     fallback, so nothing here needs an English twin.
 *
 * Banner strings drawn with the pixel font (arena.*) must be uppercase and
 * limited to the Cyrillic glyphs defined in core/PixelFont.
 */

export const RU: Record<string, string> = {
    'common.on': 'ВКЛ',
    'common.off': 'ВЫКЛ',
    'common.back': '← НАЗАД',
    'common.new': 'НОВОЕ',

    'menu.start': '▶ ИГРАТЬ',
    'menu.options': '⚙ НАСТРОЙКИ',
    'menu.particleLab': '🔬 ЛАБОРАТОРИЯ ЧАСТИЦ',
    'menu.tagline': 'ВЫЖИВИ В КОСМИЧЕСКОМ ХАОСЕ',
    'menu.hint': 'WASD / ТЯНИ МЫШЬЮ · ОРУЖИЕ СТРЕЛЯЕТ САМО',

    'classes.devMode': '🛠️ Режим разработчика (только оружие, 6 вариантов)',
    'classes.hp': '{n} HP',

    'stages.title': 'ВЫБОР АРЕНЫ',
    'stages.duration': '{n} мин + босс',
    'stages.threat': 'Угроза ×{n}',

    'options.title': '⚙️ НАСТРОЙКИ',
    'options.master': 'Общая',
    'options.sfx': 'Эффекты',
    'options.music': 'Музыка',
    'options.screenFx': 'Эффекты экрана',
    'options.language': 'Язык',

    'pause.title': 'ПАУЗА',
    'pause.status': '{stage} · {time} · убийств: {kills}',
    'pause.resume': '▶ ПРОДОЛЖИТЬ',
    'pause.settings': '⚙ НАСТРОЙКИ',
    'pause.quit': '✖ ВЫЙТИ В МЕНЮ',

    'levelup.title': 'НОВЫЙ УРОВЕНЬ!',
    'levelup.lucky': '✨ УДАЧНЫЙ УРОВЕНЬ! ✨',
    'levelup.evolve': 'ЭВОЛЮЦИЯ!',
    'levelup.level': 'ур. {from} → {to}',
    'levelup.devMode': '🛠️ РЕЖИМ РАЗРАБОТЧИКА 🛠️',
    'levelup.tabPowerups': '⚡ Бонусы',
    'levelup.tabWeapons': '⚔️ Оружие',
    'levelup.tabEvolved': '🌟 Эволюции',
    'levelup.instantEvolve': '⚡ МГНОВЕННАЯ ЭВОЛЮЦИЯ',

    'result.gameOver': '💀 ИГРА ОКОНЧЕНА',
    'result.victory': '🏆 ПОБЕДА',
    'result.defeatSubtitle': '{stage} — в этот раз победила пустота',
    'result.victorySubtitle': '{stage} — арена зачищена',
    'result.time': '⏱ ВРЕМЯ',
    'result.kills': '💀 УБИЙСТВ',
    'result.level': '📊 УРОВЕНЬ',
    'result.again': '↻ ЕЩЁ РАЗ',
    'result.menu': '⌂ ГЛАВНОЕ МЕНЮ',

    'hud.level': 'УР {n}',

    'bonus.magnet': 'к радиусу притяжения',
    'bonus.maxHp': 'к макс. HP',
    'bonus.armor': 'к броне',
    'bonus.regen': 'HP/с',
    'bonus.tick': 'с к тику зон',

    'arena.meteors': 'МЕТЕОРИТНЫЙ ДОЖДЬ',
    'arena.blackout': 'ОТКАЗ ПИТАНИЯ',
    'arena.rifts': 'РАЗЛОМЫ ПУСТОТЫ',

    // ---------------------------------------------------------------- weapons
    'weapon.void_ray.name': 'Луч Пустоты',
    'weapon.void_ray.desc': 'Заряженное копьё, прожигающее всё на своём пути',
    'weapon.void_ray.evoName': 'Пушка Пустоты',
    'weapon.void_ray.evoDesc': 'Простреливает цель насквозь и схлопывает точку удара',

    'weapon.phantom_slash.name': 'Фантомный Разрез',
    'weapon.phantom_slash.desc': 'Мгновенно переносится между ближайшими врагами и рассекает их',
    'weapon.phantom_slash.evoName': 'Клинок Измерений',
    'weapon.phantom_slash.evoDesc': 'Каждый разрез рвёт разлом, который замедляет и перемалывает',

    'weapon.plasma_cannon.name': 'Плазменная Пушка',
    'weapon.plasma_cannon.desc': 'Стреляет тяжёлыми взрывными плазменными зарядами',
    'weapon.plasma_cannon.evoName': 'Термоядерное Ядро',
    'weapon.plasma_cannon.evoDesc': 'Заряды создают чёрные дыры при попадании',

    'weapon.nanobot_swarm.name': 'Рой Нанитов',
    'weapon.nanobot_swarm.desc': 'Аура нанитов, перемалывающая всё вблизи',
    'weapon.nanobot_swarm.evoName': 'Улей Нанитов',
    'weapon.nanobot_swarm.evoDesc': 'Дроны кружат вокруг ауры и бросаются на всё рядом',

    'weapon.spore_cloud.name': 'Облако Спор',
    'weapon.spore_cloud.desc': 'Грибница, заражающая всех, кто в неё зашёл',
    'weapon.spore_cloud.evoName': 'Грибной Цвет',
    'weapon.spore_cloud.evoDesc': 'Инфекция становится заразной и расходится от погибших',

    'weapon.singularity_orb.name': 'Сфера Сингулярности',
    'weapon.singularity_orb.desc': 'Медленно ползущее разрушение',
    'weapon.singularity_orb.evoName': 'Чёрная Дыра',
    'weapon.singularity_orb.evoDesc': 'Затягивает и раздавливает всех врагов',

    'weapon.orbital_strike.name': 'Орбитальный Удар',
    'weapon.orbital_strike.desc': 'Отмечает точку и роняет на неё кинетический снаряд',
    'weapon.orbital_strike.evoName': 'Орбитальный Залп',
    'weapon.orbital_strike.evoDesc': 'Череда снарядов, самый тяжёлый — последний',

    'weapon.mind_blast.name': 'Псионный Взрыв',
    'weapon.mind_blast.desc': 'Псионная детонация, оглушающая всех, кого зацепит',
    'weapon.mind_blast.evoName': 'Псионный Каскад',
    'weapon.mind_blast.evoDesc': 'Взрыв прыгает от разума к разуму, оглушая на ходу',

    'weapon.chrono_disc.name': 'Хронодиск',
    'weapon.chrono_disc.desc': 'Диск-бумеранг',
    'weapon.chrono_disc.evoName': 'Раскол Времени',
    'weapon.chrono_disc.evoDesc': 'Диск распадается на временные отголоски',

    'weapon.acid_pool.name': 'Кислотная Лужа',
    'weapon.acid_pool.desc': 'Бросает колбы с кислотой',
    'weapon.acid_pool.evoName': 'Токсичный Потоп',
    'weapon.acid_pool.evoDesc': 'Лужи кислоты при ударе, урон продолжает капать',

    'weapon.lightning_chain.name': 'Цепная Молния',
    'weapon.lightning_chain.desc': 'Разряд с неба перескакивает между ближними врагами',
    'weapon.lightning_chain.evoName': 'Гроза',
    'weapon.lightning_chain.evoDesc': 'Более медленные дуги оставляют трещащие поля статики',

    'weapon.spinning_ember.name': 'Кружащие Угли',
    'weapon.spinning_ember.desc': 'Огненные шары, вращающиеся вокруг тебя',
    'weapon.spinning_ember.evoName': 'Плеть Инферно',
    'weapon.spinning_ember.evoDesc': 'Оставляет горящие следы',

    'weapon.frost_nova.name': 'Ледяная Новая',
    'weapon.frost_nova.desc': 'Морозная аура, замедляющая врагов',
    'weapon.frost_nova.evoName': 'Абсолютный Ноль',
    'weapon.frost_nova.evoDesc': 'Замораживает врагов насмерть, огромный урон',

    'weapon.plasma_grenade.name': 'Плазменная Граната',
    'weapon.plasma_grenade.desc': 'Бросает плазменные гранаты, взрывающиеся при ударе',
    'weapon.plasma_grenade.evoName': 'Кассетная Бомба',
    'weapon.plasma_grenade.evoDesc': 'Три заряда за бросок с цепочкой вторичных взрывов',

    // ---------------------------------------------------------------- classes
    'class.void_walker.name': 'Странник Пустоты',
    'class.void_walker.bonus': 'Скорость +10%',
    'class.cyber_samurai.name': 'Кибер-Самурай',
    'class.cyber_samurai.bonus': 'Крит 15%',
    'class.heavy_gunner.name': 'Тяжёлый Стрелок',
    'class.heavy_gunner.bonus': 'Сила +20%, Скорость -10%',
    'class.technomancer.name': 'Техномант',
    'class.technomancer.bonus': 'Длительность +20%',
    'class.astro_biologist.name': 'Астробиолог',
    'class.astro_biologist.bonus': 'Реген +0.25',
    'class.quantum_physicist.name': 'Квантовый Физик',
    'class.quantum_physicist.bonus': 'Перезарядка -10%',
    'class.exo_marine.name': 'Экзо-Пехотинец',
    'class.exo_marine.bonus': 'Броня +2',
    'class.psionicist.name': 'Псионик',
    'class.psionicist.bonus': 'Площадь +20%',
    'class.time_keeper.name': 'Хранитель Времени',
    'class.time_keeper.bonus': 'Скорость снарядов +20%',
    'class.alien_symbiote.name': 'Чужой Симбионт',
    'class.alien_symbiote.bonus': 'Опыт +20%',
    'class.storm_mage.name': 'Маг Бури',
    'class.storm_mage.bonus': 'Сила +15%',
    'class.berserker.name': 'Берсерк',
    'class.berserker.bonus': 'HP +50%, Броня -2, Сила +10%',
    'class.ice_mage.name': 'Ледяной Маг',
    'class.ice_mage.bonus': 'Площадь +15%, Перезарядка -10%',
    'class.demolitions_expert.name': 'Подрывник',
    'class.demolitions_expert.bonus': 'Площадь +20%, Сила +10%',

    // --------------------------------------------------------------- powerups
    'powerup.nano_repair.name': 'Наноремонт',
    'powerup.nano_repair.desc': 'Нанороботы латают корпус',
    'powerup.targeting_hud.name': 'Прицельный Визор',
    'powerup.targeting_hud.desc': 'Подсветка уязвимых точек',
    'powerup.plasma_core.name': 'Плазменное Ядро',
    'powerup.plasma_core.desc': 'Чистое усиление урона',
    'powerup.cooling_system.name': 'Система Охлаждения',
    'powerup.cooling_system.desc': 'Оружие стреляет чаще',
    'powerup.gravity_well.name': 'Гравитационный Колодец',
    'powerup.gravity_well.desc': 'Кристаллы летят к тебе издалека',
    'powerup.chain_reaction.name': 'Цепная Реакция',
    'powerup.chain_reaction.desc': 'Взрывы больше, зоны шире',
    'powerup.vampiric_link.name': 'Вампирская Связь',
    'powerup.vampiric_link.desc': 'Больше опыта с каждого убийства',
    'powerup.temporal_flux.name': 'Временной Поток',
    'powerup.temporal_flux.desc': 'Эффекты держатся дольше',
    'powerup.berserker_rage.name': 'Ярость Берсерка',
    'powerup.berserker_rage.desc': 'Криты бьют как товарный поезд',
    'powerup.barrier_field.name': 'Барьерное Поле',
    'powerup.barrier_field.desc': 'Усиленная обшивка корпуса',
    'powerup.overclock.name': 'Разгон',
    'powerup.overclock.desc': 'Снаряды летят быстрее',
    'powerup.phase_shift.name': 'Фазовый Сдвиг',
    'powerup.phase_shift.desc': 'Двигаешься быстрее',
    'powerup.rapid_tick.name': 'Частый Тик',
    'powerup.rapid_tick.desc': 'Зоны наносят урон чаще',
    'powerup.void_shield.name': 'Щит Пустоты',
    'powerup.void_shield.desc': 'Плоское снижение получаемого урона',

    // ----------------------------------------------------------------- stages
    'stage.asteroid_fields.name': 'Пояс Астероидов',
    'stage.asteroid_fields.desc': 'Каменные пустоши на краю изведанного космоса. Хорошее место для начала.',
    'stage.derelict_station.name': 'Заброшенная Станция',
    'stage.derelict_station.desc': 'Покинутая орбитальная станция, захваченная машинами и кое-чем похуже.',
    'stage.void_nexus.name': 'Нексус Пустоты',
    'stage.void_nexus.desc': 'Сердце вторжения. Здесь всё хочет твоей смерти.',
};
