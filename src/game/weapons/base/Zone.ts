/**
 * BASE ZONE CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

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
            const dist = Math.sqrt(bubble.x * bubble.x + bubble.y * bubble.y);
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
// SPORE ZONE - Floating spore cloud
// ============================================
export class SporeZone extends Zone {
    private particleTimer: number = 0;
    private spores: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.9;
            this.spores.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 10,
                size: 2 + Math.random() * 4,
                alpha: 0.3 + Math.random() * 0.5
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        for (const spore of this.spores) {
            spore.x += spore.vx * dt;
            spore.y += spore.vy * dt;

            const dist = Math.sqrt(spore.x * spore.x + spore.y * spore.y);
            if (dist > this.radius) {
                const angle = Math.random() * Math.PI * 2;
                spore.x = Math.cos(angle) * this.radius * 0.5;
                spore.y = Math.sin(angle) * this.radius * 0.5;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.2) {
            this.particleTimer = 0;
            particles.emitSporeCloud(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(100, 80, 40, 0.4)');
        gradient.addColorStop(0.6, 'rgba(80, 60, 30, 0.25)');
        gradient.addColorStop(1, 'rgba(60, 40, 20, 0.05)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        for (const spore of this.spores) {
            ctx.beginPath();
            ctx.arc(spore.x, spore.y, spore.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 120, 60, ${spore.alpha})`;
            ctx.fill();
        }

        ctx.restore();
    }
}

// ============================================
// NANOBOT CLOUD - Follows owner
// ============================================
export class NanobotCloud extends Zone {
    private particleTimer: number = 0;
    owner: any;

    constructor(owner: any, radius: number, duration: number, damage: number, interval: number) {
        super(owner.pos.x, owner.pos.y, radius, duration, damage, interval, '', 0);
        this.owner = owner;
    }

    update(dt: number) {
        this.pos.x = this.owner.pos.x;
        this.pos.y = this.owner.pos.y;

        super.update(dt);

        this.particleTimer += dt;
        if (this.particleTimer > 0.05) {
            this.particleTimer = 0;
            particles.emitNanoSwarm(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const time = Date.now() / 500;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + Math.sin(time) * 0.1})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(0, 200, 200, 0.15)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 150, 0.08)');
        gradient.addColorStop(1, 'rgba(0, 100, 100, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 255, 200, 0.6)';
        for (let i = 0; i < 12; i++) {
            const angle = time * 0.5 + i * Math.PI / 6;
            const dist = this.radius * 0.3 + Math.sin(time * 2 + i) * 10;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// ============================================
// DELAYED EXPLOSION ZONE - For orbital strike
// ============================================
export class DelayedExplosionZone extends Zone {
    delay: number;
    initialDelay: number;
    exploded: boolean = false;
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    isAtomic: boolean = false;

    private beamWidth: number = 0;
    private flashAlpha: number = 0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 0;
    private particlesEmitted: boolean = false;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, emoji: string, onDamage?: (pos: Vector2, amount: number) => void, isAtomic: boolean = false) {
        super(x, y, radius, delay + 0.8, damage, Number.MAX_VALUE, emoji);
        this.delay = delay;
        this.initialDelay = delay;
        this.onDamageCallback = onDamage;
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

    explode() {
        if (!this.particlesEmitted) {
            this.particlesEmitted = true;
            if (this.isAtomic) {
                particles.emitNuclear(this.pos.x, this.pos.y, this.radius);
            } else {
                particles.emitOrbitalStrike(this.pos.x, this.pos.y, this.radius);
            }
        }

        const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInBlast) {
            if (distance(this.pos, enemy.pos) <= this.radius) {
                // Use DamageSystem for consistent damage handling
                damageSystem.dealRawDamage(enemy, this.damage, enemy.pos);
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
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    stunDuration: number = 0;
    private rings: { radius: number; alpha: number }[] = [];
    private chargeParticleTimer: number = 0;
    private blastTriggered: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, onDamage?: (pos: Vector2, amount: number) => void, stunDuration: number = 0) {
        super(x, y, radius, 2.5, damage, 999, '');
        this.interval = 999;
        this.onDamageCallback = onDamage;
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
                        damageSystem.dealRawDamage(e, this.damage, e.pos);
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

// Re-export distance for use in zones
export { distance };
