import { BaseScreen } from '../BaseScreen';
import { CLASSES, WEAPONS } from '../../data/GameData';
import { screenManager } from '../ScreenManager';
import { audio } from '../../core/AudioSystem';
import { t } from '../../core/I18n';
import { classLabel, classBonus, weaponName } from '../../core/Labels';
import { sprites } from '../../core/SpriteFactory';

export interface ClassSelectionParams {
    devMode?: boolean;
}

export class ClassSelectionScreen extends BaseScreen {
    private devMode: boolean = false;

    enter(params?: ClassSelectionParams): void {
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

        // Title
        const title = document.createElement('h1');
        title.textContent = 'COSMOS SURVIVORS';
        screen.appendChild(title);

        // Dev Mode Checkbox
        const devModeContainer = this.createDevModeToggle();
        screen.appendChild(devModeContainer);

        // Class Grid
        const grid = this.createClassGrid();
        screen.appendChild(grid);

        const back = this.createPixelButton(t('common.back'), () => screenManager.goto('main_menu'), 'ghost');
        back.style.marginTop = '22px';
        screen.appendChild(back);

        this.uiLayer.appendChild(screen);
    }

    private createDevModeToggle(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'dev-mode-container interactive';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'dev-mode-checkbox';
        checkbox.className = 'dev-mode-checkbox';
        checkbox.checked = this.devMode;

        const label = document.createElement('label');
        label.htmlFor = 'dev-mode-checkbox';
        label.className = 'dev-mode-label';
        label.textContent = t('classes.devMode');

        const toggle = () => {
            this.devMode = !this.devMode;
            checkbox.checked = this.devMode;
        };

        checkbox.onclick = toggle;
        label.onclick = toggle;

        container.appendChild(checkbox);
        container.appendChild(label);

        return container;
    }

    private createClassGrid(): HTMLElement {
        const grid = document.createElement('div');
        grid.className = 'class-grid interactive';

        CLASSES.forEach((cls, index) => {
            const weaponData = WEAPONS.find(w => w.id === cls.weaponId);
            const weapon = weaponData ? weaponName(weaponData) : '???';
            const weaponEmoji = weaponData ? weaponData.emoji : '❓';

            const card = document.createElement('div');
            card.className = 'class-card class-card--portrait interactive';
            // The card shows the sprite you will actually be playing, not an
            // emoji standing in for it — same canvas the game renders, exported
            // once as a data URL
            card.innerHTML = `
                <img class="class-portrait" src="${sprites.getPlayerSpriteUrl(cls.id)}" alt="">
                <div class="class-name">${classLabel(cls)}</div>
                <div class="class-bonus">❤️ ${t('classes.hp', { n: cls.hp })}</div>
                <div class="class-bonus">${weaponEmoji} ${weapon}</div>
                <div class="class-bonus class-perk">${classBonus(cls)}</div>
            `;
            // Staggered entrance so the grid cascades in
            card.style.animationDelay = `${(index * 0.045).toFixed(3)}s`;
            card.addEventListener('pointerenter', () => audio.play('uiHover'));
            card.onclick = () => {
                audio.play('uiSelect');
                this.selectClass(index);
            };
            grid.appendChild(card);
        });

        return grid;
    }

    private selectClass(index: number): void {
        // Navigate to stage selection with the chosen class
        screenManager.goto('level_select', {
            classIndex: index,
            devMode: this.devMode
        });
    }
}
