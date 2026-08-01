/**
 * STAGE SELECTION SCREEN - shown after class selection.
 * Carries classIndex/devMode through to the game screen.
 */

import { BaseScreen } from '../BaseScreen';
import { STAGES } from '../../data/StageData';
import { screenManager } from '../ScreenManager';
import { audio } from '../../core/AudioSystem';
import { t } from '../../core/I18n';
import { stageName, stageDesc } from '../../core/Labels';

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
        title.textContent = t('stages.title');
        screen.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'class-grid interactive';

        STAGES.forEach((stage, index) => {
            const minutes = Math.round(stage.duration / 60);
            const card = document.createElement('div');
            card.className = 'class-card interactive';
            card.innerHTML = `
                <div class="class-icon">${stage.emoji}</div>
                <div class="class-name">${stageName(stage)}</div>
                <div class="class-bonus">⏱️ ${t('stages.duration', { n: minutes })}</div>
                <div class="class-bonus">☠️ ${t('stages.threat', { n: stage.hpScale.toFixed(1) })}</div>
                <div class="class-bonus">${stageDesc(stage)}</div>
            `;
            card.style.animationDelay = `${(index * 0.06).toFixed(3)}s`;
            card.addEventListener('pointerenter', () => audio.play('uiHover'));
            card.onclick = () => {
                audio.play('uiSelect');
                this.selectStage(index);
            };
            grid.appendChild(card);
        });

        screen.appendChild(grid);

        const back = this.createPixelButton(t('common.back'), () => screenManager.goto('class_selection'), 'ghost');
        back.style.marginTop = '22px';
        screen.appendChild(back);

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
