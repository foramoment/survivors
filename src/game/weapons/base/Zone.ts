/**
 * BASE ZONE CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { Entity } from '../../Entity';
import type { Weapon } from '../../Weapon';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { juice } from '../../core/JuiceSystem';
import { status } from '../../core/StatusEffects';

// ============================================
// ZONE - Base class for area damage
// ============================================
export class Zone extends Entity {
    duration: number;
    damage: number;
    interval: number;
    timer: number = 0;
    emoji: string;
    slowEffect: number = 0;
    source?: Weapon;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, emoji: string, slowEffect: number = 0) {
        super(x, y, radius);
        this.duration = duration;
        this.damage = damage;
        this.interval = interval;
        this.emoji = emoji;
        this.slowEffect = slowEffect;
    }

    update(dt: number) {
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;

        this.timer += dt;
    }

    onOverlap(enemy: any) {
        if (this.slowEffect > 0) {
            enemy.speedMultiplier = Math.max(0.1, 1 - this.slowEffect);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        if (this.slowEffect > 0) {
            ctx.fillStyle = '#0088ff';
        } else {
            ctx.fillStyle = '#00ffff';
        }
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }
}

// ============================================
// FROST ZONE - Slows enemies
// ============================================
export class FrostZone extends Zone {
    private particleTimer: number = 0;
    private iceShards: { x: number; y: number; angle: number; size: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, slowEffect: number = 0.5) {
        super(x, y, radius, duration, damage, interval, '', slowEffect);
        for (let i = 0; i < 8; i++) {
            this.iceShards.push({
                x: (Math.random() - 0.5) * radius * 1.5,
                y: (Math.random() - 0.5) * radius * 1.5,
                angle: Math.random() * Math.PI * 2,
                size: 5 + Math.random() * 10
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.particleTimer += dt;
        if (this.particleTimer > 0.1) {
            this.particleTimer = 0;
            particles.emitColdMist(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
        gradient.addColorStop(0.7, 'rgba(150, 220, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(200, 240, 255, 0.05)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(200, 240, 255, 0.7)';
        for (const shard of this.iceShards) {
            ctx.save();
            ctx.translate(shard.x, shard.y);
            ctx.rotate(shard.angle);
            ctx.beginPath();
            ctx.moveTo(0, -shard.size);
            ctx.lineTo(shard.size * 0.3, shard.size * 0.5);
            ctx.lineTo(-shard.size * 0.3, shard.size * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }
}

// ============================================
// ACID ZONE - Bubbling acid puddle
// ============================================
export class AcidZone extends Zone {
    private particleTimer: number = 0;
    private bubbles: { x: number; y: number; size: number; speed: number; offset: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        for (let i = 0; i < 12; i++) {
            this.bubbles.push({
                x: (Math.random() - 0.5) * radius * 1.6,
                y: (Math.random() - 0.5) * radius * 1.6,
                size: 3 + Math.random() * 6,
                speed: 20 + Math.random() * 30,
                offset: Math.random() * Math.PI * 2
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        for (const bubble of this.bubbles) {
            bubble.y -= bubble.speed * dt;
            if (bubble.y < -this.radius) {
                bubble.y = this.radius * 0.8;
                bubble.x = (Math.random() - 0.5) * this.radius * 1.6;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.15) {
            this.particleTimer = 0;
            particles.emitAcidBubble(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.5)');
        gradient.addColorStop(0.5, 'rgba(50, 200, 0, 0.35)');
        gradient.addColorStop(1, 'rgba(100, 150, 0, 0.1)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(100, 255, 50, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        for (const bubble of this.bubbles) {
            const dist = Math.hypot(bubble.x, bubble.y);
            if (dist < this.radius) {
                ctx.beginPath();
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(150, 255, 100, ${0.3 + Math.sin(Date.now() / 200 + bubble.offset) * 0.2})`;
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 255, 50, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

// ============================================
// SPORE ZONE - Fungal patch: mushrooms + a breathing spore cloud
// ============================================

/**
 * A patch of fungus rather than a coloured circle: pixel mushrooms sprout on
 * the ground, a cloud of spores breathes above them, and anything standing in
 * it gets *infected* — the damage keeps ticking after the enemy walks out
 * (see core/StatusEffects).
 *
 * All geometry (mushroom placement, puff offsets) is baked in the constructor;
 * per frame this is a handful of rects and arcs with no allocation.
 */
export class SporeZone extends Zone {
    /** Damage per second applied as an infection to anything inside */
    infectDps: number = 0;
    infectDuration: number = 3;
    contagious: boolean = false;

    protected puffs: { x: number; y: number; r: number; phase: number; drift: number }[] = [];
    protected caps: { x: number; y: number; scale: number; variant: number; grow: number }[] = [];
    protected age: number = 0;
    private particleTimer: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        this.rebuildGeometry();
    }

    /** Baked once (and again if an evolved zone grows a lot) */
    protected rebuildGeometry() {
        this.puffs.length = 0;
        const puffCount = Math.min(14, 6 + Math.round(this.radius / 22));
        for (let i = 0; i < puffCount; i++) {
            const angle = (i / puffCount) * Math.PI * 2 + Math.random() * 0.5;
            const dist = this.radius * (0.25 + Math.random() * 0.6);
            this.puffs.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.75,
                r: this.radius * (0.18 + Math.random() * 0.2),
                phase: Math.random() * Math.PI * 2,
                drift: 0.6 + Math.random() * 0.8,
            });
        }

        this.caps.length = 0;
        const capCount = Math.min(6, 2 + Math.round(this.radius / 45));
        for (let i = 0; i < capCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = this.radius * (0.15 + Math.random() * 0.7);
            this.caps.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.7,
                scale: 0.7 + Math.random() * 0.7,
                variant: Math.floor(Math.random() * 3),
                grow: 0,
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.age += dt;

        // Mushrooms pop up one after another instead of all at once
        for (let i = 0; i < this.caps.length; i++) {
            const cap = this.caps[i];
            if (cap.grow < 1 && this.age > i * 0.08) cap.grow = Math.min(1, cap.grow + dt * 4);
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.35) {
            this.particleTimer = 0;
            particles.emitSporeCloud(this.pos.x, this.pos.y, this.radius);
        }
    }

    onOverlap(enemy: any) {
        super.onOverlap(enemy);
        if (this.infectDps <= 0) return;
        status.infect(enemy, {
            dps: this.infectDps,
            duration: this.infectDuration,
            source: this.source,
            contagious: this.contagious,
            spreadRadius: this.radius * 0.8,
        });
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration / 0.6);
        const breathe = 1 + Math.sin(this.age * 1.6) * 0.05;

        // Damp ground patch
        ctx.globalAlpha = 0.3 * fade;
        ctx.fillStyle = this.contagious ? '#243d10' : '#2a2c14';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mushrooms
        ctx.globalAlpha = fade;
        for (const cap of this.caps) {
            if (cap.grow <= 0) continue;
            this.drawMushroom(ctx, cap.x, cap.y, cap.scale * cap.grow, cap.variant);
        }

        // Spore puffs drifting above the patch
        for (const puff of this.puffs) {
            const lift = Math.sin(this.age * puff.drift + puff.phase) * 5;
            ctx.globalAlpha = (0.18 + 0.1 * Math.sin(this.age * 2 + puff.phase)) * fade;
            ctx.fillStyle = this.contagious ? '#8fd642' : '#7a8b3a';
            ctx.beginPath();
            ctx.arc(puff.x, puff.y + lift, puff.r * breathe, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /** Chunky pixel mushroom: stalk, cap, two spots */
    protected drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, variant: number) {
        const p = Math.max(2, Math.round(3 * scale));
        const capColor = this.contagious ? '#9ee83c' : ['#b4552e', '#8a6a2e', '#7a4a6a'][variant];
        const capShade = this.contagious ? '#5f9418' : ['#7a3218', '#5c451c', '#4e2d47'][variant];

        ctx.fillStyle = '#d8d2b8';
        ctx.fillRect(x - p / 2, y - p, p, p * 2);

        ctx.fillStyle = capColor;
        ctx.fillRect(x - p * 2, y - p * 2, p * 4, p);
        ctx.fillRect(x - p * 1.5, y - p * 3, p * 3, p);

        ctx.fillStyle = capShade;
        ctx.fillRect(x - p * 2, y - p, p * 4, Math.max(1, p * 0.5));
        ctx.fillRect(x - p * 0.5, y - p * 3, p, p);
    }
}

// ============================================
// NANOBOT CLOUD - Follows owner
// ============================================
export class NanobotCloud extends Zone {
    owner: any;

    constructor(owner: any, radius: number, duration: number, damage: number, interval: number) {
        super(owner.pos.x, owner.pos.y, radius, duration, damage, interval, '', 0);
        this.owner = owner;
    }

    update(dt: number) {
        this.pos.x = this.owner.pos.x;
        this.pos.y = this.owner.pos.y;

        super.update(dt);
    }

    /**
     * Deliberately draws nothing.
     *
     * The cloud used to paint a dashed ring, a radial haze and twelve orbiting
     * dots centred on the player — a permanent disc of glow sitting under the
     * one thing you need to keep track of, and doing it for the whole run. The
     * drones the weapon actually flies (see NaniteHiveCloud) read far better on
     * their own, so the aura is invisible and only its effect is felt.
     */
    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) {
        // intentionally empty — see the comment above
    }
}

// ============================================
// DELAYED EXPLOSION ZONE - For orbital strike
// ============================================
export class DelayedExplosionZone extends Zone {
    delay: number;
    initialDelay: number;
    exploded: boolean = false;
    isAtomic: boolean = false;

    private beamWidth: number = 0;
    private flashAlpha: number = 0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 0;
    private particlesEmitted: boolean = false;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, emoji: string, isAtomic: boolean = false) {
        super(x, y, radius, delay + 0.8, damage, Number.MAX_VALUE, emoji);
        this.delay = delay;
        this.initialDelay = delay;
        this.isAtomic = isAtomic;
    }

    update(dt: number) {
        if (this.exploded) {
            this.shockwaveRadius += dt * this.radius * 4;
            this.shockwaveAlpha -= dt * 2;
            this.flashAlpha -= dt * 4;

            if (this.shockwaveAlpha <= 0 && this.flashAlpha <= 0) {
                this.isDead = true;
            }
            return;
        }

        this.delay -= dt;

        const progress = 1 - (this.delay / this.initialDelay);
        this.beamWidth = progress * (this.isAtomic ? 40 : 15);

        if (this.delay <= 0) {
            this.explode();
            this.exploded = true;
            this.flashAlpha = 1;
            this.shockwaveAlpha = 1;
            this.shockwaveRadius = 0;
        }
    }

    /**
     * Impact feedback. Subclasses override this to spend a different particle
     * budget — a six-shell barrage cannot afford the single-strike burst.
     */
    protected emitImpact() {
        if (this.isAtomic) {
            particles.emitNuclear(this.pos.x, this.pos.y, this.radius);
            juice.addTrauma(0.55);
            juice.hitStop(0.06);
            juice.flash('#ffeeaa', 0.35, 0.4);
            juice.shockwave(this.pos.x, this.pos.y, this.radius * 2.2, '#ffcc55', 0.55, 8);
        } else {
            particles.emitOrbitalStrike(this.pos.x, this.pos.y, this.radius);
            juice.addTrauma(0.3);
            juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.8, '#ff8844', 0.4, 5);
        }
    }

    explode() {
        if (!this.particlesEmitted) {
            this.particlesEmitted = true;
            this.emitImpact();
        }

        const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInBlast) {
            if (distance(this.pos, enemy.pos) <= this.radius) {
                // Use DamageSystem for consistent damage handling
                damageSystem.dealDamage({
                    baseDamage: this.damage,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos
                });
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (!this.exploded) {
            const progress = 1 - (this.delay / this.initialDelay);

            // Outer target ring
            ctx.save();
            ctx.rotate(Date.now() / 500);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isAtomic ? `rgba(255, 200, 0, ${0.5 + Math.sin(Date.now() / 100) * 0.2})` : `rgba(255, 100, 0, ${0.4 + progress * 0.4})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.stroke();
            ctx.restore();

            // Inner targeting circle
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            const fillGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            if (this.isAtomic) {
                fillGradient.addColorStop(0, `rgba(255, 255, 100, ${0.4 * progress})`);
                fillGradient.addColorStop(0.5, `rgba(255, 150, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            } else {
                fillGradient.addColorStop(0, `rgba(255, 100, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            }
            ctx.fillStyle = fillGradient;
            ctx.fill();

            // Crosshair
            const crosshairLength = this.radius * 0.3;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + progress * 0.4})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(-crosshairLength, 0); ctx.lineTo(-crosshairLength * 0.3, 0);
            ctx.moveTo(crosshairLength * 0.3, 0); ctx.lineTo(crosshairLength, 0);
            ctx.moveTo(0, -crosshairLength); ctx.lineTo(0, -crosshairLength * 0.3);
            ctx.moveTo(0, crosshairLength * 0.3); ctx.lineTo(0, crosshairLength);
            ctx.stroke();

            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + Math.sin(Date.now() / 50) * 0.2})`;
            ctx.fill();

            // Beam from space
            const beamHeight = 800;
            const beamStartY = -beamHeight;

            const beamGlowWidth = this.beamWidth * 3;
            if (beamGlowWidth > 0) {
                const glowGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    glowGradient.addColorStop(0, `rgba(255, 255, 100, 0)`);
                    glowGradient.addColorStop(0.3, `rgba(255, 200, 0, ${0.2 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 150, 0, ${0.5 * progress})`);
                } else {
                    glowGradient.addColorStop(0, `rgba(255, 150, 50, 0)`);
                    glowGradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.15 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 80, 0, ${0.4 * progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth * 1.5, 0);
                ctx.lineTo(-beamGlowWidth * 1.5, 0);
                ctx.closePath();
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }

            if (this.beamWidth > 0) {
                const coreGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    coreGradient.addColorStop(0, `rgba(255, 255, 255, 0.1)`);
                    coreGradient.addColorStop(0.5, `rgba(255, 255, 200, ${progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 255, 150, ${progress})`);
                } else {
                    coreGradient.addColorStop(0, `rgba(255, 200, 100, 0.1)`);
                    coreGradient.addColorStop(0.7, `rgba(255, 150, 50, ${0.8 * progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 200, 100, ${progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth, 0);
                ctx.lineTo(-this.beamWidth, 0);
                ctx.closePath();
                ctx.fillStyle = coreGradient;
                ctx.fill();

                if (progress > 0.5) {
                    const sparkleAlpha = (progress - 0.5) * 2;
                    ctx.shadowColor = this.isAtomic ? '#ffff00' : '#ff6600';
                    ctx.shadowBlur = 30 * sparkleAlpha;
                    ctx.beginPath();
                    ctx.arc(0, 0, 10 + Math.random() * 5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            if (this.isAtomic && progress > 0.3) {
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(255, 200, 0, ${Math.sin(Date.now() / 100) * 0.5 + 0.5})`;
                ctx.fillText('☢️ NUCLEAR STRIKE INCOMING ☢️', 0, -this.radius - 30);
            }

        } else {
            // Explosion phase
            if (this.flashAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.fill();
            }

            if (this.shockwaveAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);

                if (this.isAtomic) {
                    ctx.strokeStyle = `rgba(255, 200, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 20;
                } else {
                    ctx.strokeStyle = `rgba(255, 100, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 10;
                }

                ctx.shadowColor = this.isAtomic ? '#ffcc00' : '#ff6600';
                ctx.shadowBlur = 20;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            if (this.flashAlpha > 0.3) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * (1 - this.flashAlpha * 0.3), 0, Math.PI * 2);
                const explosionGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
                if (this.isAtomic) {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.3, `rgba(255, 200, 0, ${this.flashAlpha * 0.8})`);
                    explosionGradient.addColorStop(0.6, `rgba(255, 100, 0, ${this.flashAlpha * 0.5})`);
                    explosionGradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
                } else {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.5, `rgba(255, 150, 50, ${this.flashAlpha * 0.6})`);
                    explosionGradient.addColorStop(1, `rgba(255, 80, 0, 0)`);
                }
                ctx.fillStyle = explosionGradient;
                ctx.fill();
            }

            if (this.flashAlpha > 0.5) {
                ctx.font = `${this.radius * 1.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillText(this.emoji, 0, 0);
            }

            // Atomic mushroom cloud
            if (this.isAtomic && this.flashAlpha > 0.1) {
                const cloudProgress = 1 - this.flashAlpha;
                const stemHeight = this.radius * 0.8 * cloudProgress;
                const capRadius = this.radius * 0.6 * cloudProgress;

                ctx.fillStyle = `rgba(200, 100, 0, ${this.flashAlpha * 0.7})`;
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                ctx.lineTo(20, 0);
                ctx.lineTo(30, -stemHeight);
                ctx.lineTo(-30, -stemHeight);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.arc(0, -stemHeight - capRadius * 0.3, capRadius, 0, Math.PI * 2);
                const capGradient = ctx.createRadialGradient(0, -stemHeight - capRadius * 0.3, 0, 0, -stemHeight - capRadius * 0.3, capRadius);
                capGradient.addColorStop(0, `rgba(255, 200, 100, ${this.flashAlpha * 0.8})`);
                capGradient.addColorStop(0.5, `rgba(255, 100, 0, ${this.flashAlpha * 0.6})`);
                capGradient.addColorStop(1, `rgba(100, 50, 0, ${this.flashAlpha * 0.3})`);
                ctx.fillStyle = capGradient;
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// ============================================
// MIND BLAST ZONE - Psionic explosion
// ============================================
export class MindBlastZone extends Zone {
    stage: 'warning' | 'charge' | 'blast' | 'fade' = 'warning';
    stageTimer: number = 0;
    stunDuration: number = 0;
    private rings: { radius: number; alpha: number }[] = [];
    private chargeParticleTimer: number = 0;
    private blastTriggered: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, stunDuration: number = 0) {
        super(x, y, radius, 2.5, damage, 999, '');
        this.interval = 999;
        this.stunDuration = stunDuration;
    }

    update(dt: number) {
        this.stageTimer += dt;

        for (let i = this.rings.length - 1; i >= 0; i--) {
            this.rings[i].radius += 200 * dt;
            this.rings[i].alpha -= dt * 2;
            if (this.rings[i].alpha <= 0) this.rings.splice(i, 1);
        }

        if (this.stage === 'warning' && this.stageTimer > 0.5) {
            this.stage = 'charge';
        } else if (this.stage === 'charge') {
            this.chargeParticleTimer += dt;
            if (this.chargeParticleTimer > 0.05) {
                this.chargeParticleTimer = 0;
                particles.emitPsionicCharge(this.pos.x, this.pos.y);
            }

            if (this.stageTimer > 1.0) {
                this.stage = 'blast';
                particles.emitPsionicWave(this.pos.x, this.pos.y, this.radius);
                juice.addTrauma(0.22);
                juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.6, '#ff66ff', 0.45, 5);
                for (let i = 0; i < 3; i++) {
                    this.rings.push({ radius: 10 + i * 20, alpha: 1.0 });
                }
            }
        } else if (this.stage === 'blast') {
            if (!this.blastTriggered) {
                this.blastTriggered = true;
                const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

                enemiesInBlast.forEach(e => {
                    if (distance(this.pos, e.pos) <= this.radius) {
                        // Use DamageSystem for consistent damage handling
                        damageSystem.dealDamage({
                            baseDamage: this.damage,
                            source: this.source,
                            target: e,
                            position: e.pos
                        });
                        particles.emitHit(e.pos.x, e.pos.y, '#ff00ff');

                        if (this.stunDuration > 0) {
                            (e as any).stunTimer = this.stunDuration;
                        }
                    }
                });
            }

            if (this.stageTimer > 1.8) {
                this.stage = 'fade';
            }
        } else if (this.stage === 'fade' && this.stageTimer > 2.3) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (this.stage === 'warning') {
            const pulse = Math.sin(this.stageTimer * 10) * 0.2 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 255, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 100, 255, 0.8)';
            ctx.fill();

        } else if (this.stage === 'charge') {
            const progress = (this.stageTimer - 0.5) / 0.5;

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            gradient.addColorStop(0, 'rgba(255, 100, 255, 0.6)');
            gradient.addColorStop(0.5, 'rgba(200, 0, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(150, 0, 200, 0.1)');

            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 150, 255, 0.6)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const angle = (this.stageTimer * 3 + i * Math.PI / 3);
                const len = this.radius * progress * 0.8;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
                ctx.stroke();
            }

        } else if (this.stage === 'blast' || this.stage === 'fade') {
            const fadeAlpha = this.stage === 'fade' ? Math.max(0, 1 - (this.stageTimer - 1.8) / 0.5) : 1;

            for (const ring of this.rings) {
                ctx.beginPath();
                ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 100, 255, ${ring.alpha * fadeAlpha})`;
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff00ff';
                ctx.shadowBlur = 15;
                ctx.stroke();
            }

            const coreSize = this.radius * 0.6 * fadeAlpha;
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * fadeAlpha})`);
            gradient.addColorStop(0.3, `rgba(255, 100, 255, ${0.6 * fadeAlpha})`);
            gradient.addColorStop(1, `rgba(150, 0, 200, 0)`);

            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// PLASMA EXPLOSION ZONE - Instant explosion with chain potential
// ============================================
export class PlasmaExplosionZone extends Zone {
    private flashAlpha: number = 1.0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 1.0;
    private damageDealt: boolean = false;
    isEvolved: boolean;
    onChainExplosion?: (x: number, y: number) => void;

    /**
     * Seconds to wait before detonating. Cluster/chain blasts stagger
     * themselves this way so twenty explosions never resolve in one frame.
     */
    detonationDelay: number = 0;
    /** Fired when a delayed blast actually goes off (particles live here) */
    onDetonate?: (x: number, y: number, radius: number) => void;

    constructor(x: number, y: number, radius: number, damage: number, isEvolved: boolean = false) {
        // Short duration for visual effect only
        super(x, y, radius, 0.6, damage, Number.MAX_VALUE, '');
        this.isEvolved = isEvolved;
    }

    update(dt: number) {
        if (this.detonationDelay > 0) {
            this.detonationDelay -= dt;
            this.duration += dt; // don't age while waiting to go off
            if (this.detonationDelay > 0) return;
            this.onDetonate?.(this.pos.x, this.pos.y, this.radius);
        }

        // Deal damage immediately on first frame
        if (!this.damageDealt) {
            this.damageDealt = true;
            const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

            for (const enemy of enemiesInBlast) {
                const dist = distance(this.pos, enemy.pos);
                if (dist <= this.radius) {
                    damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this.source,
                        target: enemy,
                        position: enemy.pos
                    });

                    // Evolved: trigger chain explosions on hit enemies
                    if (this.isEvolved && this.onChainExplosion && Math.random() < 0.5) {
                        this.onChainExplosion(enemy.pos.x, enemy.pos.y);
                    }
                }
            }
        }

        // Visual fade out
        this.flashAlpha -= dt * 3;
        this.shockwaveRadius += dt * this.radius * 4;
        this.shockwaveAlpha -= dt * 2.5;

        if (this.flashAlpha <= 0 && this.shockwaveAlpha <= 0) {
            this.isDead = true;
        }

        this.duration -= dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        // Nothing to see until the fuse runs out
        if (this.detonationDelay > 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Shockwave ring
        if (this.shockwaveAlpha > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isEvolved
                ? `rgba(255, 150, 50, ${this.shockwaveAlpha})`
                : `rgba(100, 255, 100, ${this.shockwaveAlpha})`;
            ctx.lineWidth = this.isEvolved ? 8 : 5;
            ctx.shadowColor = this.isEvolved ? '#ff6600' : '#00ff00';
            ctx.shadowBlur = 15;
            ctx.stroke();
        }

        // Explosion core
        if (this.flashAlpha > 0) {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * this.flashAlpha);
            if (this.isEvolved) {
                gradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                gradient.addColorStop(0.3, `rgba(255, 150, 50, ${this.flashAlpha * 0.8})`);
                gradient.addColorStop(0.6, `rgba(255, 80, 0, ${this.flashAlpha * 0.5})`);
                gradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
            } else {
                gradient.addColorStop(0, `rgba(200, 255, 200, ${this.flashAlpha})`);
                gradient.addColorStop(0.3, `rgba(100, 255, 100, ${this.flashAlpha * 0.8})`);
                gradient.addColorStop(0.6, `rgba(50, 200, 50, ${this.flashAlpha * 0.5})`);
                gradient.addColorStop(1, `rgba(0, 150, 0, 0)`);
            }

            ctx.beginPath();
            ctx.arc(0, 0, this.radius * this.flashAlpha, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Central flash
            if (this.flashAlpha > 0.5) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * 0.3 * this.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.fill();
            }

            // Emoji at center during flash
            if (this.flashAlpha > 0.7) {
                ctx.font = `${this.radius * 0.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillText(this.isEvolved ? '💥' : '💣', 0, 0);
            }
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// Re-export distance for use in zones
export { distance };

