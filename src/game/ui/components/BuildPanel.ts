/**
 * BUILD PANEL — what you are actually running, on screen, all the time.
 *
 * Everything a run accumulates — five weapons, their levels, up to eight stacks
 * each of seventeen powerups — was invisible. At the end of a ten-minute run a
 * player could not say what they had built, and mid-run they could not tell
 * whether the weapon they were offered was one pick from evolving.
 *
 * Two rows of icons: weapons on top with their level (or a star once evolved),
 * powerups below with their stack count.
 *
 * Rebuilt only when the composition actually changes. The HUD updates every
 * frame and this is DOM, so the signature check is the difference between a
 * free panel and one that thrashes the layout sixty times a second.
 */

import { WEAPONS, POWERUPS } from '../../data/GameData';
import { weaponName, weaponEvoName, powerupName } from '../../core/Labels';

export interface BuildPanelData {
    /** weaponId -> level (1..6) */
    weaponLevels: Map<string, number>;
    /** powerup name -> stacks taken */
    powerupLevels: Map<string, number>;
}

/** Level at which a weapon is evolved (see Weapon.upgrade) */
const EVOLVED_LEVEL = 6;

export class BuildPanel {
    private container: HTMLElement | null = null;
    private weaponRow: HTMLElement | null = null;
    private powerupRow: HTMLElement | null = null;
    /** Last rendered composition, so an unchanged frame costs nothing */
    private signature: string = '';

    create(parent: HTMLElement): void {
        const panel = document.createElement('div');
        panel.className = 'build-panel';
        panel.innerHTML = `
            <div class="build-row build-row--weapons"></div>
            <div class="build-row build-row--powerups"></div>
        `;
        parent.appendChild(panel);

        this.container = panel;
        this.weaponRow = panel.querySelector('.build-row--weapons');
        this.powerupRow = panel.querySelector('.build-row--powerups');
        this.signature = '';
    }

    destroy(): void {
        this.container?.remove();
        this.container = null;
        this.weaponRow = null;
        this.powerupRow = null;
        this.signature = '';
    }

    /** Force a redraw on the next update (used when the language changes) */
    invalidate(): void {
        this.signature = '';
    }

    update(data: BuildPanelData): void {
        if (!this.weaponRow || !this.powerupRow) return;

        const signature = this.buildSignature(data);
        if (signature === this.signature) return;
        this.signature = signature;

        this.weaponRow.innerHTML = '';
        for (const [id, level] of data.weaponLevels) {
            const weapon = WEAPONS.find(w => w.id === id);
            if (!weapon) continue;
            const evolved = level >= EVOLVED_LEVEL;
            this.weaponRow.appendChild(this.createSlot(
                evolved ? weapon.evolution.emoji : weapon.emoji,
                evolved ? '★' : String(level),
                evolved ? weaponEvoName(weapon) : weaponName(weapon),
                evolved,
                // One pick from evolving is worth flagging while you can still act on it
                level === EVOLVED_LEVEL - 1,
            ));
        }

        this.powerupRow.innerHTML = '';
        for (const [name, stacks] of data.powerupLevels) {
            const powerup = POWERUPS.find(p => p.name === name);
            if (!powerup) continue;
            this.powerupRow.appendChild(this.createSlot(
                powerup.emoji,
                String(stacks),
                powerupName(powerup),
                false,
                false,
            ));
        }
    }

    private buildSignature(data: BuildPanelData): string {
        const weapons = [...data.weaponLevels].map(([id, lv]) => `${id}:${lv}`).join(',');
        const powerups = [...data.powerupLevels].map(([n, s]) => `${n}:${s}`).join(',');
        return `${weapons}|${powerups}`;
    }

    private createSlot(emoji: string, badge: string, label: string, evolved: boolean, ready: boolean): HTMLElement {
        const slot = document.createElement('div');
        slot.className = 'build-slot'
            + (evolved ? ' build-slot--evolved' : '')
            + (ready ? ' build-slot--ready' : '');
        slot.title = `${label} · ${badge}`;
        slot.innerHTML = `
            <span class="build-icon">${emoji}</span>
            <span class="build-badge">${badge}</span>
        `;
        return slot;
    }
}
