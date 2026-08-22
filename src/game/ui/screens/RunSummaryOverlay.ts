/**
 * RUN SUMMARY — the panel that answers "what was that run".
 *
 * Lifted out of GameManager along with the level-up screen. Unlike that one
 * this needs nothing live: a run is over by the time it is shown, so it takes a
 * plain snapshot and is a pure function of it. Scoring, achievements and the
 * leaderboard stay in GameManager, which is where the run's bookkeeping lives —
 * this file only knows how to lay the numbers out.
 */
import { WEAPONS, POWERUPS } from '../../data/GameData';
import type { RunStats } from '../../core/RunStats';
import { formatScore } from '../../core/Score';
import { isStatModified } from '../../core/PlayerStats';
import { isChanceStat } from '../../core/UpgradePool';
import { formatTime } from '../../../engine/Utils';
import { audio } from '../../../engine/AudioSystem';
import { t } from '../../core/I18n';
import { weaponName, weaponEvoName, powerupName } from '../../core/Labels';
import { screenManager } from '../../../engine/ui/ScreenManager';
import { AUTHOR_CREDIT } from '../../core/Credits';

export interface RunSummaryData {
    title: string;
    subtitle: string;
    variant: 'defeat' | 'victory';
    seconds: number;
    kills: number;
    level: number;
    /** Final score and leaderboard position (rank 0 = did not place) */
    score: number;
    rank: number;
    stats: RunStats;
    weaponLevels: Map<string, number>;
    powerupLevels: Map<string, number>;
    /** For the copy-to-clipboard dump */
    stageName: string;
    className: string;
    playerStats: Record<string, number>;
    maxHp: number;
}

/**
 * The whole run as plain text, for pasting into a balance discussion.
 *
 * This exists because reading a build off a screenshot is lossy — the icons are
 * emoji, the stacks are tiny badges, and the derived numbers (kills per second,
 * healing per second, damage per kill) are the ones that actually say whether a
 * build was broken, and none of them are on screen at all.
 */
function runAsText(d: RunSummaryData): string {
    const perSecond = (n: number) => (d.seconds > 0 ? n / d.seconds : 0).toFixed(1);

    // Shares rather than raw totals: what matters is how the run's output was
    // split, and the totals are two lines above. Damage share against kill
    // share is the whole point — a weapon at 60% of the damage and 10% of the
    // killing blows is spread across a crowd, not carrying the run.
    const attributedKills = [...d.stats.weapons.values()].reduce((n, w) => n + w.kills, 0);
    const share = (part: number, whole: number) =>
        whole > 0 ? `${Math.round((part / whole) * 100)}%`.padStart(4) : '   —';

    const weapons = [...d.weaponLevels]
        .map(([id, level]) => {
            const w = WEAPONS.find(x => x.id === id);
            const name = w ? (level >= 6 ? w.evolution.name : w.name) : id;
            const tally = d.stats.weapons.get(id);
            const label = `${name} ${level >= 6 ? '(evolved)' : `lv${level}`}`.padEnd(30);
            const dmg = share(tally?.damage ?? 0, d.stats.totalDamage);
            const kills = share(tally?.kills ?? 0, attributedKills);
            return `  ${label} dmg ${dmg}   kills ${kills}`;
        })
        .join('\n');

    // Perks and hazards land killing blows too (Static Discharge, meteors), and
    // they carry no weapon id. Saying so keeps the shares above honest instead
    // of quietly renormalising the difference away.
    const unattributed = Math.max(0, d.kills - attributedKills);
    const weaponsBlock = unattributed > 0
        ? `${weapons}\n  (perks and hazards: ${unattributed} kills)`
        : weapons;

    const perks = [...d.powerupLevels]
        .map(([name, stacks]) => {
            const p = POWERUPS.find(x => x.name === name);
            return `  ${name} x${stacks}${p ? ` (${p.type})` : ''}`;
        })
        .join('\n');

    // Only stats the run actually moved. A dump that lists `speed: 1` and
    // `growth: 1` — neither of which has any source left in the game — reads
    // like the build touched them and it did not, which is worse than useless
    // in the one artefact used to reason about balance.
    const stats = Object.entries(d.playerStats)
        .filter(([k, v]) => typeof v === 'number' && isStatModified(k, v))
        // A chance says so. `killEcho: 0.3` in this dump was read as "the echo
        // deals 30% damage" — it is the one line here where the raw number is
        // actively misleading, because every other stat in the list IS a size.
        .map(([k, v]) => isChanceStat(k)
            ? `  ${k}: ${Math.round(v * 1000) / 10}% chance`
            : `  ${k}: ${Math.round(v * 1000) / 1000}`)
        .join('\n');

    return [
        `SURVIVORS — ${d.variant === 'victory' ? 'VICTORY' : 'DEFEAT'}`,
        `${d.stageName} · ${d.className}`,
        '',
        `time         ${formatTime(d.seconds)}`,
        `level        ${d.level}`,
        `kills        ${d.kills}  (${perSecond(d.kills)}/s)`,
        `score        ${d.score}${d.rank > 0 ? `  (rank ${d.rank})` : ''}`,
        `max HP       ${Math.round(d.maxHp)}`,
        '',
        `damage       ${Math.round(d.stats.totalDamage)}  (${perSecond(d.stats.totalDamage)}/s)`,
        // Damage is what you put in; these two are what came out of it
        `time to kill ${d.stats.ttk > 0 ? `${d.stats.ttk.toFixed(1)}s per enemy  (${Math.round(d.stats.arenaHp)} HP incoming vs ${Math.round(d.stats.dps)} dps)` : '—'}`,
        `converted    ${d.stats.totalDamage > 0 ? `${Math.round((d.stats.hpDestroyed / d.stats.totalDamage) * 100)}% of damage became kills  (${Math.round(d.stats.hpDestroyed)} enemy HP destroyed)` : '—'}`,
        `best hit     ${Math.round(d.stats.bestHit)}${d.stats.bestHitCrit ? ' (crit)' : ''}`,
        `healed       ${Math.round(d.stats.totalHealed)}  (${perSecond(d.stats.totalHealed)}/s)`,
        `taken        ${Math.round(d.stats.damageTaken)}  (${perSecond(d.stats.damageTaken)}/s)`,
        `in contact   ${formatTime(d.stats.contactSeconds)}  (avg ${d.stats.contactSeconds ? (d.stats.damageTaken / d.stats.contactSeconds).toFixed(1) : 0} HP/s)`,
        `worst pile   ${d.stats.worstPileUp} enemies at once`,
        `untouched    ${formatTime(d.stats.longestUntouched)}`,
        `best combo   x${d.stats.bestMultikill}`,
        '',
        'WEAPONS',
        weaponsBlock || '  (none)',
        '',
        'PERKS',
        perks || '  (none)',
        '',
        'STATS',
        stats || '  (defaults)',
    ].join('\n');
}

/**
 * The three "what happened" numbers, as opposed to the "how far did you get"
 * ones above them. These are the parts of a run people retell.
 */
function createHighlights(data: RunSummaryData): HTMLElement {
    const stats = data.stats;
    const box = document.createElement('div');
    box.className = 'result-highlights';

    const rows: string[] = [];

    if (stats.bestHit > 0) {
        const weapon = WEAPONS.find(w => w.id === stats.bestHitWeaponId);
        const evolved = weapon && (data.weaponLevels.get(weapon.id) ?? 0) >= 6;
        const via = weapon
            ? `${evolved ? weapon.evolution.emoji : weapon.emoji} ${evolved ? weaponEvoName(weapon) : weaponName(weapon)}`
            : '';
        rows.push(`
            <div class="highlight">
                <span>${stats.bestHitCrit ? t('result.bestCrit') : t('result.bestHit')}</span>
                <strong>${formatScore(Math.round(stats.bestHit))}</strong>
                <em>${via}</em>
            </div>`);
    }

    rows.push(`
        <div class="highlight">
            <span>${t('result.untouched')}</span>
            <strong>${formatTime(stats.longestUntouched)}</strong>
        </div>`);

    if (stats.bestMultikill > 1) {
        rows.push(`
            <div class="highlight">
                <span>${t('result.multikill')}</span>
                <strong>×${stats.bestMultikill}</strong>
            </div>`);
    }

    rows.push(`
        <div class="highlight">
            <span>${t('result.totalDamage')}</span>
            <strong>${formatScore(Math.round(stats.totalDamage))}</strong>
        </div>`);

    // What the damage total above cannot say on its own: how long one of the
    // enemies still arriving took to kill, and how much of the damage became a
    // corpse rather than being spread over a crowd that walked away. The
    // per-weapon split behind these lives in the copy-stats dump — on screen it
    // would be a ranking of your own weapons, which is a different thing.
    if (stats.ttk > 0) {
        const converted = stats.totalDamage > 0
            ? Math.round((stats.hpDestroyed / stats.totalDamage) * 100)
            : 0;
        rows.push(`
            <div class="highlight">
                <span>${t('result.timeToKill')}</span>
                <strong>${stats.ttk.toFixed(1)}s</strong>
                <em>${t('result.converted', { percent: converted })}</em>
            </div>`);
    }

    // Shown even at zero, on purpose: "you healed nothing all run" is a fact
    // about the build, and one the player can act on next time
    rows.push(`
        <div class="highlight">
            <span>${t('result.healed')}</span>
            <strong>${formatScore(Math.round(stats.totalHealed))}</strong>
        </div>`);

    // Healing means nothing without what it was healing against
    rows.push(`
        <div class="highlight">
            <span>${t('result.damageTaken')}</span>
            <strong>${formatScore(Math.round(stats.damageTaken))}</strong>
            <em>${t('result.inContact', { time: formatTime(stats.contactSeconds) })}</em>
        </div>`);

    box.innerHTML = rows.join('');
    return box;
}

/**
 * What you actually built, spelled out — the same icons the in-run panel shows,
 * so the end screen answers "what was that run" rather than making you
 * remember. Still no per-weapon damage here: ranking your own weapons on the
 * screen every run turns build variety into a solved problem. The split lives
 * in the copy-stats dump, which is read when someone is asking a balance
 * question rather than every time someone dies.
 */
function createBuildSummary(data: RunSummaryData): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result-build';

    const slots: string[] = [];
    for (const [id, level] of data.weaponLevels) {
        const weapon = WEAPONS.find(w => w.id === id);
        if (!weapon) continue;
        const evolved = level >= 6;
        slots.push(`
            <div class="build-slot${evolved ? ' build-slot--evolved' : ''}" title="${evolved ? weaponEvoName(weapon) : weaponName(weapon)}">
                <span class="build-icon">${evolved ? weapon.evolution.emoji : weapon.emoji}</span>
                <span class="build-badge">${evolved ? '★' : level}</span>
            </div>`);
    }
    for (const [name, stacks] of data.powerupLevels) {
        const powerup = POWERUPS.find(p => p.name === name);
        if (!powerup) continue;
        slots.push(`
            <div class="build-slot" title="${powerupName(powerup)}">
                <span class="build-icon">${powerup.emoji}</span>
                <span class="build-badge">${stacks}</span>
            </div>`);
    }

    box.innerHTML = `<span class="result-build-label">${t('result.build')}</span>
        <div class="result-build-row">${slots.join('')}</div>`;
    return box;
}

/** Shared end-of-run panel for both defeat and victory */
export function showRunSummary(uiLayer: HTMLElement, data: RunSummaryData) {
    const screen = document.createElement('div');
    screen.className = `screen result-screen result-screen--${data.variant}`;

    const title = document.createElement('h1');
    title.textContent = data.title;
    screen.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'result-subtitle';
    subtitle.textContent = data.subtitle;
    screen.appendChild(subtitle);

    // Score is the headline: it is the only number that makes two runs
    // comparable, so it gets its own panel above the breakdown
    const scoreBox = document.createElement('div');
    scoreBox.className = 'result-score';
    scoreBox.innerHTML = `
        <span>${t('result.score')}</span>
        <strong>${formatScore(data.score)}</strong>
        ${data.rank > 0 ? `<em class="result-rank">${t('result.newRecord', { rank: data.rank })}</em>` : ''}
    `;
    screen.appendChild(scoreBox);

    const stats = document.createElement('div');
    stats.className = 'result-stats';
    stats.innerHTML = `
        <div class="result-stat"><span>${t('result.time')}</span><strong>${formatTime(data.seconds)}</strong></div>
        <div class="result-stat"><span>${t('result.kills')}</span><strong>${data.kills}</strong></div>
        <div class="result-stat"><span>${t('result.level')}</span><strong>${data.level}</strong></div>
    `;
    screen.appendChild(stats);
    screen.appendChild(createHighlights(data));
    screen.appendChild(createBuildSummary(data));

    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons menu-buttons--row';

    const again = document.createElement('button');
    again.className = 'pixel-btn pixel-btn--primary interactive';
    again.textContent = t('result.again');
    again.addEventListener('pointerenter', () => audio.play('uiHover'));
    again.onclick = () => {
        audio.play('uiSelect');
        screenManager.goto('class_selection');
    };

    const menu = document.createElement('button');
    menu.className = 'pixel-btn interactive';
    menu.textContent = t('result.menu');
    menu.addEventListener('pointerenter', () => audio.play('uiHover'));
    menu.onclick = () => {
        audio.play('uiBack');
        screenManager.goto('main_menu');
    };

    buttons.appendChild(again);
    buttons.appendChild(menu);
    screen.appendChild(buttons);

    // Copy the run as text. Secondary on purpose — it sits under the two real
    // choices and does not compete with them.
    const copy = document.createElement('button');
    copy.className = 'pixel-btn pixel-btn--ghost interactive result-copy';
    copy.textContent = t('result.copyStats');
    copy.addEventListener('pointerenter', () => audio.play('uiHover'));
    copy.onclick = async () => {
        audio.play('uiSelect');
        try {
            await navigator.clipboard.writeText(runAsText(data));
            copy.textContent = t('result.copied');
        } catch {
            // Clipboard needs a secure context and permission; if it is denied
            // there is still somewhere useful to put the text
            console.log(runAsText(data));
            copy.textContent = t('result.copiedConsole');
        }
        setTimeout(() => { copy.textContent = t('result.copyStats'); }, 2000);
    };
    screen.appendChild(copy);

    const credit = document.createElement('div');
    credit.className = 'menu-credit';
    credit.textContent = AUTHOR_CREDIT;
    screen.appendChild(credit);

    uiLayer.appendChild(screen);
}
