/**
 * LEVEL-UP OVERLAY — the card panel that smashes in when the player levels.
 *
 * Lifted out of GameManager, which had grown to ~1900 lines with roughly a
 * fifth of them building this one screen. Nothing about picking a card needs
 * the game loop, and nothing in the game loop needs to know what a card looks
 * like; the only traffic between them is the small `LevelUpHost` below.
 *
 * The host is `GameManager` itself, passed as `this`. It is an interface rather
 * than a snapshot on purpose: `player` is replaced on every new run and
 * `devMode` can be toggled mid-session, so anything copied at construction time
 * would go stale.
 */
import type { Player } from '../../entities/Player';
import type { GameState } from '../../core/StateMachine';
import { POWERUPS, WEAPONS } from '../../data/GameData';
import {
    buildUpgradeOptions, getPowerupValue, formatPowerupBonus, formatStatPreview,
    effectivePowerup,
} from '../../core/UpgradePool';
import { audio } from '../../core/AudioSystem';
import { juice } from '../../core/JuiceSystem';
import { t } from '../../core/I18n';
import {
    weaponName, weaponDesc, weaponEvoName, weaponEvoDesc, powerupName, powerupDesc,
} from '../../core/Labels';

/** Everything the level-up panel is allowed to know about the run */
export interface LevelUpHost {
    uiLayer: HTMLElement;
    player: Player | null;
    weaponLevels: Map<string, number>;
    powerupLevels: Map<string, number>;
    devMode: boolean;
    state: GameState;
    addWeapon(weaponId: string): void;
    addEvolvedWeapon(weaponId: string): void;
    applyPowerup(powerup: any): void;
}

export class LevelUpOverlay {
    /** Keyboard cursor over the offered cards */
    private cards: HTMLElement[] = [];
    private focused: number = 0;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    private readonly host: LevelUpHost;

    constructor(host: LevelUpHost) {
        this.host = host;
    }

    /**
     * Tear down the keyboard cursor. Called when a run starts, so a panel
     * abandoned by a restart cannot leave a listener on `window`.
     */
    detach() {
        this.detachKeys();
    }

    show() {
        this.host.state = 'LEVEL_UP';
        audio.play('levelup');
        audio.play('crash');

        // The panel smashes through the screen: flash, freeze, zoom, shake
        juice.flash('#ffffff', 0.6, 0.35);
        juice.addTrauma(0.6);
        juice.zoomPunch(0.8);
        juice.hitStop(0.08);
        const player = this.host.player;
        if (player) {
            juice.shockwave(player.pos.x, player.pos.y, 260, '#66f7ff', 0.5, 6);
        }

        const screen = document.createElement('div');
        screen.className = 'screen level-up-screen crash-in';
        screen.appendChild(this.createImpactOverlay());

        // Heading is appended (not innerHTML) so the crack overlay survives
        const heading = document.createElement('h2');
        screen.appendChild(heading);

        if (this.host.devMode) {
            this.buildDevPanel(screen, heading);
            return;
        }

        // Normal mode: weighted pool biased toward owned weapons (see UpgradePool)
        const isLucky = Math.random() < 0.1;
        const upgradeCount = isLucky ? 6 : 3;

        heading.textContent = isLucky ? t('levelup.lucky') : t('levelup.title');
        if (isLucky) heading.classList.add('lucky');

        const grid = document.createElement('div');
        grid.className = isLucky ? 'upgrade-grid-6' : 'upgrade-grid';
        screen.appendChild(grid);

        // One free reroll every level-up, plus one per Spare Cartridge stack.
        //
        // Three random cards with no way to say "not these" is a lottery, not a
        // decision — and the pool already guarantees an owned weapon in every
        // draw, so a reroll cannot lock you out of your evolution.
        let rerollsLeft = 1 + (player?.stats.reroll ?? 0);

        const reroll = document.createElement('button');
        reroll.className = 'reroll-btn interactive';
        const renderReroll = () => {
            reroll.disabled = rerollsLeft <= 0;
            reroll.innerHTML = `<span class="reroll-icon">⟳</span><span class="reroll-count">${rerollsLeft}</span>`;
            reroll.title = t('levelup.reroll');
        };
        reroll.onclick = () => {
            if (rerollsLeft <= 0) return;
            rerollsLeft--;
            audio.play('uiSelect');
            renderReroll();
            this.fillGrid(grid, screen, upgradeCount);
        };
        reroll.addEventListener('pointerenter', () => audio.play('uiHover'));
        renderReroll();

        this.fillGrid(grid, screen, upgradeCount);
        // Six cards wrap into two rows of three, so vertical steps move by 3
        this.attachKeys(isLucky ? 3 : upgradeCount);
        screen.appendChild(reroll);
        this.host.uiLayer.appendChild(screen);
    }

    /**
     * Cracked-glass overlay for the level-up slam.
     * Cracks are generated per level-up (random impact point + branching
     * fractures), so the break never looks the same twice.
     */
    private createImpactOverlay(): HTMLElement {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'crack-overlay');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');

        const ox = 30 + Math.random() * 40;
        const oy = 30 + Math.random() * 40;
        const spokes = 7 + Math.floor(Math.random() * 5);

        for (let i = 0; i < spokes; i++) {
            const baseAngle = (i / spokes) * Math.PI * 2 + Math.random() * 0.4;
            let x = ox;
            let y = oy;
            let points = `${x},${y}`;
            const segments = 3 + Math.floor(Math.random() * 3);
            for (let s = 0; s < segments; s++) {
                const len = 8 + Math.random() * 22;
                const angle = baseAngle + (Math.random() - 0.5) * 0.7;
                x += Math.cos(angle) * len;
                y += Math.sin(angle) * len;
                points += ` ${x.toFixed(1)},${y.toFixed(1)}`;
            }
            const line = document.createElementNS(svgNS, 'polyline');
            line.setAttribute('points', points);
            line.setAttribute('class', 'crack-line');
            line.style.animationDelay = `${(Math.random() * 0.08).toFixed(3)}s`;
            svg.appendChild(line);
        }

        // A couple of concentric fracture rings around the impact
        for (let r = 1; r <= 2; r++) {
            const ring = document.createElementNS(svgNS, 'circle');
            ring.setAttribute('cx', ox.toFixed(1));
            ring.setAttribute('cy', oy.toFixed(1));
            ring.setAttribute('r', String(r * 7 + Math.random() * 4));
            ring.setAttribute('class', 'crack-ring');
            svg.appendChild(ring);
        }

        return svg as unknown as HTMLElement;
    }

    /** (Re)draw the level-up offers into `grid` */
    private fillGrid(grid: HTMLElement, screen: HTMLElement, count: number) {
        grid.innerHTML = '';
        const cards: HTMLElement[] = [];

        const options = buildUpgradeOptions({
            weaponLevels: this.host.weaponLevels,
            powerupLevels: this.host.powerupLevels,
            classId: this.host.player?.classId,
            // Lets the pool drop perks that have hit a hard ceiling — a
            // Berserker at 100% crit should stop being shown Targeting HUD
            stats: this.host.player?.stats as any,
            count,
        });

        options.forEach((opt, index) => {
            const card = document.createElement('div');
            card.className = 'upgrade-card interactive';
            // Staggered slam-in: each card lands just after the panel impact
            card.style.animationDelay = `${(0.12 + index * 0.06).toFixed(2)}s`;
            card.addEventListener('pointerenter', () => audio.play('uiHover'));
            card.addEventListener('click', () => audio.play('uiSelect'), { capture: true });

            if (opt.type === 'weapon') {
                const weaponData = opt.data;
                const currentLevel = this.host.weaponLevels.get(weaponData.id) || 0;
                const canEvolve = currentLevel === 5;
                const newLevel = currentLevel + 1;

                if (canEvolve) {
                    card.classList.add('evolution-ready');
                }

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponEvoName(weaponData) : weaponName(weaponData);
                const desc = canEvolve ? weaponEvoDesc(weaponData) : weaponDesc(weaponData);
                const levelText = canEvolve
                    ? t('levelup.evolve')
                    : (currentLevel > 0 ? t('levelup.level', { from: currentLevel, to: newLevel }) : t('common.new'));

                card.innerHTML = `
                <div style="font-size: 3em">${emoji}</div>
                <h3>${name}</h3>
                <div class="level-indicator">${levelText}</div>
                <p>${desc}</p>
                ${this.weaponPreview(weaponData, currentLevel, canEvolve)}
              `;

                this.bindPick(card, screen, () => this.host.addWeapon(weaponData.id));
            } else {
                const powerup = opt.data;
                const stack = this.host.powerupLevels.get(powerup.name) ?? 0;
                const raw = getPowerupValue(powerup.value, stack, powerup.stackGrowth);
                // What the pick is worth to THIS player — crit chance past 100%
                // is paid out as crit damage instead (see effectivePowerup)
                const eff = effectivePowerup(powerup.type, raw, this.host.player?.stats as any);
                const value = eff.value;
                const bonus = formatPowerupBonus(eff.type, value);
                const stackText = stack > 0
                    ? t('levelup.level', { from: stack, to: stack + 1 })
                    : t('common.new');
                card.innerHTML = `
                <div style="font-size: 3em">${powerup.emoji}</div>
                <h3>${powerupName(powerup)}</h3>
                <div class="level-indicator">${stackText} · ${bonus}</div>
                <p>${powerupDesc(powerup)}</p>
                ${this.powerupPreview(eff.type, value)}
              `;
                this.bindPick(card, screen, () => this.host.applyPowerup(powerup));
            }

            card.addEventListener('pointerenter', () => this.focusCard(cards.indexOf(card)));
            cards.push(card);
            grid.appendChild(card);
        });

        // Start on the middle card: the reroll button is directly below it, and
        // a centred cursor is one keypress from either edge
        this.cards = cards;
        this.focusCard(Math.floor(cards.length / 2));
    }

    /**
     * Committing a pick.
     *
     * The upgrade used to apply on the same frame as the click, so a level-up
     * was a card vanishing — nothing confirmed that *this* one was the one you
     * took. A brief flash on the chosen card plus a chime gives the choice a
     * moment of weight, and the world is frozen during LEVEL_UP so the delay
     * costs nothing.
     */
    private bindPick(card: HTMLElement, screen: HTMLElement, apply: () => void) {
        let taken = false;
        card.onclick = () => {
            if (taken) return;
            taken = true;
            card.classList.add('upgrade-card--picked');
            audio.play('evolve');
            juice.flash('#ffffff', 0.18, 0.16);

            setTimeout(() => {
                this.detachKeys();
                apply();
                screen.remove();
                this.host.state = 'PLAYING';
            }, 160);
        };
    }

    /** Move the keyboard cursor; clamped, never wraps */
    private focusCard(index: number) {
        if (this.cards.length === 0) return;
        const clamped = Math.max(0, Math.min(this.cards.length - 1, index));
        if (clamped === this.focused && this.cards[clamped].classList.contains('upgrade-card--focused')) return;

        this.cards.forEach(c => c.classList.remove('upgrade-card--focused'));
        this.cards[clamped].classList.add('upgrade-card--focused');
        this.focused = clamped;
    }

    /**
     * WASD / arrows to move, space or enter to take it.
     *
     * Three cards is one row, six is two rows of three — so W/S step by the row
     * width rather than by one, which is what "up" means on a grid.
     */
    private attachKeys(columns: number) {
        this.detachKeys();

        const onKey = (e: KeyboardEvent) => {
            if (this.host.state !== 'LEVEL_UP' || this.cards.length === 0) return;

            let moved = true;
            switch (e.code) {
                case 'KeyA': case 'ArrowLeft': this.focusCard(this.focused - 1); break;
                case 'KeyD': case 'ArrowRight': this.focusCard(this.focused + 1); break;
                case 'KeyW': case 'ArrowUp': this.focusCard(this.focused - columns); break;
                case 'KeyS': case 'ArrowDown': this.focusCard(this.focused + columns); break;
                case 'Space': case 'Enter':
                    e.preventDefault();
                    this.cards[this.focused]?.click();
                    return;
                default: moved = false;
            }

            if (moved) {
                e.preventDefault();
                audio.play('uiHover');
            }
        };

        window.addEventListener('keydown', onKey);
        this.keyHandler = onKey;
    }

    private detachKeys() {
        if (!this.keyHandler) return;
        window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
        this.cards = [];
    }

    /**
     * "124% → 132%" under the flavour text.
     *
     * The description says what a powerup *is*; this says what taking it does to
     * the number you already have, which is what actually decides the pick.
     */
    private powerupPreview(type: string, value: number): string {
        const player = this.host.player;
        if (!player) return '';

        const stats = player.stats as Record<string, number>;
        const current = type === 'maxHp' ? player.maxHp : (stats[type] ?? 0);
        return `<div class="stat-preview">${formatStatPreview(type, current, current + value)}</div>`;
    }

    /** Damage before → after for a weapon card */
    private weaponPreview(weaponData: any, currentLevel: number, canEvolve: boolean): string {
        const player = this.host.player;
        if (currentLevel === 0 || !player) return '';

        const weapon = player.weapons.find((w: any) => w.weaponId === weaponData.id);
        if (!weapon) return '';

        // Upgrades scale damage by 1.2; evolving doubles it (see Weapon.upgrade)
        const next = canEvolve ? weapon.damage * 2 : weapon.damage * 1.2;

        // Shown through `might`, because that is the number that lands. Crit and
        // adrenaline are deliberately left out: both are situational, and a
        // preview that changes with the player's current HP is noise. With
        // GLOBAL_DAMAGE gone, this is now the whole of the calculation.
        const might = player.stats.might;
        return `<div class="stat-preview">${t('levelup.damage')} ${Math.round(weapon.damage * might)} → ${Math.round(next * might)}</div>`;
    }

    // ============================================
    // DEV MODE — every powerup, weapon and evolution, on tabs
    // ============================================

    private buildDevPanel(screen: HTMLElement, heading: HTMLElement) {
        heading.textContent = t('levelup.devMode');

        const tabs = document.createElement('div');
        tabs.className = 'dev-tabs interactive';

        const tabData = [
            { id: 'powerups', label: t('levelup.tabPowerups') },
            { id: 'weapons', label: t('levelup.tabWeapons') },
            { id: 'evolved', label: t('levelup.tabEvolved') }
        ];

        tabData.forEach((tab, index) => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'dev-tab' + (index === 0 ? ' active' : '');
            tabBtn.textContent = tab.label;
            tabBtn.dataset.tab = tab.id;
            tabBtn.onclick = () => this.switchDevTab(tab.id, screen);
            tabs.appendChild(tabBtn);
        });

        screen.appendChild(tabs);

        const grid = document.createElement('div');
        grid.className = 'dev-upgrade-grid';
        grid.id = 'dev-grid';
        screen.appendChild(grid);

        this.host.uiLayer.appendChild(screen);

        this.switchDevTab('powerups', screen);
    }

    switchDevTab(tabId: string, screen: HTMLElement) {
        const tabs = screen.querySelectorAll('.dev-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', (tab as HTMLElement).dataset.tab === tabId);
        });

        const grid = document.getElementById('dev-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const close = () => {
            screen.remove();
            this.host.state = 'PLAYING';
        };

        if (tabId === 'powerups') {
            POWERUPS.forEach(powerup => {
                grid.appendChild(this.createDevCard(
                    powerup.emoji,
                    powerupName(powerup),
                    powerupDesc(powerup),
                    '',
                    () => {
                        this.host.applyPowerup(powerup);
                        close();
                    }
                ));
            });
        } else if (tabId === 'weapons') {
            WEAPONS.forEach(weaponData => {
                const currentLevel = this.host.weaponLevels.get(weaponData.id) || 0;
                if (currentLevel >= 6) return; // Skip fully evolved weapons

                const canEvolve = currentLevel === 5;
                const newLevel = currentLevel + 1;
                const levelText = canEvolve
                    ? t('levelup.evolve')
                    : (currentLevel > 0 ? t('levelup.level', { from: currentLevel, to: newLevel }) : t('common.new'));

                const emoji = canEvolve ? weaponData.evolution.emoji : weaponData.emoji;
                const name = canEvolve ? weaponEvoName(weaponData) : weaponName(weaponData);
                const desc = canEvolve ? weaponEvoDesc(weaponData) : weaponDesc(weaponData);

                grid.appendChild(this.createDevCard(
                    emoji, name, desc, levelText,
                    () => {
                        this.host.addWeapon(weaponData.id);
                        close();
                    },
                    canEvolve
                ));
            });
        } else if (tabId === 'evolved') {
            WEAPONS.forEach(weaponData => {
                const currentLevel = this.host.weaponLevels.get(weaponData.id) || 0;
                if (currentLevel >= 6) return;

                grid.appendChild(this.createDevCard(
                    weaponData.evolution.emoji,
                    weaponEvoName(weaponData),
                    weaponEvoDesc(weaponData),
                    t('levelup.instantEvolve'),
                    () => {
                        this.host.addEvolvedWeapon(weaponData.id);
                        close();
                    },
                    true // use evolution-ready styling
                ));
            });
        }
    }

    private createDevCard(
        emoji: string,
        name: string,
        description: string,
        levelText: string,
        onClick: () => void,
        isEvolutionReady: boolean = false
    ): HTMLElement {
        const card = document.createElement('div');
        card.className = 'upgrade-card interactive';

        if (isEvolutionReady) {
            card.classList.add('evolution-ready');
        }

        card.innerHTML = `
            <div style="font-size: 3em">${emoji}</div>
            <h3>${name}</h3>
            ${levelText ? `<div class="level-indicator">${levelText}</div>` : ''}
            <p>${description}</p>
        `;

        card.onclick = onClick;
        return card;
    }
}
