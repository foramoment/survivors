/**
 * ACHIEVEMENT TOAST — the unlock popup.
 *
 * Slides up from the bottom-right, holds, slides back. One at a time and
 * queued: two overlapping toasts in the middle of a fight are unreadable, and
 * an unlock that arrives while you are being eaten should wait its turn rather
 * than compete for attention.
 *
 * Bottom-right on purpose — the build panel owns bottom-left and the HUD owns
 * the top, so this is the only corner where a box can appear without covering
 * something you are reading.
 */

import { audio } from '../../../engine/AudioSystem';
import { achievements, type Achievement } from '../../core/Achievements';
import { tf } from '../../core/I18n';

/** Seconds a toast stays up, including its slide in and out */
const TOAST_LIFETIME = 3.4;

export class AchievementToast {
    private container: HTMLElement | null = null;
    private current: HTMLElement | null = null;
    private timer: number = 0;

    create(parent: HTMLElement): void {
        const host = document.createElement('div');
        host.className = 'toast-host';
        parent.appendChild(host);
        this.container = host;
    }

    destroy(): void {
        this.container?.remove();
        this.container = null;
        this.current = null;
        this.timer = 0;
    }

    update(dt: number): void {
        if (!this.container) return;

        if (this.current) {
            this.timer -= dt;
            if (this.timer > 0) return;
            // Let the exit animation finish before the node goes
            const leaving = this.current;
            this.current = null;
            leaving.classList.add('toast--leaving');
            setTimeout(() => leaving.remove(), 260);
            return;
        }

        const next = achievements.take();
        if (next) this.show(next);
    }

    private show(achievement: Achievement): void {
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">${achievement.emoji}</span>
            <span class="toast-text">
                <strong>${tf(`achievement.${achievement.id}.name`, achievement.name)}</strong>
                <em>${tf(`achievement.${achievement.id}.desc`, achievement.description)}</em>
            </span>
        `;

        this.container.appendChild(toast);
        this.current = toast;
        this.timer = TOAST_LIFETIME;
        audio.play('evolve');
    }
}
