/**
 * AudioSystem — fully procedural Web Audio sound (no asset files).
 *
 * - SFX are synthesized on the fly from oscillators and noise buffers.
 * - Music is a generative loop: a seeded pentatonic bass + lead pattern per
 *   stage theme, scheduled with a lookahead timer.
 * - Volumes (master/sfx/music) persist to localStorage.
 *
 * The AudioContext is created lazily and resumed on the first user gesture
 * (browsers block autoplay), so it is safe to import in any environment —
 * nothing touches Web Audio until a sound is actually requested.
 */

type SfxName =
    | 'shoot' | 'hit' | 'enemyDeath' | 'explosion' | 'pickup'
    | 'levelup' | 'hurt' | 'evolve' | 'bossSpawn' | 'victory' | 'gameOver';

interface AudioSettings {
    master: number;
    sfx: number;
    music: number;
}

const STORAGE_KEY = 'survivors_audio_settings';

function hashString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class AudioSystem {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;
    private musicGain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;

    settings: AudioSettings = { master: 0.7, sfx: 0.8, music: 0.5 };

    /** Per-SFX rate limiting so 20 projectiles/frame don't stack 20 blips */
    private lastPlayed: Map<SfxName, number> = new Map();
    private static readonly MIN_INTERVAL: Partial<Record<SfxName, number>> = {
        shoot: 0.06,
        hit: 0.04,
        enemyDeath: 0.05,
        explosion: 0.1,
        pickup: 0.05,
    };

    // Music state
    private musicTimer: ReturnType<typeof setInterval> | null = null;
    private nextNoteTime: number = 0;
    private musicStep: number = 0;
    private musicRng: () => number = mulberry32(1);
    /** Two alternating 16-step lead patterns (A A B A over the 64-step cycle) */
    private patternA: number[] = [];
    private patternB: number[] = [];
    /** 0..1 — drives tempo, percussion density and lead busyness */
    private musicIntensity: number = 0;

    constructor() {
        this.loadSettings();
        if (typeof window !== 'undefined') {
            // Browsers require a user gesture before audio can start
            const unlock = () => {
                this.ensureContext();
                this.ctx?.resume();
            };
            window.addEventListener('pointerdown', unlock, { once: true });
            window.addEventListener('keydown', unlock, { once: true });
        }
    }

    // =========================================================
    // Settings
    // =========================================================

    private loadSettings() {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
            if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
        } catch { /* corrupted settings — keep defaults */ }
    }

    setVolume(channel: keyof AudioSettings, value: number) {
        this.settings[channel] = Math.max(0, Math.min(1, value));
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch { /* storage unavailable (private mode) */ }
        this.applyVolumes();
    }

    private applyVolumes() {
        if (!this.ctx) return;
        this.masterGain!.gain.value = this.settings.master;
        this.sfxGain!.gain.value = this.settings.sfx;
        this.musicGain!.gain.value = this.settings.music;
    }

    // =========================================================
    // Context plumbing
    // =========================================================

    private ensureContext(): boolean {
        if (this.ctx) return true;
        if (typeof AudioContext === 'undefined') return false;
        this.ctx = new AudioContext();

        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.connect(this.masterGain);
        this.musicGain = this.ctx.createGain();
        this.musicGain.connect(this.masterGain);
        this.applyVolumes();

        // Shared 1s white-noise buffer for percussive sounds
        const rate = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, rate, rate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < rate; i++) data[i] = Math.random() * 2 - 1;

        return true;
    }

    // =========================================================
    // SFX synthesis primitives
    // =========================================================

    private tone(
        freq: number, endFreq: number, duration: number, volume: number,
        type: OscillatorType, when: number = 0
    ) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + duration);
    }

    private noise(duration: number, volume: number, filterFreq: number, when: number = 0) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + when;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer!;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        src.start(t, Math.random() * 0.5, duration + 0.05);
    }

    // =========================================================
    // SFX presets
    // =========================================================

    play(name: SfxName) {
        if (!this.ensureContext() || this.ctx!.state !== 'running') return;

        const minInterval = AudioSystem.MIN_INTERVAL[name] ?? 0;
        const now = this.ctx!.currentTime;
        const last = this.lastPlayed.get(name) ?? -Infinity;
        if (now - last < minInterval) return;
        this.lastPlayed.set(name, now);

        switch (name) {
            case 'shoot':
                this.tone(880, 220, 0.08, 0.12, 'square');
                break;
            case 'hit':
                this.noise(0.06, 0.15, 3000);
                break;
            case 'enemyDeath':
                this.tone(300, 60, 0.15, 0.2, 'sawtooth');
                this.noise(0.1, 0.12, 1500);
                break;
            case 'explosion':
                this.noise(0.5, 0.5, 900);
                this.tone(120, 30, 0.5, 0.4, 'sine');
                break;
            case 'pickup':
                this.tone(660, 660, 0.06, 0.1, 'sine');
                this.tone(990, 990, 0.08, 0.1, 'sine', 0.05);
                break;
            case 'levelup':
                [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.15, 0.15, 'triangle', i * 0.08));
                break;
            case 'hurt':
                this.tone(220, 80, 0.2, 0.3, 'sawtooth');
                this.noise(0.15, 0.2, 800);
                break;
            case 'evolve':
                [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, f * 1.02, 0.3, 0.15, 'triangle', i * 0.07));
                this.noise(0.6, 0.1, 4000, 0.2);
                break;
            case 'bossSpawn':
                this.tone(110, 55, 0.7, 0.4, 'sawtooth');
                this.tone(116, 58, 0.7, 0.3, 'sawtooth', 0.05);
                break;
            case 'victory':
                [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.4, 0.2, 'triangle', i * 0.15));
                break;
            case 'gameOver':
                [440, 349, 294, 220].forEach((f, i) => this.tone(f, f * 0.97, 0.5, 0.2, 'triangle', i * 0.25));
                break;
        }
    }

    // =========================================================
    // Generative music
    // =========================================================

    /** A minor pentatonic (A C D E G), one octave */
    private static readonly SCALE = [110, 130.81, 146.83, 164.81, 196];
    /** Chord progression Am → F → G → Em, one chord per 16-step bar */
    private static readonly CHORD_ROOTS = [110, 87.31, 98, 82.41];
    private static readonly CYCLE = 64; // 4 bars × 16 steps

    /**
     * Set music dynamics (0 = calm intro, 1 = full assault).
     * Raises tempo (100 → 140 BPM), percussion density and lead busyness.
     */
    setMusicIntensity(value: number) {
        this.musicIntensity = Math.max(0, Math.min(1, value));
    }

    startMusic(theme: string) {
        if (!this.ensureContext()) return;
        this.stopMusic();

        this.musicRng = mulberry32(hashString(theme));
        this.musicStep = 0;
        this.musicIntensity = 0;
        this.patternA = this.makePattern(0.45);
        this.patternB = this.makePattern(0.3); // busier B-section
        this.nextNoteTime = this.ctx!.currentTime + 0.1;

        // Lookahead scheduler (schedules ~0.2s ahead every 50ms)
        this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
    }

    stopMusic() {
        if (this.musicTimer !== null) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }

    /** 16-step lead pattern: scale degree or -1 for rest */
    private makePattern(restChance: number): number[] {
        return Array.from({ length: 16 }, () =>
            this.musicRng() < restChance ? -1 : Math.floor(this.musicRng() * AudioSystem.SCALE.length)
        );
    }

    private scheduleMusic() {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') return;

        const heat = this.musicIntensity;
        const bpm = 100 + 40 * heat;
        const stepDuration = 60 / bpm / 2; // eighth notes

        while (this.nextNoteTime < ctx.currentTime + 0.2) {
            const cycleStep = this.musicStep % AudioSystem.CYCLE;
            const bar = Math.floor(cycleStep / 16); // 0..3
            const step = cycleStep % 16;
            const when = this.nextNoteTime - ctx.currentTime;

            const chordRoot = AudioSystem.CHORD_ROOTS[bar];
            // Bars run A A B A — the B section breaks the loop feel
            const pattern = bar === 2 ? this.patternB : this.patternA;

            // --- Bass: follows the chord progression ---
            if (step % 4 === 0) {
                const fifth = step % 8 === 4 && heat > 0.3;
                this.musicTone(chordRoot / 2 * (fifth ? 1.5 : 1), stepDuration * 3.5, 0.16, 'triangle', when);
                // Driving octave bass on the off-quarters when things heat up
            } else if (step % 4 === 2 && heat > 0.55) {
                this.musicTone(chordRoot / 2, stepDuration * 1.5, 0.1, 'triangle', when);
            }

            // --- Percussion ---
            // Kick: half notes when calm, four-on-the-floor when hot
            if (step % 8 === 0 || (heat > 0.4 && step % 4 === 0)) {
                this.kick(when);
            }
            // Snare on backbeats once the fight picks up
            if (heat > 0.35 && (step === 4 || step === 12)) {
                this.snare(when, 0.1 + 0.1 * heat);
            }
            // Hats on offbeats, denser with intensity
            if (step % 2 === 1 && this.musicRng() < 0.25 + 0.6 * heat) {
                this.hat(when, 0.03 + 0.04 * heat);
            }

            // --- Lead ---
            const degree = pattern[step];
            if (degree >= 0) {
                // Transpose the pentatonic toward the current chord root
                const freq = AudioSystem.SCALE[degree] * (chordRoot / 110);
                const octave = this.musicRng() < 0.15 + 0.25 * heat ? 4 : 2;
                this.musicTone(freq * octave, stepDuration * 1.8, 0.05, 'square', when);
                // Fast echo note — gives the line momentum at high intensity
                if (heat > 0.6 && this.musicRng() < 0.3) {
                    this.musicTone(freq * octave * 2, stepDuration * 0.9, 0.025, 'square', when + stepDuration / 2);
                }
            }

            // --- Cycle-end fill and evolution ---
            if (cycleStep === AudioSystem.CYCLE - 2 && heat > 0.45) {
                this.snare(when, 0.08);
                this.snare(when + stepDuration / 2, 0.1);
            }
            if (cycleStep === AudioSystem.CYCLE - 1) {
                // Mutate one step of one pattern so the track never truly loops
                const target = this.musicRng() < 0.5 ? this.patternA : this.patternB;
                const idx = Math.floor(this.musicRng() * 16);
                target[idx] = this.musicRng() < 0.3
                    ? -1
                    : Math.floor(this.musicRng() * AudioSystem.SCALE.length);
            }

            this.nextNoteTime += stepDuration;
            this.musicStep++;
        }
    }

    /** Punchy kick: fast sine pitch drop */
    private kick(when: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + 0.13);
    }

    /** Snare: bandpassed noise burst */
    private snare(when: number, volume: number) {
        this.musicNoise(when, 0.12, volume, 'bandpass', 1800);
    }

    /** Hi-hat: short highpassed noise tick */
    private hat(when: number, volume: number) {
        this.musicNoise(when, 0.04, volume, 'highpass', 7000);
    }

    private musicNoise(when: number, duration: number, volume: number, filterType: BiquadFilterType, freq: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer!;
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain!);
        src.start(t, this.musicRng() * 0.5, duration + 0.02);
    }

    private musicTone(freq: number, duration: number, volume: number, type: OscillatorType, when: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + duration + 0.05);
    }
}

export const audio = new AudioSystem();
