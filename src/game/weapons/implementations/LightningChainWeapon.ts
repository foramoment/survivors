/**
 * LIGHTNING CHAIN WEAPON
 * Lightning that chains between enemies.
 * 
 * Evolved: Thunderstorm - Infinite chain with split chance
 */
import { ProjectileWeapon, Beam, ChainLightning } from '../base';
import type { Player } from '../../entities/Player';
import { distance, type Vector2 } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// EVOLVED LIGHTNING CHAIN - THUNDERSTORM
// 10% chance per bounce to split into 2 branches
// ============================================

export class ThunderstormLightning extends ChainLightning {
    splitChance: number = 0.1;
    private pendingSplits: { pos: Vector2; damage: number; bounces: number; hitEnemies: Set<any> }[] = [];

    update(dt: number) {
        // Process pending splits
        if (this.pendingSplits.length > 0) {
            const split = this.pendingSplits.shift()!;
            this.createSplitChain(split);
        }

        super.update(dt);
    }

    private createSplitChain(split: { pos: Vector2; damage: number; bounces: number; hitEnemies: Set<any> }) {
        // Find a new target not in hitEnemies
        let target: any = null;
        let minDst = this.range;

        const nearby = levelSpatialHash.getWithinRadius(split.pos, this.range);

        for (const enemy of nearby) {
            if (split.hitEnemies.has(enemy)) continue;
            const d = distance(split.pos, enemy.pos);
            if (d < minDst) {
                minDst = d;
                target = enemy;
            }
        }

        if (target && split.bounces > 0) {
            // Add segment
            this.segments.push({
                start: { ...split.pos },
                end: { ...target.pos },
                alpha: 1
            });

            // Deal damage via DamageSystem
            damageSystem.dealRawDamage(target, split.damage, target.pos);
            this.onHit(target, split.damage);
            split.hitEnemies.add(target);

            // Emit particles
            particles.emitLightning(target.pos.x, target.pos.y);

            // Check for another split
            if (Math.random() < this.splitChance) {
                this.pendingSplits.push({
                    pos: { ...target.pos },
                    damage: split.damage * 0.9,
                    bounces: split.bounces - 1,
                    hitEnemies: new Set(split.hitEnemies)
                });
            }

            // Continue chain
            if (split.bounces > 1) {
                this.pendingSplits.push({
                    pos: { ...target.pos },
                    damage: split.damage * 0.95,
                    bounces: split.bounces - 1,
                    hitEnemies: split.hitEnemies
                });
            }
        }
    }

    // Override to add split logic
    chainToEnemy(enemy: any, currentBounces: number) {
        // Check for split
        if (Math.random() < this.splitChance && currentBounces > 1) {
            this.pendingSplits.push({
                pos: { ...enemy.pos },
                damage: this.damage * 0.9,
                bounces: Math.floor(currentBounces / 2),
                hitEnemies: new Set(this.hitEnemies)
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const seg of this.segments) {
            this.drawThunderstormBolt(ctx, seg.start, seg.end, seg.alpha);
        }

        ctx.restore();
    }

    private drawThunderstormBolt(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2, alpha: number) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5 || !isFinite(dist) || alpha <= 0) return;

        ctx.save();

        // Generate zigzag points
        const numSegments = Math.min(18, Math.max(5, Math.floor(dist / 25)));
        const points: Vector2[] = [{ x: start.x, y: start.y }];

        const perpX = -dy / dist;
        const perpY = dx / dist;

        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const baseX = start.x + dx * t;
            const baseY = start.y + dy * t;
            const offset = (Math.random() - 0.5) * 35 * (1 - Math.abs(t - 0.5) * 1.5);
            points.push({
                x: baseX + perpX * offset,
                y: baseY + perpY * offset
            });
        }
        points.push({ x: end.x, y: end.y });

        // Outer glow - purple tint for evolved
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(180, 100, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 14;
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        // Main bolt - brighter
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(200, 150, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 5;
        ctx.shadowColor = '#cc88ff';
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Bright core - white/purple
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.stroke();

        // More branches for evolved
        if (alpha > 0.3 && dist > 30) {
            for (let i = 1; i < points.length - 1; i++) {
                if (Math.random() > 0.4) {
                    const branchAngle = (Math.random() - 0.5) * Math.PI * 0.7;
                    const branchLen = 15 + Math.random() * 30;
                    const angle = Math.atan2(dy, dx) + branchAngle;

                    ctx.beginPath();
                    ctx.moveTo(points[i].x, points[i].y);
                    ctx.lineTo(
                        points[i].x + Math.cos(angle) * branchLen,
                        points[i].y + Math.sin(angle) * branchLen
                    );
                    ctx.strokeStyle = `rgba(200, 150, 255, ${alpha * 0.5})`;
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 5;
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }
}

export class LightningChainWeapon extends ProjectileWeapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Lightning that chains between enemies.";
    projectileEmoji = "⚡";
    pierce = 3;

    readonly stats = {
        damage: 25,
        cooldown: 1.8,
        area: 800,
        speed: 0,
        duration: 0.3,
        pierce: 5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.pierce = this.stats.pierce;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        const isEvolved = this.evolved;

        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

            if (target) {
                this.fire(target);
                const cdMultiplier = isEvolved ? 1.5 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: any) {
        const isEvolved = this.evolved;

        // Use DamageSystem for initial hit
        const result = damageSystem.dealDamage({
            baseDamage: this.damage,
            source: this,
            target: target,
            position: target.pos
        });
        particles.emitLightning(target.pos.x, target.pos.y);

        const beamColor = isEvolved ? '#aa00ff' : '#ffff00';
        const beam = new Beam(this.owner.pos, target.pos, 0.1, beamColor, isEvolved ? 3 : 2);
        this.onSpawn(beam);

        const bounces = isEvolved ? 999 : (this.pierce) + this.level;
        const maxChainLength = isEvolved ? 10000 : this.area;

        let chain: ChainLightning | ThunderstormLightning;
        if (isEvolved) {
            chain = new ThunderstormLightning(target.pos.x, target.pos.y, result.finalDamage, bounces, maxChainLength);
            (chain as ThunderstormLightning).splitChance = 0.1;
        } else {
            chain = new ChainLightning(target.pos.x, target.pos.y, result.finalDamage, bounces, maxChainLength);
        }

        chain.hitEnemies.add(target);
        // Chain hits use DamageSystem too
        chain.onHit = (t: any, d: number) => {
            damageSystem.dealDamage({
                baseDamage: d / (this.owner.stats?.might || 1), // Undo might since DamageSystem applies it
                source: this,
                target: t,
                position: t.pos
            });
            particles.emitLightning(t.pos.x, t.pos.y);
        };

        this.onSpawn(chain);
    }
}
