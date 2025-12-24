/**
 * HUD Component - In-game heads-up display
 * 
 * Elements:
 *   - HP bar (top-left)
 *   - Timer (top-center)
 *   - Kill count (top-right)
 *   - XP bar (full width at top)
 *   - Level display (bottom-left)
 *   - Power boost indicator (center, when active)
 */

export interface HUDData {
    hp: number;
    maxHp: number;
    xp: number;
    xpToLevel: number;
    level: number;
    gameTime: number;
    killCount: number;
    powerBoostActive?: boolean;
}

export class HUD {
    private container: HTMLElement | null = null;
    private hpBar: HTMLElement | null = null;
    private xpBar: HTMLElement | null = null;
    private timer: HTMLElement | null = null;
    private killCount: HTMLElement | null = null;
    private levelDisplay: HTMLElement | null = null;
    private powerBoostIndicator: HTMLElement | null = null;

    create(parent: HTMLElement): void {
        const hud = document.createElement('div');
        hud.className = 'hud';
        hud.style.display = 'block';
        hud.innerHTML = `
            <div class="hud-top">
                <div class="bar-container">
                    <div class="hp-bar-fill" id="hp-bar"></div>
                </div>
                <div class="stats" id="timer">00:00</div>
                <div class="stats" id="kill-count">💀 0</div>
            </div>
            <div class="xp-bar-container">
                <div class="xp-bar-fill" id="xp-bar"></div>
            </div>
            <div class="stats" style="position:absolute; bottom: 10px; left: 10px;" id="level-display">LVL 1</div>
            <div class="stats" style="position:absolute; top: 60px; left: 50%; transform: translateX(-50%); display: none; background: rgba(255, 215, 0, 0.3); padding: 10px 20px; border: 2px solid gold; border-radius: 10px; font-size: 20px; animation: pulse 0.5s infinite;" id="power-boost-indicator">⭐ POWER BOOST x10 ⭐</div>
        `;

        parent.appendChild(hud);
        this.container = hud;

        // Cache DOM references
        this.hpBar = document.getElementById('hp-bar');
        this.xpBar = document.getElementById('xp-bar');
        this.timer = document.getElementById('timer');
        this.killCount = document.getElementById('kill-count');
        this.levelDisplay = document.getElementById('level-display');
        this.powerBoostIndicator = document.getElementById('power-boost-indicator');
    }

    destroy(): void {
        this.container?.remove();
        this.container = null;
        this.hpBar = null;
        this.xpBar = null;
        this.timer = null;
        this.killCount = null;
        this.levelDisplay = null;
        this.powerBoostIndicator = null;
    }

    update(data: HUDData): void {
        if (this.hpBar) {
            const hpPercent = (data.hp / data.maxHp) * 100;
            this.hpBar.style.width = `${hpPercent}%`;
        }

        if (this.xpBar) {
            const xpPercent = (data.xp / data.xpToLevel) * 100;
            this.xpBar.style.width = `${xpPercent}%`;
        }

        if (this.timer) {
            const mins = Math.floor(data.gameTime / 60);
            const secs = Math.floor(data.gameTime % 60);
            this.timer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        if (this.killCount) {
            this.killCount.textContent = `💀 ${data.killCount}`;
        }

        if (this.levelDisplay) {
            this.levelDisplay.textContent = `LVL ${data.level}`;
        }

        if (this.powerBoostIndicator) {
            this.powerBoostIndicator.style.display = data.powerBoostActive ? 'block' : 'none';
        }
    }
}
