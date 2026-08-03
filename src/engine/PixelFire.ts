/**
 * PIXEL FIRE — a patch of burning ground, drawn procedurally.
 *
 * What this replaces was a radial orange gradient with four three-rect
 * "flames" stamped on top. It read as a stain with sparkles, not as fire: the
 * player's note was "какой-то подсвет области и огонечки маленькие". The
 * diagnosis is that it had none of the three things that actually say *fire*:
 *
 *   1. **Silhouette.** Fire is a tapering, swaying tongue, not a square. A
 *      flame is recognisable from its outline alone, and the old one had none.
 *   2. **Layers.** Real flame is banded — a deep red envelope, a bright orange
 *      body, a pale core. One colour per flame is a candle sprite from 1994.
 *   3. **Motion at two speeds.** Tongues breathe slowly; sparks rise fast. A
 *      single sine on everything reads as a pulsing light, not a fire.
 *
 * Cost: everything is baked in the constructor and drawn as **one path per
 * layer**, so a whole patch costs about twenty fill calls however tall the
 * flames are. That matters — Ruin can leave several patches burning at once.
 *
 * Deliberately no `shadowBlur` and no outline: the arena rules in CLAUDE.md
 * forbid the second and the first is the single most expensive thing canvas
 * offers. The glow underneath does that job for free.
 */
import type { Vector2 } from './Utils';

/** Pixel grid of the flame rows. Bigger = chunkier, cheaper, more retro. */
const CELL = 4;

interface Tongue {
    /** Base position, relative to the centre */
    x: number;
    y: number;
    /** Width at the base, in pixels */
    w: number;
    /** How many CELL-tall rows at full strength */
    rows: number;
    phase: number;
    speed: number;
    /** How far the tip is allowed to lean while swaying */
    lean: number;
}

interface Ember {
    x: number;
    y: number;
    size: number;
    phase: number;
}

interface Spark {
    x: number;
    y: number;
    /** How high it climbs before restarting */
    rise: number;
    phase: number;
    speed: number;
    size: number;
}

/**
 * The bands of a flame, outermost first. Width and height are fractions of the
 * tongue's own size, so the bands nest inside one another and the tip of each
 * cooler band pokes out above the hotter one inside it.
 *
 * Five, not three. With three the whole patch came out one flat orange, because
 * the eye reads *contrast between bands* as heat, not the hue itself — a fire
 * is dark red at the edges and nearly white at the base, and skipping either
 * end of that range makes it look like tinted smoke.
 */
const BANDS = [
    { wf: 1.00, hf: 1.00, color: '#a82400' },
    { wf: 0.78, hf: 0.88, color: '#f24d00' },
    { wf: 0.56, hf: 0.72, color: '#ff9426' },
    { wf: 0.33, hf: 0.50, color: '#ffd76b' },
    { wf: 0.14, hf: 0.26, color: '#fff6d8' },
];

/**
 * Width of a flame at height `f` (0 base, 1 tip), as a fraction of its base
 * width.
 *
 * Not a straight taper. A cone read as a spike — a picket fence of orange
 * blades, which is what the second cut of this looked like. A flame is a
 * teardrop: pinched where it meets the ground, widest a fifth of the way up,
 * then drawn out to a point.
 */
function flameProfile(f: number): number {
    const taper = Math.pow(Math.max(0, 1 - f), 0.5);
    const foot = 0.5 + 0.5 * Math.min(1, f / 0.2);
    return taper * foot;
}

export class PixelFire {
    private readonly radius: number;
    private readonly tongues: Tongue[] = [];
    private readonly embers: Ember[] = [];
    private readonly sparks: Spark[] = [];

    constructor(radius: number) {
        this.radius = radius;

        // Tongue count scales with the patch so a small fire is not a bonfire.
        // Generous, because tongues have to *overlap* to read as one fire —
        // evenly spaced ones read as a ring of candles on a cake, which is
        // exactly what the first cut of this looked like.
        const count = Math.max(5, Math.min(16, Math.round(radius / 8)));
        for (let i = 0; i < count; i++) {
            // Biased hard toward the middle. `Math.random() ** 1.9` piles the
            // draws near zero; a plain sqrt spread them evenly over the disc,
            // which is the opposite of how a fire is shaped.
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.pow(Math.random(), 1.9) * radius * 0.72;
            const central = 1 - dist / (radius * 0.72);

            // Height is the whole difference between "fire" and "embers with
            // sparkles". The tallest tongue in the middle stands a little over
            // the patch's own radius.
            const height = radius * (0.42 + 0.62 * central) * (0.7 + Math.random() * 0.6);

            this.tongues.push({
                // Stretched horizontally against the vertical squash, so the
                // tongues stand side by side instead of stacking into a column
                x: Math.cos(angle) * dist * 1.35,
                // Squashed vertically: the ground is seen at an angle
                y: Math.sin(angle) * dist * 0.5,
                w: radius * (0.15 + 0.17 * central) + 6,
                rows: Math.max(3, Math.round(height / CELL)),
                phase: Math.random() * Math.PI * 2,
                speed: 4 + Math.random() * 5,
                // Signed: flames that all lean the same way look wind-blown
                lean: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 9),
            });
        }
        // Tallest last, so the big central flames draw over the small ones
        this.tongues.sort((a, b) => a.rows - b.rows);

        // Coal bed: the part that says the *ground* is burning, not the air
        const emberCount = Math.max(6, Math.round(radius / 6));
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * radius * 0.85;
            this.embers.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.55,
                size: 2 + Math.round(Math.random() * 2),
                phase: Math.random() * Math.PI * 2,
            });
        }

        // Sparks climb far faster than the tongues breathe — the second speed
        const sparkCount = Math.max(6, Math.round(radius / 7));
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.pow(Math.random(), 1.5) * radius * 0.6;
            this.sparks.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.55,
                // They start where the flames end, so the column reads as one
                // continuous thing rather than as dust above a fire
                rise: radius * (1.1 + Math.random() * 1.1),
                phase: Math.random(),
                speed: 0.35 + Math.random() * 0.4,
                size: Math.random() < 0.35 ? 4 : 3,
            });
        }
    }

    /**
     * @param time    seconds since the fire started, for the animation
     * @param alpha   overall opacity
     * @param heat    1 while burning hard, →0 as it dies down. Shortens the
     *                tongues and cools the bed rather than just fading it out:
     *                a fire that goes transparent looks like a bug, a fire that
     *                sinks into embers looks like a fire going out.
     */
    draw(ctx: CanvasRenderingContext2D, center: Vector2, time: number, alpha: number, heat: number) {
        if (alpha <= 0) return;

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.globalAlpha = alpha;

        this.drawGlow(ctx, time, heat);
        this.drawEmbers(ctx, time, heat);
        this.drawTongues(ctx, time, heat);
        this.drawSparks(ctx, time, heat);

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /** Warm light on the floor. Fades to nothing before the rim — no outline. */
    private drawGlow(ctx: CanvasRenderingContext2D, time: number, heat: number) {
        const breathe = 0.9 + Math.sin(time * 3.1) * 0.1;
        const r = this.radius * breathe;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        glow.addColorStop(0, `rgba(255, 170, 70, ${(0.36 * heat).toFixed(3)})`);
        glow.addColorStop(0.45, `rgba(255, 90, 20, ${(0.2 * heat).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(120, 20, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Coal bed, in two temperature bands so it does not read as one flat
     * speckle. Each band is a single path.
     */
    private drawEmbers(ctx: CanvasRenderingContext2D, time: number, heat: number) {
        const bands: [string, number][] = [['#a52c00', 0], ['#ff9a30', 0.5]];

        for (const [color, threshold] of bands) {
            ctx.fillStyle = color;
            ctx.beginPath();
            let any = false;
            for (const e of this.embers) {
                // Each coal glows on its own clock, so the bed shimmers
                const glow = (Math.sin(time * 3.4 + e.phase) * 0.5 + 0.5) * heat;
                if (glow < threshold) continue;
                if (threshold === 0 && glow >= 0.55) continue;
                any = true;
                ctx.rect(Math.round(e.x - e.size), Math.round(e.y - e.size / 2), e.size * 2, e.size);
            }
            if (any) ctx.fill();
        }
    }

    /**
     * The flames. Each band is one path across every tongue — four fills for
     * the whole patch, regardless of how many tongues it has.
     */
    private drawTongues(ctx: CanvasRenderingContext2D, time: number, heat: number) {
        for (const band of BANDS) {
            ctx.fillStyle = band.color;
            ctx.beginPath();
            let any = false;

            for (const tongue of this.tongues) {
                // Slow breath on the height — the flame gutters and flares
                const flicker = 0.72 + (Math.sin(time * tongue.speed + tongue.phase) * 0.5 + 0.5) * 0.28;
                const rows = Math.round(tongue.rows * band.hf * flicker * heat);
                if (rows < 1) continue;

                for (let i = 0; i < rows; i++) {
                    const f = i / tongue.rows;
                    const w = tongue.w * band.wf * flameProfile(f);
                    if (w < 1.5) continue;

                    // Sway grows with height, so the base stays planted
                    const sway = Math.sin(time * tongue.speed * 0.75 + tongue.phase + f * 2.6)
                        * tongue.lean * f * f;

                    any = true;
                    ctx.rect(
                        Math.round(tongue.x + sway - w / 2),
                        Math.round(tongue.y - (i + 1) * CELL),
                        Math.max(2, Math.round(w)),
                        CELL,
                    );
                }
            }

            if (any) ctx.fill();
        }
    }

    /** Fast risers. One path, and they fade as they climb. */
    private drawSparks(ctx: CanvasRenderingContext2D, time: number, heat: number) {
        if (heat < 0.15) return;

        // Two alpha steps rather than one per spark, so this stays two fills
        for (const [lo, hi, a] of [[0, 0.5, 0.9], [0.5, 1, 0.35]] as const) {
            ctx.fillStyle = `rgba(255, 214, 140, ${(a * heat).toFixed(3)})`;
            ctx.beginPath();
            let any = false;

            for (const s of this.sparks) {
                // Each spark loops on its own clock
                const climb = (time * s.speed + s.phase) % 1;
                if (climb < lo || climb >= hi) continue;
                any = true;
                const drift = Math.sin(time * 2.4 + s.phase * 9) * 5 * climb;
                ctx.rect(
                    Math.round(s.x + drift),
                    Math.round(s.y - climb * s.rise),
                    s.size,
                    s.size,
                );
            }

            if (any) ctx.fill();
        }
    }
}
