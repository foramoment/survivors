/**
 * STAGE SELECTION SCREEN - shown after class selection.
 * Carries classIndex/devMode through to the game screen.
 */

import { BaseScreen } from '../BaseScreen';
import { STAGES } from '../../data/StageData';
import { screenManager } from '../ScreenManager';

export interface StageSelectionParams {
    classIndex: number;
    devMode?: boolean;
}

export class StageSelectionScreen extends BaseScreen {
    private classIndex: number = 0;
    private devMode: boolean = false;

    enter(params?: StageSelectionParams): void {
        this.classIndex = params?.classIndex ?? 0;
        this.devMode = params?.devMode ?? false;

        this.clearUI();
        this.createScreen();
    }

    exit(): void {
        this.clearUI();
    }

    private createScreen(): void {
        const screen = document.createElement('div');
        screen.className = 'screen';

        const title = document.createElement('h1');
        title.textContent = 'SELECT STAGE';
        screen.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'class-grid';

        STAGES.forEach((stage, index) => {
            const minutes = Math.round(stage.duration / 60);
            const card = document.createElement('div');
            card.className = 'class-card interactive';
            card.innerHTML = `
                <div class="class-icon">${stage.emoji}</div>
                <div class="class-name">${stage.name}</div>
                <div class="class-bonus">⏱️ ${minutes} min + boss</div>
                <div class="class-bonus">☠️ Threat ×${stage.hpScale.toFixed(1)}</div>
                <div class="class-bonus">${stage.description}</div>
            `;
            card.onclick = () => this.selectStage(index);
            grid.appendChild(card);
        });

        screen.appendChild(grid);
        this.uiLayer.appendChild(screen);
    }

    private selectStage(index: number): void {
        screenManager.goto('game', {
            classIndex: this.classIndex,
            devMode: this.devMode,
            stageIndex: index,
        });
    }
}
