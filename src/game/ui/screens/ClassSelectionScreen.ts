import { BaseScreen } from '../BaseScreen';
import { CLASSES, WEAPONS } from '../../data/GameData';
import { screenManager } from '../ScreenManager';

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
        label.textContent = '🛠️ Developer Mode (Weapons Only, 6 Options)';

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
        grid.className = 'class-grid';

        CLASSES.forEach((cls, index) => {
            const weaponData = WEAPONS.find(w => w.id === cls.weaponId);
            const weaponName = weaponData ? weaponData.name : 'Unknown';
            const weaponEmoji = weaponData ? weaponData.emoji : '❓';

            const card = document.createElement('div');
            card.className = 'class-card interactive';
            card.innerHTML = `
                <div class="class-icon">${cls.emoji}</div>
                <div class="class-name">${cls.name}</div>
                <div class="class-bonus">❤️ ${cls.hp} HP</div>
                <div class="class-bonus">${weaponEmoji} ${weaponName}</div>
                <div class="class-bonus">${cls.bonus}</div>
            `;
            card.onclick = () => this.selectClass(index);
            grid.appendChild(card);
        });

        return grid;
    }

    private selectClass(index: number): void {
        // Navigate to game screen with selected class
        screenManager.goto('game', {
            classIndex: index,
            devMode: this.devMode
        });
    }
}
