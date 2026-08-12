/**
 * English UI strings.
 *
 * Only chrome lives here. Weapon / class / powerup / stage text stays in
 * GameData and StageData and reaches the UI through `tf(key, fallback)` — see
 * core/I18n. That keeps the game data single-sourced; ru.ts is the only file
 * that carries a second copy.
 */

export const EN: Record<string, string> = {
    'common.on': 'ON',
    'common.off': 'OFF',
    'common.back': '← BACK',
    'common.new': 'NEW',

    'menu.start': '▶ START',
    'menu.options': '⚙ OPTIONS',
    'menu.records': '🏅 RECORDS',
    'menu.achievements': '🎖 ACHIEVEMENTS',
    'menu.particleLab': '🔬 PARTICLE LAB',
    'menu.tagline': 'SURVIVE THE COSMIC CHAOS',
    'menu.hint': 'WASD / DRAG TO MOVE · WEAPONS FIRE THEMSELVES',

    'classes.devMode': '🛠️ Developer Mode (pick any weapon or perk)',
    'classes.hp': '{n} HP',

    'stages.title': 'SELECT STAGE',
    'stages.duration': '{n} min + boss',
    'stages.threat': 'Threat ×{n}',

    'options.title': '⚙️ OPTIONS',
    'options.master': 'Master',
    'options.sfx': 'Effects',
    'options.music': 'Music',
    'options.screenFx': 'Screen FX',
    'options.damageNumbers': 'Damage numbers',
    'options.language': 'Language',

    'pause.title': 'PAUSED',
    'pause.status': '{stage} · {time} · {kills} kills',
    'pause.resume': '▶ RESUME',
    'pause.settings': '⚙ SETTINGS',
    'pause.quit': '✖ QUIT TO MENU',

    'levelup.title': 'LEVEL UP!',
    'levelup.lucky': '✨ LUCKY LEVEL UP! ✨',
    'levelup.evolve': 'EVOLVE!',
    'levelup.level': 'lv {from} → {to}',
    'levelup.devMode': '🛠️ DEVELOPER MODE 🛠️',
    'levelup.tabPowerups': '⚡ Powerups',
    'levelup.tabWeapons': '⚔️ Weapons',
    'levelup.tabEvolved': '🌟 Evolved',
    'levelup.instantEvolve': '⚡ INSTANT EVOLVE',
    'levelup.reroll': 'Reroll these cards',
    'levelup.damage': 'DMG',

    'result.gameOver': '💀 GAME OVER',
    'result.victory': '🏆 VICTORY',
    'result.defeatSubtitle': '{stage} — the void wins this time',
    'result.victorySubtitle': '{stage} cleared',
    'result.time': '⏱ TIME',
    'result.kills': '💀 KILLS',
    'result.level': '📊 LEVEL',
    'result.score': 'SCORE',
    'result.newRecord': 'NEW RECORD · #{rank}',
    'result.bestHit': 'BIGGEST HIT',
    'result.bestCrit': 'BIGGEST CRIT',
    'result.untouched': 'UNTOUCHED FOR',
    'result.multikill': 'BEST MULTIKILL',
    'result.totalDamage': 'DAMAGE DEALT',
    'result.healed': 'HP RESTORED',
    'result.damageTaken': 'DAMAGE TAKEN',
    'result.inContact': 'over {time} in contact',
    'result.build': 'YOUR BUILD',
    'result.again': '↻ PLAY AGAIN',
    'result.copyStats': 'Copy run stats',
    'result.copied': 'Copied',
    'result.copiedConsole': 'Sent to console',
    'result.menu': '⌂ MAIN MENU',

    'hud.level': 'LVL {n}',

    'records.title': '🏅 RECORDS',
    'records.empty': 'No runs yet. Go and die a few times.',
    'records.clear': '🗑 CLEAR',
    'records.kills': '{n} kills',
    'records.won': 'CLEARED',

    'achievements.title': '🎖 ACHIEVEMENTS',
    'achievements.progress': '{done} of {total} unlocked',
    'achievements.clear': '🗑 RESET',

    // Suffixes for flat powerup bonuses (see UpgradePool.formatPowerupBonus)
    'bonus.magnet': 'pull range',
    'bonus.maxHp': 'Max HP',
    'bonus.shield': 'shield',
    'bonus.armor': 'armor',
    // Static Discharge stacks are tiers of behaviour, not units of charge —
    // see DISCHARGE_MAX_STACKS in core/Tactics
    'bonus.discharge': 'tier',
    'bonus.reroll': 'reroll',
    // Suffix for percentages that are a probability rather than a size
    'bonus.chance': 'chance',

    // Arena event banners — drawn with the pixel font, uppercase only
    'arena.meteors': 'METEOR SHOWER',
    'arena.blackout': 'POWER FAILURE',
    'arena.rifts': 'VOID RIFTS',
};
