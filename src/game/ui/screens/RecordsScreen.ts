/**
 * RECORDS SCREEN - the local leaderboard.
 *
 * Local only, by design: the build is a static bundle that has to run offline
 * under Capacitor, so there is nothing to sync to. See core/Score.
 */

import { BaseScreen } from '../../../engine/ui/BaseScreen';
import { screenManager } from '../../../engine/ui/ScreenManager';
import { loadScores, clearScores, formatScore, type ScoreEntry } from '../../core/Score';
import { STAGES } from '../../data/StageData';
import { CLASSES } from '../../data/GameData';
import { stageName, classLabel } from '../../core/Labels';
import { t } from '../../core/I18n';

export class RecordsScreen extends BaseScreen {
    enter(): void {
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
        title.textContent = t('records.title');
        screen.appendChild(title);

        const scores = loadScores();
        screen.appendChild(scores.length === 0 ? this.createEmptyState() : this.createTable(scores));

        const buttons = document.createElement('div');
        buttons.className = 'menu-buttons';

        if (scores.length > 0) {
            buttons.appendChild(this.createPixelButton(t('records.clear'), () => {
                clearScores();
                screenManager.reload();
            }, 'danger'));
        }
        buttons.appendChild(this.createPixelButton(t('common.back'), () => screenManager.goto('main_menu'), 'ghost'));

        screen.appendChild(buttons);
        this.uiLayer.appendChild(screen);
    }

    private createEmptyState(): HTMLElement {
        const empty = document.createElement('p');
        empty.className = 'records-empty';
        empty.textContent = t('records.empty');
        return empty;
    }

    private createTable(scores: ScoreEntry[]): HTMLElement {
        const table = document.createElement('div');
        table.className = 'records-table interactive';

        scores.forEach((entry, index) => {
            const stage = STAGES.find(s => s.id === entry.stageId);
            const cls = CLASSES.find(c => c.id === entry.classId);

            const mins = Math.floor(entry.seconds / 60).toString().padStart(2, '0');
            const secs = Math.floor(entry.seconds % 60).toString().padStart(2, '0');

            const row = document.createElement('div');
            row.className = 'records-row' + (entry.victory ? ' records-row--victory' : '');
            row.style.animationDelay = `${(index * 0.04).toFixed(3)}s`;
            row.innerHTML = `
                <span class="records-rank">${index + 1}</span>
                <span class="records-score">${formatScore(entry.score)}</span>
                <span class="records-meta">
                    ${cls ? `${cls.emoji} ${classLabel(cls)}` : '—'}
                    · ${stage ? stageName(stage) : entry.stageId}
                </span>
                <span class="records-detail">${mins}:${secs} · ${t('records.kills', { n: entry.kills })} · ${t('hud.level', { n: entry.level })}</span>
                ${entry.victory ? `<span class="records-badge">${t('records.won')}</span>` : ''}
            `;
            table.appendChild(row);
        });

        return table;
    }
}
