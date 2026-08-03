/**
 * DAMAGE NUMBERS — the digits that pop off a hit.
 *
 * Self-contained: it owns the pool, the arc physics and the pixel-font pass,
 * and it also owns the *feedback* that belongs to a hit landing (the tick, the
 * crit chime, the micro-freeze). Those used to sit in GameManager purely
 * because the spawn call did.
 *
 * ## Merging
 *
 * A late-game sweep hits twenty enemies in one frame and used to print twenty
 * numbers on top of each other — an unreadable pile of digits that hid the very
 * thing you needed to see, which is where the gap in the crowd is. Numbers that
 * land close together in space and time are now folded into one that shows the
 * **total**, the way the scrolling-combat-text addons in MMOs do it.
 *
 * That is strictly more information, not less: "twenty separate 33s" tells you
 * nothing that "660" does not, and the total is the number you actually care
 * about. It is also far cheaper — one entry instead of twenty.
 *
 * A number stays open for merging for MERGE_WINDOW seconds after it first
 * appears and then closes for good, so a continuous stream cannot pin one digit
 * in place forever; it flies off and the next hit opens a fresh one.
 */
import type { Vector2 } from '../../engine/Utils';
import { drawPixelText } from '../../engine/PixelFont';
import { audio } from '../../engine/AudioSystem';
import { juice } from '../../engine/JuiceSystem';

/** Glyph height of the pixel font, for stacking the hit counter above a total */
const GLYPH_HEIGHT = 7;

/** Damage the player dealt, or damage the player took */
export type DamageKind = 'dealt' | 'taken';

interface DamageNumber {
    kind: DamageKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Running total, so merges can add to it */
    amount: number;
    text: string;
    life: number;
    maxLife: number;
    isCrit: boolean;
    /** How many hits this number is the sum of */
    hits: number;
    /** How much of `amount` came from critical hits — decides the crit styling */
    critAmount: number;
    /** Seconds this entry still accepts merges. Never refreshed. */
    openFor: number;
    /** Punch-in timer, restarted on every merge so growth is visible */
    pop: number;
}

/**
 * Cap on how many digits may be on screen.
 *
 * This was 90, with a comment admitting the screen is unreadable well before
 * that. It was — a screenshot of a zone build was a solid wall of orange with
 * no arena visible behind it. The dynamic merge radius below is what actually
 * keeps the count down; this is only the backstop.
 */
const MAX_ON_SCREEN = 28;

/** Minimum real seconds between crit hit-stops, so a volley cannot stutter */
const CRIT_STOP_GAP = 0.35;

/** How long a number accepts merges */
const MERGE_WINDOW = 0.22;

/**
 * How far a hit may be from an open number to fold into it — and it **grows
 * with how busy the screen already is**.
 *
 * A fixed 38px was the single biggest reason merging did not work. A zone
 * weapon covers 300-400px, so one tick landed twenty hits that were all too far
 * apart to merge and printed twenty separate numbers; a screen-filling build
 * printed a wall of them and hid the arena completely.
 *
 * Making it a constant big enough for a zone would throw away locality when the
 * screen is quiet, which is when locality is worth something. So it scales:
 * a few numbers on screen and merging stays tight and precise, a crowded screen
 * and it widens until new hits nearly always fold into an existing total. The
 * display degrades from "what each hit did" to "how much is happening here",
 * which is the right thing to know at each of those moments, and the count
 * bounds itself without a hard cap doing the work.
 */
const MERGE_RADIUS_CALM = 40;
const MERGE_RADIUS_BUSY = 220;

/** Number of live entries at which the merge radius reaches its maximum */
const CROWDED_AT = 6;

/**
 * Damage *taken* gathers for much longer than damage dealt.
 *
 * Every one of these spawns at the same point — the player's head — so short
 * windows do not scatter them the way they scatter across a crowd of enemies;
 * they just pile into an unreadable stack of overlapping digits. Half a second
 * turns "1, 5, 4, 5" stacked on top of each other into one "15" you can
 * actually read, which is also the number that matters: how fast is this crowd
 * taking me apart.
 */
const TAKEN_MERGE_WINDOW = 0.55;

/** Length of the punch-in on spawn and on every merge */
const POP_TIME = 0.12;

const STORAGE_KEY = 'survivors.damageNumbers';

function loadEnabled(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

/**
 * Player-facing toggle. Some people read the fight better with the digits gone
 * entirely — the HP bar, the health bars and the particles carry enough.
 */
export const damageNumberSettings = {
    enabled: loadEnabled(),
    set(value: boolean) {
        this.enabled = value;
        try {
            localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
        } catch {
            // Private browsing / storage disabled — the setting just won't stick
        }
    },
};

export class DamageNumbers {
    private items: DamageNumber[] = [];
    /** Real time of the last crit hit-stop, to rate-limit the effect */
    private lastCritStop: number = 0;

    clear() {
        this.items = [];
    }

    /** How many entries are live — the debug overlay reports this */
    get count(): number {
        return this.items.length;
    }

    spawn(pos: Vector2, amount: number, isCrit: boolean = false) {
        // The sound is feedback about the hit, not about the digits, so it
        // plays either way (AudioSystem rate-limits it per effect)
        this.playHitFeedback(isCrit);
        this.push(pos, amount, isCrit, 'dealt');
    }

    /**
     * Damage the *player* took, in red, above their head.
     *
     * Added because a single enemy chewing on you was invisible: it took about
     * 3.6 HP/s off a 150 HP bar, which no one notices, and then a crowd took
     * the whole bar in four seconds. The curve between those was smooth all
     * along — what was missing was any signal that the first case was happening
     * at all, so it read as "one enemy does nothing, then I instantly die".
     *
     * The HP bar is a *state* readout and states are bad at reporting small
     * events. A number is an event.
     */
    spawnTaken(pos: Vector2, amount: number) {
        if (amount < 0.5) return;
        this.push(pos, amount, false, 'taken');
    }

    private push(pos: Vector2, amount: number, isCrit: boolean, kind: DamageKind) {
        if (!damageNumberSettings.enabled) return;

        if (this.mergeInto(pos, amount, isCrit, kind)) return;

        if (this.items.length > MAX_ON_SCREEN) this.items.shift();

        const taken = kind === 'taken';
        const life = taken ? 0.7 : (isCrit ? 0.8 : 0.55);
        this.items.push({
            // A little horizontal jitter so two simultaneous hits that failed to
            // merge do not sit exactly on top of each other. Kept small — it
            // pushes hits apart *before* they get a chance to merge, so it works
            // against the thing that actually keeps the screen readable.
            x: taken ? pos.x : pos.x + (Math.random() - 0.5) * 14,
            y: pos.y,
            // Arc upward and outward so overlapping hits stay readable
            vx: taken ? 0 : (Math.random() - 0.5) * 60,
            vy: taken ? -70 : (isCrit ? -160 : -110),
            amount,
            text: Math.max(1, Math.round(amount)).toString(),
            life,
            maxLife: life,
            isCrit,
            kind,
            hits: 1,
            critAmount: isCrit ? amount : 0,
            openFor: taken ? TAKEN_MERGE_WINDOW : MERGE_WINDOW,
            pop: POP_TIME,
        });
    }

    /** Merge reach right now — see MERGE_RADIUS_CALM */
    private get mergeRadius(): number {
        const busy = Math.min(this.items.length / CROWDED_AT, 1);
        return MERGE_RADIUS_CALM + busy * (MERGE_RADIUS_BUSY - MERGE_RADIUS_CALM);
    }

    /**
     * Fold a hit into a nearby open number. Searched newest-first, because the
     * most recent number is nearly always the right one and a volley resolves
     * in one frame.
     */
    private mergeInto(pos: Vector2, amount: number, isCrit: boolean, kind: DamageKind): boolean {
        const radius = this.mergeRadius;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const dn = this.items[i];
            if (dn.kind !== kind) continue; // never fold your damage into theirs
            if (dn.openFor <= 0) continue;
            if (Math.abs(dn.x - pos.x) > radius) continue;
            if (Math.abs(dn.y - pos.y) > radius) continue;

            dn.amount += amount;
            dn.hits++;
            if (isCrit) dn.critAmount += amount;
            dn.text = Math.max(1, Math.round(dn.amount)).toString();

            // Crit styling follows where the DAMAGE came from, not whether any
            // single hit crit.
            //
            // The rule used to be "one crit anywhere makes the whole group read
            // as a crit", and at merge sizes that is the same as "always": with
            // a 20% crit chance and sixteen folded hits it fires 97% of the
            // time. Every number on screen came out big and orange, which is
            // what a play-test read as "there are way too many crits" when the
            // crit rate had not changed at all.
            //
            // Weighting by damage keeps the case that matters — one real crit
            // among a few chip hits still dominates its total and still reads as
            // a crit — while a sweep that happened to contain one stays plain.
            const critHeavy = dn.critAmount * 2 >= dn.amount;
            if (critHeavy !== dn.isCrit) {
                dn.isCrit = critHeavy;
                dn.maxLife = critHeavy ? 0.8 : 0.55;
            }
            // Hold it in place while it is still gathering, then let it fly
            dn.life = dn.maxLife;
            dn.pop = POP_TIME;
            return true;
        }
        return false;
    }

    private playHitFeedback(isCrit: boolean) {
        if (!isCrit) {
            audio.play('hit');
            return;
        }

        audio.play('crit');
        const now = performance.now() / 1000;
        if (now - this.lastCritStop > CRIT_STOP_GAP) {
            this.lastCritStop = now;
            juice.hitStop(0.035);
            juice.addTrauma(0.06);
        }
    }

    update(dt: number) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const dn = this.items[i];

            if (dn.openFor > 0) {
                dn.openFor -= dt;
                if (dn.pop > 0) dn.pop -= dt;
                // A number gathering over a crowd hovers, because moving it
                // would drag it away from what it is counting. One gathering
                // over the PLAYER has to climb, or it sits on top of the
                // sprite for half a second and hides the thing being eaten.
                if (dn.kind === 'taken') dn.y += dn.vy * dt;
                continue;
            }

            dn.life -= dt;
            if (dn.life <= 0) {
                this.items.splice(i, 1);
                continue;
            }
            if (dn.pop > 0) dn.pop -= dt;
            dn.x += dn.vx * dt;
            dn.y += dn.vy * dt;
            dn.vy += 260 * dt;  // gravity — the numbers arc and settle
            dn.vx *= 0.94;
        }
    }

    /** Pixel-font damage numbers: crits pop bigger, brighter and outlined */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.items.length === 0) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        for (const dn of this.items) {
            const t = 1 - dn.life / dn.maxLife;
            // Punch-in on spawn and on every merge, so a total visibly grows.
            //
            // Both the peak and the bases came down a notch. `pop` restarts on
            // every merge, so a number gathering over a crowd sat at its maximum
            // the entire time it was open — and the maximum was round(3.4 * 1.6)
            // = a 5x pixel font. Combined with nearly everything rendering as a
            // crit, the arena disappeared behind its own damage numbers.
            const pop = dn.pop > 0
                ? 1 + (dn.pop / POP_TIME) * 0.3
                : Math.max(0.85, 1 - t * 0.15);
            const base = dn.isCrit ? 2.8 : (dn.kind === 'taken' ? 2.6 : 2.0);
            const scale = Math.max(1, Math.round(base * pop));

            const sx = dn.x - camera.x;
            const sy = dn.y - camera.y;

            ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
            drawPixelText(ctx, dn.text, sx, sy, {
                scale,
                align: 'center',
                spacing: 1,
                shadow: 1,
                color: dn.kind === 'taken' ? '#ff5a6e' : (dn.isCrit ? '#ffe14d' : '#ffffff'),
                outline: dn.isCrit ? '#ff4400' : (dn.kind === 'taken' ? '#2a0008' : undefined),
            });

            // How many hits this total is. Without it a merged number reads as
            // one enormous hit — the first thing merging did in play was make
            // a perk look broken, because ten swings landing at once printed
            // "600" and nothing said it was ten.
            if (dn.hits > 1) {
                const small = Math.max(1, Math.round(scale * 0.55));
                drawPixelText(ctx, `X${dn.hits}`, sx, sy - GLYPH_HEIGHT * scale - small * 2, {
                    scale: small,
                    align: 'center',
                    spacing: 1,
                    shadow: 1,
                    color: '#7fd4ff',
                });
            }
        }
        ctx.restore();
    }
}
