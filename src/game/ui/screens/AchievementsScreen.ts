/**
 * ACHIEVEMENTS SCREEN — the list, locked and unlocked.
 *
 * Locked entries show their name and requirement rather than hiding behind
 * question marks: the whole point is to suggest ways to play you would not have
 * tried, and a hidden goal suggests nothing.
 */

import { BaseScreen } from '../../../engine/ui/BaseScreen';
import { screenManager } from '../../../engine/ui/ScreenManager';
import { ACHIEVEMENTS, loadUnlocked, resetAchievements, achievements } from '../../core/Achievements';
import { t, tf } from '../../core/I18n';

export class AchievementsScreen extends BaseScreen {
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

        const unlocked = loadUnlocked();

        const title = document.createElement('h1');
        title.textContent = t('achievements.title');
        screen.appendChild(title);

        const progress = document.createElement('p');
        progress.className = 'records-empty';
        progress.textContent = t('achievements.progress', {
            done: unlocked.size,
            total: ACHIEVEMENTS.length,
        });
        screen.appendChild(progress);

        const list = document.createElement('div');
        list.className = 'achievement-list interactive';
        ACHIEVEMENTS.forEach((achievement, index) => {
            const done = unlocked.has(achievement.id);
            const row = document.createElement('div');
            row.className = 'achievement' + (done ? ' achievement--done' : '');
            row.style.animationDelay = `${(index * 0.03).toFixed(3)}s`;
            row.innerHTML = `
                <span class="achievement-icon">${done ? achievement.emoji : '🔒'}</span>
                <span class="achievement-text">
                    <strong>${tf(`achievement.${achievement.id}.name`, achievement.name)}</strong>
                    <em>${tf(`achievement.${achievement.id}.desc`, achievement.description)}</em>
                </span>
            `;
            list.appendChild(row);
        });
        screen.appendChild(list);

        const buttons = document.createElement('div');
        buttons.className = 'menu-buttons';
        if (unlocked.size > 0) {
            buttons.appendChild(this.createPixelButton(t('achievements.clear'), () => {
                resetAchievements();
                achievements.reload();
                screenManager.reload();
            }, 'danger'));
        }
        buttons.appendChild(
            this.createPixelButton(t('common.back'), () => screenManager.goto('main_menu'), 'ghost')
        );
        screen.appendChild(buttons);

        this.uiLayer.appendChild(screen);
    }
}
