/**
 * ENGINE - Main game engine with screen management
 * 
 * Responsibilities:
 *   - Canvas and rendering setup
 *   - Screen registration and initialization
 *   - Main game loop
 *   - Coordination between ScreenManager and GameManager
 */

import { GameManager } from '../GameManager';
import { screenManager } from '../ui/ScreenManager';
import { MainMenuScreen } from '../ui/screens/MainMenuScreen';
import { ClassSelectionScreen } from '../ui/screens/ClassSelectionScreen';
import { GameScreen } from '../ui/screens/GameScreen';
import { OptionsScreen } from '../ui/screens/OptionsScreen';
import { GameOverScreen } from '../ui/screens/GameOverScreen';
import { ParticleDebugScreen } from '../ui/screens/ParticleDebugScreen';
import { StageSelectionScreen } from '../ui/screens/StageSelectionScreen';
import { RecordsScreen } from '../ui/screens/RecordsScreen';
import { AchievementsScreen } from '../ui/screens/AchievementsScreen';
import { menuBackdrop } from '../ui/MenuBackdrop';
import { juice } from './JuiceSystem';
import { i18n } from './I18n';

export class Engine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    gameManager: GameManager;
    lastTime: number = 0;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Create GameManager (without auto-showing class selection)
        this.gameManager = new GameManager(this.canvas, this.ctx);

        // Register all screens
        this.registerScreens();

        // Escape pauses/resumes a run (keyboard); the HUD button covers touch
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape') return;
            if (screenManager.currentScreenId !== 'game') return;
            e.preventDefault();
            this.gameManager.togglePause();
        });

        // Menus build their DOM in enter(), so a language switch just re-enters
        // the current screen. The game screen is excluded on purpose: re-entering
        // it would restart the run. GameManager rebuilds its own pause overlay.
        i18n.onChange(() => {
            if (screenManager.currentScreenId === 'game') return;
            screenManager.reload();
        });

        // Start at main menu
        screenManager.goto('main_menu');

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
    }

    private registerScreens(): void {
        // Main Menu
        screenManager.register('main_menu', new MainMenuScreen(this.canvas, this.ctx));

        // Class Selection - with callback to start game
        const classSelection = new ClassSelectionScreen(this.canvas, this.ctx);
        screenManager.register('class_selection', classSelection);

        // Game Screen - with callback to start game via GameManager
        const gameScreen = new GameScreen(this.canvas, this.ctx);
        screenManager.register('game', gameScreen);

        // Stage Selection
        screenManager.register('level_select', new StageSelectionScreen(this.canvas, this.ctx));

        // Options
        screenManager.register('options', new OptionsScreen(this.canvas, this.ctx));

        // Local leaderboard
        screenManager.register('records', new RecordsScreen(this.canvas, this.ctx));

        // Achievements
        screenManager.register('achievements', new AchievementsScreen(this.canvas, this.ctx));

        // Game Over
        screenManager.register('game_over', new GameOverScreen(this.canvas, this.ctx));

        // Particle Debug
        screenManager.register('particle_debug', new ParticleDebugScreen(this.canvas, this.ctx));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /** A paused run freezes the whole loop; menus keep animating */
    private isPaused(): boolean {
        return screenManager.currentScreenId === 'game' && this.gameManager.state === 'PAUSED';
    }

    loop(timestamp: number) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab is inactive
        const safeDt = Math.min(dt, 0.1);

        // Paused: do no work at all. The canvas is left untouched, so the last
        // rendered frame stays on screen under the DOM overlay — nothing to
        // clear, nothing to redraw, no juice timers draining.
        if (this.isPaused()) {
            requestAnimationFrame((t) => this.loop(t));
            return;
        }

        // Juice runs on real time so hit-stop and flashes resolve while the
        // world is frozen; gameplay gets the scaled delta.
        juice.update(safeDt);
        const gameDt = safeDt * juice.timeScale;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background
        this.drawBackground(safeDt);

        // Update and draw current screen
        screenManager.update(safeDt);

        // GameManager handles its own update/draw when game is active
        if (screenManager.currentScreenId === 'game') {
            this.gameManager.update(gameDt);
            this.gameManager.draw(this.ctx);

            // Update HUD via GameScreen
            const gameScreen = screenManager.get('game') as GameScreen;
            if (gameScreen && this.gameManager.player) {
                gameScreen.updateHUD({
                    hp: this.gameManager.player.hp,
                    maxHp: this.gameManager.player.maxHp,
                    xp: this.gameManager.player.xp,
                    xpToLevel: this.gameManager.player.nextLevelXp,
                    level: this.gameManager.player.level,
                    gameTime: this.gameManager.gameTime,
                    killCount: this.gameManager.killCount,
                    score: this.gameManager.liveScore,
                });
            }
        }

        screenManager.draw(this.ctx);

        // Flashes / vignette sit above everything drawn on the canvas
        juice.drawOverlay(this.ctx, this.canvas.width, this.canvas.height);

        requestAnimationFrame((t) => this.loop(t));
    }

    drawBackground(dt: number) {
        if (screenManager.currentScreenId === 'game') {
            // The stage tile pattern covers the screen; this is just a base coat
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        // Menus get the animated pixel-space scene
        menuBackdrop.update(dt, this.canvas.width, this.canvas.height);
        menuBackdrop.draw(this.ctx, this.canvas.width, this.canvas.height);
    }

    /**
     * Get the GameManager instance (for screens to interact with)
     */
    getGameManager(): GameManager {
        return this.gameManager;
    }
}

// Export singleton for global access
export let engine: Engine;

export function initEngine(): Engine {
    engine = new Engine();
    return engine;
}
