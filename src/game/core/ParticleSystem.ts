import type { Vector2 } from './Utils';

export interface ParticleConfig {
    x: number;
    y: number;
    count?: number;
    color?: string | string[];
    speed?: number;
    speedVariation?: number;
    size?: number;
    sizeVariation?: number;
    sizeEnd?: number;
    life?: number;
    lifeVariation?: number;
    gravity?: number;
    spread?: number; // Angle spread in radians
    angle?: number; // Base direction
    fadeOut?: boolean;
    glow?: boolean;
    glowSize?: number;
    shape?: 'circle' | 'square' | 'spark' | 'star';
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    sizeStart: number;
    sizeEnd: number;
    life: number;
    maxLife: number;
    color: string;
    alpha: number;
    glow: boolean;
    glowSize: number;
    shape: 'circle' | 'square' | 'spark' | 'star';
}

export class ParticleSystem {
    private static instance: ParticleSystem;
    private particles: Particle[] = [];
    private maxParticles: number = 2000;

    private constructor() { }

    static getInstance(): ParticleSystem {
        if (!ParticleSystem.instance) {
            ParticleSystem.instance = new ParticleSystem();
        }
        return ParticleSystem.instance;
    }

    emit(config: ParticleConfig) {
        const count = config.count ?? 10;
        const speed = config.speed ?? 100;
        const speedVariation = config.speedVariation ?? 0.5;
        const size = config.size ?? 5;
        const sizeVariation = config.sizeVariation ?? 0.3;
        const sizeEnd = config.sizeEnd ?? 0;
        const life = config.life ?? 1;
        const lifeVariation = config.lifeVariation ?? 0.3;
        const gravity = config.gravity ?? 0;
        const spread = config.spread ?? Math.PI * 2;
        const angle = config.angle ?? 0;
        const glow = config.glow ?? false;
        const glowSize = config.glowSize ?? 10;
        const shape = config.shape ?? 'circle';

        const colors = Array.isArray(config.color) ? config.color : [config.color ?? '#ffffff'];

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) {
                // Remove oldest particles
                this.particles.shift();
            }

            const particleSpeed = speed * (1 + (Math.random() - 0.5) * 2 * speedVariation);
            const particleAngle = angle + (Math.random() - 0.5) * spread;
            const particleSize = size * (1 + (Math.random() - 0.5) * 2 * sizeVariation);
            const particleLife = life * (1 + (Math.random() - 0.5) * 2 * lifeVariation);
            const particleColor = colors[Math.floor(Math.random() * colors.length)];

            this.particles.push({
                x: config.x,
                y: config.y,
                vx: Math.cos(particleAngle) * particleSpeed,
                vy: Math.sin(particleAngle) * particleSpeed + (gravity > 0 ? -50 : 0),
                size: particleSize,
                sizeStart: particleSize,
                sizeEnd: sizeEnd,
                life: particleLife,
                maxLife: particleLife,
                color: particleColor,
                alpha: 1,
                glow: glow,
                glowSize: glowSize,
                shape: shape
            });
        }
    }

    // Preset effects
    emitHit(x: number, y: number, color: string = '#ffffff') {
        this.emit({
            x, y,
            count: 8,
            color: [color, '#ffffff'],
            speed: 150,
            speedVariation: 0.5,
            size: 4,
            sizeEnd: 0,
            life: 0.3,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 5,
            shape: 'spark'
        });
    }

    emitExplosion(x: number, y: number, radius: number = 50, colors: string[] = ['#ff6600', '#ffcc00', '#ff3300']) {
        // Core flash
        this.emit({
            x, y,
            count: 15,
            color: ['#ffffff', '#ffffcc'],
            speed: radius * 2,
            size: 8,
            sizeEnd: 0,
            life: 0.2,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 15,
            shape: 'circle'
        });

        // Fire particles
        this.emit({
            x, y,
            count: 30,
            color: colors,
            speed: radius * 1.5,
            speedVariation: 0.6,
            size: 10,
            sizeVariation: 0.5,
            sizeEnd: 0,
            life: 0.5,
            lifeVariation: 0.3,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 10,
            shape: 'circle'
        });

        // Sparks
        this.emit({
            x, y,
            count: 20,
            color: ['#ffff00', '#ffffff'],
            speed: radius * 3,
            speedVariation: 0.8,
            size: 3,
            sizeEnd: 0,
            life: 0.8,
            lifeVariation: 0.5,
            gravity: 300,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 3,
            shape: 'spark'
        });

        // Smoke
        this.emit({
            x, y,
            count: 10,
            color: ['#444444', '#666666', '#333333'],
            speed: radius * 0.5,
            size: 20,
            sizeEnd: 30,
            life: 1.0,
            lifeVariation: 0.3,
            spread: Math.PI * 2,
            gravity: -50,
            shape: 'circle'
        });
    }

    emitOrbitalStrike(x: number, y: number, radius: number) {
        // Massive shockwave
        this.emit({
            x, y,
            count: 40,
            color: ['#ff4400', '#ff8800', '#ffcc00'],
            speed: radius * 4,
            size: 12,
            sizeEnd: 0,
            life: 0.4,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 20,
            shape: 'circle'
        });

        // Ground debris
        this.emit({
            x, y,
            count: 50,
            color: ['#aa5500', '#885500', '#663300'],
            speed: radius * 2,
            speedVariation: 0.8,
            size: 8,
            sizeEnd: 4,
            life: 1.5,
            gravity: 400,
            spread: Math.PI, // Upward fan
            angle: -Math.PI / 2,
            shape: 'square'
        });

        // Core explosion
        this.emitExplosion(x, y, radius, ['#ff2200', '#ff5500', '#ff8800', '#ffcc00']);
    }

    emitNuclear(x: number, y: number, radius: number) {
        // Intense white flash
        this.emit({
            x, y,
            count: 60,
            color: ['#ffffff', '#ffffcc', '#ffff99'],
            speed: radius * 5,
            size: 20,
            sizeEnd: 0,
            life: 0.3,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 30,
            shape: 'circle'
        });

        // Massive fire ring
        this.emit({
            x, y,
            count: 80,
            color: ['#ff3300', '#ff6600', '#ff9900', '#ffcc00'],
            speed: radius * 3,
            speedVariation: 0.5,
            size: 25,
            sizeEnd: 5,
            life: 1.0,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 15,
            shape: 'circle'
        });

        // Mushroom cloud rising particles
        this.emit({
            x, y,
            count: 100,
            color: ['#ff4400', '#cc3300', '#993300', '#663300'],
            speed: 200,
            speedVariation: 0.8,
            size: 30,
            sizeVariation: 0.5,
            sizeEnd: 60,
            life: 2.0,
            lifeVariation: 0.5,
            spread: Math.PI * 0.5,
            angle: -Math.PI / 2,
            gravity: -100,
            glow: true,
            glowSize: 10,
            shape: 'circle'
        });

        // Ash and debris
        this.emit({
            x, y,
            count: 150,
            color: ['#333333', '#444444', '#555555', '#222222'],
            speed: radius * 2,
            speedVariation: 1.0,
            size: 6,
            sizeEnd: 2,
            life: 3.0,
            gravity: 50,
            spread: Math.PI * 2,
            shape: 'square'
        });
    }

    emitLightning(x: number, y: number) {
        this.emit({
            x, y,
            count: 12,
            color: ['#00ffff', '#88ffff', '#ffffff'],
            speed: 200,
            size: 5,
            sizeEnd: 0,
            life: 0.15,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 8,
            shape: 'spark'
        });
    }

    emitFrost(x: number, y: number) {
        this.emit({
            x, y,
            count: 15,
            color: ['#88ccff', '#aaddff', '#ffffff', '#66aaff'],
            speed: 100,
            speedVariation: 0.6,
            size: 6,
            sizeEnd: 0,
            life: 0.5,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 5,
            shape: 'star'
        });
    }

    emitPoison(x: number, y: number) {
        this.emit({
            x, y,
            count: 10,
            color: ['#00ff00', '#88ff00', '#aaff00'],
            speed: 60,
            size: 6,
            sizeEnd: 0,
            life: 0.6,
            gravity: -30,
            spread: Math.PI,
            angle: -Math.PI / 2,
            shape: 'circle'
        });
    }

    emitFire(x: number, y: number) {
        this.emit({
            x, y,
            count: 12,
            color: ['#ff3300', '#ff6600', '#ff9900', '#ffcc00'],
            speed: 80,
            speedVariation: 0.5,
            size: 8,
            sizeEnd: 0,
            life: 0.4,
            gravity: -100,
            spread: Math.PI * 0.6,
            angle: -Math.PI / 2,
            glow: true,
            glowSize: 8,
            shape: 'circle'
        });
    }

    emitBeamCharge(x: number, y: number, color: string = '#ff00ff') {
        this.emit({
            x, y,
            count: 5,
            color: [color, '#ffffff'],
            speed: 150,
            size: 4,
            sizeEnd: 0,
            life: 0.3,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 10,
            shape: 'spark'
        });
    }

    emitTrail(x: number, y: number, color: string = '#ffffff', count: number = 3) {
        this.emit({
            x, y,
            count: count,
            color: [color],
            speed: 20,
            size: 4,
            sizeEnd: 0,
            life: 0.3,
            spread: Math.PI * 2,
            glow: true,
            glowSize: 5,
            shape: 'circle'
        });
    }

    update(dt: number) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Apply gravity if particle has negative velocity (going up)
            p.vy += 100 * dt; // Light gravity for floating effect

            p.life -= dt;

            // Interpolate size
            const lifeRatio = p.life / p.maxLife;
            p.size = p.sizeEnd + (p.sizeStart - p.sizeEnd) * lifeRatio;

            // Fade out
            p.alpha = lifeRatio;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;

            if (p.glow) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.glowSize;
            }

            ctx.translate(p.x, p.y);

            switch (p.shape) {
                case 'circle':
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                case 'square':
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    break;
                case 'spark':
                    ctx.beginPath();
                    ctx.moveTo(-p.size, 0);
                    ctx.lineTo(p.size, 0);
                    ctx.moveTo(0, -p.size);
                    ctx.lineTo(0, p.size);
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    break;
                case 'star':
                    this.drawStar(ctx, 0, 0, 5, p.size, p.size / 2);
                    ctx.fill();
                    break;
            }

            ctx.restore();
        }

        ctx.restore();
    }

    private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        const step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);

        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }

        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }

    clear() {
        this.particles = [];
    }

    getParticleCount(): number {
        return this.particles.length;
    }
}

// Singleton export
export const particles = ParticleSystem.getInstance();
