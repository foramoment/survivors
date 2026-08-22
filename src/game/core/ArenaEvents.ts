/**
 * ArenaEvents — timed hazards that make each stage's arena behave differently.
 *
 * The DifficultyDirector already schedules discrete events at wave boundaries,
 * so it also schedules these (`type: 'arena'`, every 30–60s); GameManager maps
 * the stage's `event` kind onto one of:
 *
 *   meteors  — falling rocks with a ground telegraph, then a damaging impact.
 *              Hurts enemies far more than the player, so luring a swarm under
 *              one is worth the dodge.
 *   blackout — station power fails: the lights die for ten seconds and the
 *              enemies get faster while they hunt in the dark.
 *   rifts    — tears in the void open around the player and pour enemies out
 *              until they collapse.
 *
 * Every event announces itself with a banner and a telegraph before anything
 * can hurt the player — hazards that arrive unannounced just feel like bugs.
 */

import { t } from './I18n';
import { damageSystem } from './DamageSystem';
import { HAZARD_SOURCE } from './Tactics';
import { levelSpatialHash } from '../../engine/SpatialHash';
import { particles } from '../../engine/ParticleSystem';
import { juice } from '../../engine/JuiceSystem';
import { audio } from '../../engine/AudioSystem';
import { drawPixelText } from '../../engine/PixelFont';
import { distance, type Vector2 } from '../../engine/Utils';
import type { ArenaEventKind } from '../data/StageData';

export interface ArenaContext {
    playerPos: Vector2;
    /** Fraction of max HP taken off the player (0.08 = 8%) */
    damagePlayer(fraction: number): void;
    /** Spawn one regular enemy at a world position */
    spawnAt(x: number, y: number): void;
    viewWidth: number;
    viewHeight: number;
    gameTime: number;
}

interface Meteor {
    x: number;
    y: number;
    /** Seconds until impact (telegraph time) */
    fuse: number;
    radius: number;
    /** Fade-out timer after the impact */
    afterglow: number;
}

interface Rift {
    x: number;
    y: number;
    /** Seconds until the rift finishes opening */
    open: number;
    life: number;
    spawnTimer: number;
    /** Spiral baked once at creation — never recomputed per frame */
    spiral: number[];
}

const METEOR_FUSE = 1.1;
const BANNER_TIME = 2.6;

/** Banner text, resolved at draw time so a language switch takes effect */
const label = (kind: ArenaEventKind): string => t(`arena.${kind}`);

export class ArenaEventSystem {
    kind: ArenaEventKind | null = null;
    private timer = 0;
    private duration = 0;
    private spawnTimer = 0;
    private bannerLife = 0;
    private meteors: Meteor[] = [];
    private rifts: Rift[] = [];

    get active(): boolean {
        return this.kind !== null;
    }

    /** Enemies hunt faster while the lights are out */
    get enemySpeedMultiplier(): number {
        return this.kind === 'blackout' && this.timer > 2 ? 1.3 : 1;
    }

    /** 0 = lit, 1 = pitch black — consumed by StageBackdrop */
    get blackoutAmount(): number {
        if (this.kind !== 'blackout') return 0;
        const fadeIn = Math.min(1, Math.max(0, (this.timer - 1.4) / 0.8));
        const fadeOut = Math.min(1, Math.max(0, (this.duration - this.timer) / 1.2));
        return Math.min(fadeIn, fadeOut);
    }

    trigger(kind: ArenaEventKind, ctx: ArenaContext) {
        if (this.active) return;
        this.kind = kind;
        this.timer = 0;
        this.spawnTimer = 0;
        this.bannerLife = BANNER_TIME;
        this.meteors.length = 0;
        this.rifts.length = 0;

        audio.play('bossSpawn');
        juice.pulseVignette(0.6);

        if (kind === 'meteors') {
            this.duration = 9;
        } else if (kind === 'blackout') {
            this.duration = 11;
        } else {
            this.duration = 10;
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.6;
                const dist = 260 + Math.random() * 260;
                this.rifts.push(this.makeRift(
                    ctx.playerPos.x + Math.cos(angle) * dist,
                    ctx.playerPos.y + Math.sin(angle) * dist
                ));
            }
        }
    }

    private makeRift(x: number, y: number): Rift {
        // Baked spiral: 3 turns of points, drawn as a polyline every frame
        const spiral: number[] = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const a = t * Math.PI * 6;
            const r = 8 + t * 46;
            spiral.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        return { x, y, open: 1.5, life: 0, spawnTimer: 0, spiral };
    }

    // =========================================================
    // Update
    // =========================================================

    update(dt: number, ctx: ArenaContext) {
        if (this.bannerLife > 0) this.bannerLife -= dt;
        if (!this.kind) return;

        this.timer += dt;

        if (this.kind === 'meteors') this.updateMeteors(dt, ctx);
        else if (this.kind === 'rifts') this.updateRifts(dt, ctx);

        if (this.timer >= this.duration && this.meteors.length === 0) {
            this.kind = null;
            this.rifts.length = 0;
        }
    }

    private updateMeteors(dt: number, ctx: ArenaContext) {
        // Keep dropping until the event is over; the tail keeps updating so the
        // last impacts still resolve.
        if (this.timer < this.duration) {
            this.spawnTimer -= dt;
            if (this.spawnTimer <= 0) {
                this.spawnTimer = 0.42;
                const angle = Math.random() * Math.PI * 2;
                const spread = Math.min(ctx.viewWidth, ctx.viewHeight) * 0.45;
                this.meteors.push({
                    x: ctx.playerPos.x + Math.cos(angle) * Math.random() * spread,
                    y: ctx.playerPos.y + Math.sin(angle) * Math.random() * spread,
                    fuse: METEOR_FUSE,
                    radius: 74 + Math.random() * 42,
                    afterglow: 0,
                });
            }
        }

        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            if (m.fuse > 0) {
                m.fuse -= dt;
                if (m.fuse <= 0) this.impact(m, ctx);
                continue;
            }
            m.afterglow -= dt;
            if (m.afterglow <= 0) this.meteors.splice(i, 1);
        }
    }

    private impact(m: Meteor, ctx: ArenaContext) {
        m.afterglow = 0.45;

        // Enemy damage grows with run time so the hazard stays relevant.
        // Halved with enemy health when GLOBAL_DAMAGE went away: this is one of
        // only two `skipModifiers` sources in the game, so it never received the
        // old doubling and would otherwise have come out twice as strong.
        const damage = 40 * (1 + ctx.gameTime / 180);
        for (const enemy of levelSpatialHash.getNearby({ x: m.x, y: m.y }, m.radius)) {
            if (distance(enemy.pos, { x: m.x, y: m.y }) <= m.radius + enemy.radius) {
                // Environmental damage: no weapon, so no crit/might modifiers
                damageSystem.dealDamage({
                    baseDamage: damage,
                    source: HAZARD_SOURCE,
                    target: enemy,
                    position: enemy.pos,
                    skipModifiers: true,
                });
            }
        }

        if (distance(ctx.playerPos, { x: m.x, y: m.y }) <= m.radius) {
            ctx.damagePlayer(0.08);
        }

        particles.emitOrbitalImpact(m.x, m.y, m.radius);
        juice.shockwave(m.x, m.y, m.radius * 1.6, '#ff9a3c', 0.35, 5);
        juice.addTrauma(0.18);
        audio.play('explosion');
    }

    private updateRifts(dt: number, ctx: ArenaContext) {
        for (const r of this.rifts) {
            r.life += dt;
            if (r.open > 0) {
                r.open -= dt;
                continue;
            }
            if (this.timer >= this.duration) continue;
            r.spawnTimer -= dt;
            if (r.spawnTimer <= 0) {
                r.spawnTimer = 0.8;
                ctx.spawnAt(r.x + (Math.random() - 0.5) * 40, r.y + (Math.random() - 0.5) * 40);
                particles.emitHit(r.x, r.y, '#b06bff');
            }
        }
    }

    // =========================================================
    // Rendering
    // =========================================================

    /** Ground-level telegraphs — draw with the props, under the entities */
    drawWorld(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (!this.kind) return;

        ctx.save();
        ctx.shadowBlur = 0;

        for (const m of this.meteors) {
            const x = m.x - camera.x;
            const y = m.y - camera.y;
            if (m.fuse > 0) {
                const t = 1 - m.fuse / METEOR_FUSE;
                // Ring closes in on the impact point; the blink speeds up
                ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(t * t * 26));
                ctx.strokeStyle = '#ff5a1e';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, m.radius * (1.55 - t * 0.55), 0, Math.PI * 2);
                ctx.stroke();

                ctx.globalAlpha = 0.22;
                ctx.beginPath();
                ctx.arc(x, y, m.radius, 0, Math.PI * 2);
                ctx.stroke();

                // The rock itself, streaking in over the last moments
                if (t > 0.62) {
                    const fall = (t - 0.62) / 0.38;
                    const offset = (1 - fall) * 620;
                    const mx = x - offset * 0.55;
                    const my = y - offset;
                    ctx.globalAlpha = 0.9;
                    ctx.strokeStyle = '#ffb057';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(mx - 44 * 0.55, my - 44);
                    ctx.lineTo(mx, my);
                    ctx.stroke();
                    ctx.fillStyle = '#ffe6b0';
                    ctx.beginPath();
                    ctx.arc(mx, my, 5 + fall * 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ff5a1e';
                    ctx.lineWidth = 3;
                }
            } else {
                ctx.globalAlpha = Math.max(0, m.afterglow / 0.45) * 0.6;
                ctx.fillStyle = '#3b1204';
                ctx.beginPath();
                ctx.arc(x, y, m.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (const r of this.rifts) {
            const x = r.x - camera.x;
            const y = r.y - camera.y;
            const opening = r.open > 0 ? 1 - r.open / 1.5 : 1;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(r.life * 1.6);
            ctx.scale(opening, opening);
            ctx.globalAlpha = 0.35 + 0.35 * opening;
            ctx.strokeStyle = '#c07bff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(r.spiral[0], r.spiral[1]);
            for (let i = 2; i < r.spiral.length; i += 2) ctx.lineTo(r.spiral[i], r.spiral[i + 1]);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    /** Event banner — screen space, drawn above the world */
    drawBanner(ctx: CanvasRenderingContext2D, width: number, height: number) {
        if (this.bannerLife <= 0 || !this.kind) return;

        const t = 1 - this.bannerLife / BANNER_TIME;
        // Slide in fast, hold, fade out
        const slide = t < 0.15 ? 1 - t / 0.15 : 0;
        const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = alpha;
        drawPixelText(ctx, label(this.kind), width / 2 - slide * width * 0.4, height * 0.17, {
            scale: Math.max(2, Math.round(width / 320)),
            align: 'center',
            spacing: 1,
            shadow: 2,
            color: '#ffe14d',
            outline: '#a01400',
        });
        ctx.restore();
    }

    reset() {
        this.kind = null;
        this.timer = 0;
        this.bannerLife = 0;
        this.meteors.length = 0;
        this.rifts.length = 0;
    }
}

export const arenaEvents = new ArenaEventSystem();
