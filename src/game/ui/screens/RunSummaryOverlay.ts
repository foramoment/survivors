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
import { formatTime } from '../../core/Utils';
import { audio } from '../../core/AudioSystem';
import { t } from '../../core/I18n';
import { weaponName, weaponEvoName, powerupName } from '../../core/Labels';
import { screenManager } from '../ScreenManager';
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

    // Shown even at zero, on purpose: "you healed nothing all run" is a fact
    // about the build, and one the player can act on next time
    rows.push(`
        <div class="highlight">
            <span>${t('result.healed')}</span>
            <strong>${formatScore(Math.round(stats.totalHealed))}</strong>
        </div>`);

    box.innerHTML = rows.join('');
    return box;
}

/**
 * What you actually built, spelled out — the same icons the in-run panel shows,
 * so the end screen answers "what was that run" rather than making you
 * remember. Deliberately no per-weapon damage: ranking your own weapons would
 * turn build variety into a solved problem.
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

    const credit = document.createElement('div');
    credit.className = 'menu-credit';
    credit.textContent = AUTHOR_CREDIT;
    screen.appendChild(credit);

    uiLayer.appendChild(screen);
}
