/**
 * AudioSystem — fully procedural chiptune audio (no asset files).
 *
 * Sound design follows the classic 4-channel NES layout:
 *   PULSE 1  → lead melody (duty-cycle square, vibrato)
 *   PULSE 2  → harmony / fast arpeggios
 *   TRIANGLE → bass line
 *   NOISE    → drums (kick / snare / hat)
 *
 * The music is a generative *song*, not a random walk: every stage theme seeds
 * a key, tempo, chord progression and an 8-note motif. Bars are assembled from
 * hand-authored drum/bass patterns picked by the current section (INTRO →
 * VERSE → CHORUS → BRIDGE), and the section is chosen by gameplay intensity.
 * The motif is transposed and ornamented per chord, so the track stays
 * recognisable while never repeating exactly.
 *
 * The music bus runs through a shared chain — waveshaper drive → tempo-synced
 * delay → lowpass that opens with intensity → compressor — which is what gives
 * the 8-bit voices depth without any samples.
 *
 * The AudioContext is created lazily and resumed on the first user gesture
 * (browsers block autoplay), so it is safe to import in any environment —
 * nothing touches Web Audio until a sound is actually requested.
 */

type SfxName =
    | 'shoot' | 'hit' | 'crit' | 'enemyDeath' | 'explosion' | 'pickup'
    | 'levelup' | 'crash' | 'hurt' | 'evolve' | 'bossSpawn' | 'victory' | 'gameOver'
    | 'uiHover' | 'uiSelect' | 'uiBack';

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

/** MIDI note number → frequency (A4 = 69 = 440 Hz) */
function noteFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Semitone offsets of the natural minor scale */
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** Chord degrees (scale steps) of the progressions we pick from */
const PROGRESSIONS: number[][] = [
    [0, 5, 3, 4], // i  VI  IV  V   — heroic
    [0, 3, 4, 4], // i  IV  V   V   — driving
    [0, 6, 5, 4], // i  VII VI  V   — descending, epic
    [0, 2, 5, 4], // i  III VI  V   — wistful
];

/** One 16-step bar of drums/bass behaviour */
interface Section {
    kick: string;
    snare: string;
    hat: string;
    /** 0 = roots only, 1 = root+fifth, 2 = driving eighths */
    bass: number;
    /** Lead note density multiplier */
    lead: number;
    /** Fast arpeggio on the second pulse channel */
    arp: boolean;
    /** Base octave offset for the lead, in semitones */
    leadShift: number;
}

const SECTIONS: Record<string, Section> = {
    intro: {
        kick: 'x-------x-------',
        snare: '----------------',
        hat: '--x---x---x---x-',
        bass: 0, lead: 0.45, arp: false, leadShift: 0,
    },
    verse: {
        kick: 'x-----x-x-------',
        snare: '----x-------x---',
        hat: '--x-x-x-x-x-x-x-',
        bass: 1, lead: 0.7, arp: false, leadShift: 0,
    },
    chorus: {
        kick: 'x---x---x---x---',
        snare: '----x-------x---',
        hat: '-x-x-x-x-x-x-xxx',
        bass: 2, lead: 1, arp: true, leadShift: 12,
    },
    bridge: {
        kick: 'x-------x---x---',
        snare: '----x-------x-x-',
        hat: '--x---x---x---x-',
        bass: 1, lead: 0.8, arp: true, leadShift: 0,
    },
    finale: {
        kick: 'x-x-x-x-x-x-x-x-',
        snare: '----x---x---x-x-',
        hat: 'xxxxxxxxxxxxxxxx',
        bass: 2, lead: 1.15, arp: true, leadShift: 12,
    },
};

/** Everything a stage theme needs to sound like its own track */
interface Song {
    /** Root note (MIDI) of the key */
    root: number;
    bpm: number;
    progression: number[];
    /** 8 scale-degree offsets (or -1 for a rest) that form the hook */
    motif: number[];
    /** Duty cycle of the lead pulse: 0.125 / 0.25 / 0.5 */
    leadDuty: number;
    arpDuty: number;
}

export class AudioSystem {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;
    private musicGain: GainNode | null = null;
    /** Post-processing input for music voices (drive → delay → filter) */
    private musicBus: GainNode | null = null;
    private musicFilter: BiquadFilterNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private pulseWaves: Map<number, PeriodicWave> = new Map();

    settings: AudioSettings = { master: 0.7, sfx: 0.8, music: 0.5 };

    /** Per-SFX rate limiting so 20 projectiles/frame don't stack 20 blips */
    private lastPlayed: Map<SfxName, number> = new Map();
    private static readonly MIN_INTERVAL: Partial<Record<SfxName, number>> = {
        shoot: 0.06,
        hit: 0.04,
        crit: 0.08,
        enemyDeath: 0.05,
        explosion: 0.1,
        pickup: 0.05,
        uiHover: 0.05,
    };

    // Music state
    private musicTimer: ReturnType<typeof setInterval> | null = null;
    private nextNoteTime: number = 0;
    private musicStep: number = 0;
    private musicRng: () => number = mulberry32(1);
    private song: Song | null = null;
    /** 0..1 — drives tempo, section choice, filter opening and lead busyness */
    private musicIntensity: number = 0;
    /** Last lowpass target, so per-frame intensity updates don't spam automation */
    private filterTarget: number = -1;
    /** Pitch offsets of the pickup arpeggio, so crystal streaks play a riff */
    private pickupStep: number = 0;
    private lastPickup: number = 0;

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
        this.musicGain!.gain.value = this.settings.music * 0.9;
    }

    // =========================================================
    // Context plumbing
    // =========================================================

    private ensureContext(): boolean {
        if (this.ctx) return true;
        if (typeof AudioContext === 'undefined') return false;
        this.ctx = new AudioContext();
        const ctx = this.ctx;

        // Compressor keeps the 4 music channels + a dozen SFX from clipping
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 20;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.18;
        compressor.connect(ctx.destination);

        this.masterGain = ctx.createGain();
        this.masterGain.connect(compressor);

        this.sfxGain = ctx.createGain();
        this.sfxGain.connect(this.masterGain);

        this.musicGain = ctx.createGain();
        this.musicGain.connect(this.masterGain);

        // --- Music post chain: drive → delay (tempo-synced) → lowpass ---
        this.musicFilter = ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = 6000;
        this.musicFilter.Q.value = 0.7;
        this.musicFilter.connect(this.musicGain);

        const drive = ctx.createWaveShaper();
        drive.curve = AudioSystem.makeDriveCurve(6);
        drive.oversample = '2x';
        drive.connect(this.musicFilter);

        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.21;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.32;
        const delayMix = ctx.createGain();
        delayMix.gain.value = 0.3;
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(delayMix);
        delayMix.connect(this.musicFilter);

        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 1;
        this.musicBus.connect(drive);
        this.musicBus.connect(delay);

        this.applyVolumes();

        // Shared 1s white-noise buffer for percussive sounds
        const rate = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, rate, rate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < rate; i++) data[i] = Math.random() * 2 - 1;

        return true;
    }

    /** Soft-clip curve — adds the gritty harmonics chip hardware had for free */
    private static makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
        const n = 1024;
        const curve = new Float32Array(new ArrayBuffer(n * 4));
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
        }
        return curve;
    }

    /**
     * Band-limited pulse wave for a given duty cycle. 12.5% is thin and nasal,
     * 25% is the classic lead, 50% is a plain square.
     */
    private pulseWave(duty: number): PeriodicWave {
        const key = Math.round(duty * 1000);
        let wave = this.pulseWaves.get(key);
        if (!wave) {
            const harmonics = 24;
            const real = new Float32Array(harmonics);
            const imag = new Float32Array(harmonics);
            for (let n = 1; n < harmonics; n++) {
                imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
            }
            wave = this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false });
            this.pulseWaves.set(key, wave);
        }
        return wave;
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

    /** Pulse-wave blip with an optional pitch sweep — the workhorse chip voice */
    private blip(
        freq: number, endFreq: number, duration: number, volume: number,
        duty: number = 0.25, when: number = 0
    ) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + when;
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(this.pulseWave(duty));
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);

        const gain = ctx.createGain();
        // Hard attack, exponential decay — no filter sweep, keeps it crunchy
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    /** Stepped pitch descent — the "falling" chip sound (deaths, cancels) */
    private pitchSteps(from: number, ratio: number, steps: number, stepTime: number, volume: number, duty = 0.5) {
        for (let i = 0; i < steps; i++) {
            const f = from * Math.pow(ratio, i);
            this.blip(f, f, stepTime * 0.9, volume * (1 - i / (steps * 1.5)), duty, i * stepTime);
        }
    }

    private noise(duration: number, volume: number, filterFreq: number, when: number = 0, type: BiquadFilterType = 'lowpass') {
        const ctx = this.ctx!;
        const t = ctx.currentTime + when;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer!;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        src.start(t, Math.random() * 0.5, duration + 0.05);
    }

    /** Noise with a filter sweep — explosions, whooshes, impacts */
    private noiseSweep(duration: number, volume: number, fromFreq: number, toFreq: number, when: number = 0) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + when;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer!;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(fromFreq, t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t + duration);
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
            case 'shoot': {
                // Slight random detune keeps rapid fire from turning into a drone
                const f = 820 * (0.94 + Math.random() * 0.12);
                this.blip(f, f * 0.28, 0.07, 0.09, 0.125);
                this.noise(0.02, 0.05, 5000, 0, 'highpass');
                break;
            }
            case 'hit':
                this.noise(0.05, 0.12, 3200, 0, 'bandpass');
                this.blip(1400, 900, 0.03, 0.05, 0.5);
                break;
            case 'crit':
                // Bright two-note ping so crits read over the noise floor
                this.blip(1568, 1568, 0.06, 0.11, 0.25);
                this.blip(2093, 2093, 0.1, 0.09, 0.125, 0.04);
                this.noise(0.05, 0.08, 6000, 0, 'highpass');
                break;
            case 'enemyDeath':
                this.pitchSteps(420, 0.72, 4, 0.028, 0.13, 0.25);
                this.noise(0.09, 0.1, 1600);
                break;
            case 'explosion':
                this.noiseSweep(0.55, 0.42, 2600, 120);
                this.tone(140, 32, 0.5, 0.38, 'sine');
                this.tone(90, 28, 0.35, 0.2, 'triangle', 0.02);
                break;
            case 'pickup': {
                // Consecutive pickups walk up a pentatonic run, then reset
                const t = this.ctx!.currentTime;
                if (t - this.lastPickup > 1.2) this.pickupStep = 0;
                this.lastPickup = t;
                const degrees = [0, 2, 4, 7, 9, 12];
                const semi = degrees[this.pickupStep % degrees.length];
                this.pickupStep++;
                const f = noteFreq(76 + semi);
                this.blip(f, f, 0.05, 0.07, 0.125);
                this.blip(f * 2, f * 2, 0.07, 0.045, 0.125, 0.035);
                break;
            }
            case 'levelup':
                // Rising fanfare on the lead duty + shimmer tail
                [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
                    const f = noteFreq(64 + semi);
                    this.blip(f, f, 0.16, 0.11, 0.25, i * 0.055);
                });
                this.noise(0.5, 0.05, 7000, 0.25, 'highpass');
                break;
            case 'crash':
                // The level-up panel smashing through the screen
                this.noiseSweep(0.35, 0.5, 8000, 300);
                this.tone(180, 40, 0.4, 0.4, 'sine');
                // Glass shards: random high pings
                for (let i = 0; i < 7; i++) {
                    const f = 1800 + Math.random() * 2600;
                    this.blip(f, f * 0.8, 0.12, 0.045, 0.125, 0.02 + Math.random() * 0.18);
                }
                break;
            case 'hurt':
                this.blip(300, 70, 0.22, 0.24, 0.5);
                this.noiseSweep(0.18, 0.22, 1400, 200);
                break;
            case 'evolve':
                [0, 3, 7, 10, 12, 15, 19, 24].forEach((semi, i) => {
                    const f = noteFreq(57 + semi);
                    this.blip(f, f, 0.28, 0.1, 0.25, i * 0.06);
                });
                this.noise(0.8, 0.07, 8000, 0.2, 'highpass');
                this.tone(110, 440, 0.6, 0.1, 'triangle');
                break;
            case 'bossSpawn':
                // Detuned low drone + rising noise swell
                this.tone(110, 55, 0.9, 0.34, 'sawtooth');
                this.tone(113, 56, 0.9, 0.28, 'sawtooth', 0.03);
                this.noiseSweep(0.8, 0.2, 200, 3000);
                this.blip(220, 110, 0.7, 0.1, 0.125, 0.1);
                break;
            case 'victory':
                [0, 4, 7, 12, 7, 12, 16, 19].forEach((semi, i) => {
                    const f = noteFreq(60 + semi);
                    this.blip(f, f, 0.32, 0.13, 0.25, i * 0.14);
                });
                break;
            case 'gameOver':
                [0, -3, -5, -8, -12].forEach((semi, i) => {
                    const f = noteFreq(69 + semi);
                    this.blip(f, f * 0.98, 0.55, 0.14, 0.5, i * 0.26);
                });
                break;
            case 'uiHover':
                this.blip(1200, 1200, 0.03, 0.05, 0.125);
                break;
            case 'uiSelect':
                this.blip(880, 880, 0.05, 0.09, 0.25);
                this.blip(1320, 1320, 0.09, 0.07, 0.25, 0.05);
                break;
            case 'uiBack':
                this.blip(660, 440, 0.09, 0.08, 0.5);
                break;
        }
    }

    // =========================================================
    // Generative chiptune song
    // =========================================================

    private static readonly BAR = 16;   // 16th-note steps per bar
    private static readonly CYCLE = 64; // 4 bars

    /**
     * Set music dynamics (0 = calm intro, 1 = full assault).
     * Drives tempo, the section choice, filter brightness and lead busyness.
     */
    setMusicIntensity(value: number) {
        this.musicIntensity = Math.max(0, Math.min(1, value));
        if (!this.musicFilter || !this.ctx) return;

        // Classic filter-opening buildup. This is called every frame, so only
        // re-arm the automation when the target actually moved.
        const target = 1500 + 9000 * this.musicIntensity;
        if (Math.abs(target - this.filterTarget) < 120) return;
        this.filterTarget = target;
        this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    }

    startMusic(theme: string) {
        if (!this.ensureContext()) return;
        this.stopMusic();

        const seed = hashString(theme);
        this.musicRng = mulberry32(seed);
        const rng = this.musicRng;

        // The theme decides key, tempo, progression and hook — deterministically
        this.song = {
            root: 45 + Math.floor(rng() * 5),      // A2..D3
            bpm: 124 + Math.floor(rng() * 18),
            progression: PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)],
            motif: this.makeMotif(rng),
            leadDuty: [0.125, 0.25, 0.5][Math.floor(rng() * 3)],
            arpDuty: 0.125,
        };

        this.musicStep = 0;
        this.musicIntensity = 0;
        this.setMusicIntensity(0);
        this.nextNoteTime = this.ctx!.currentTime + 0.1;

        // Lookahead scheduler (schedules ~0.25s ahead every 40ms)
        this.musicTimer = setInterval(() => this.scheduleMusic(), 40);
    }

    stopMusic() {
        if (this.musicTimer !== null) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }

    /**
     * 8-note hook: mostly stepwise motion with one leap, so it sounds written
     * rather than rolled. -1 marks a rest.
     */
    private makeMotif(rng: () => number): number[] {
        const motif: number[] = [];
        let degree = Math.floor(rng() * 3);
        for (let i = 0; i < 8; i++) {
            if (i > 0 && rng() < 0.18) {
                motif.push(-1);
                continue;
            }
            const move = rng() < 0.75
                ? (rng() < 0.5 ? -1 : 1)          // step
                : (rng() < 0.5 ? -3 : 3);         // leap
            degree = Math.max(-2, Math.min(9, degree + move));
            motif.push(degree);
        }
        return motif;
    }

    /** Scale degree (can be negative / above an octave) → MIDI note */
    private degreeToMidi(root: number, degree: number): number {
        const octave = Math.floor(degree / MINOR_SCALE.length);
        let idx = degree % MINOR_SCALE.length;
        if (idx < 0) idx += MINOR_SCALE.length;
        return root + octave * 12 + MINOR_SCALE[idx];
    }

    /** Pick the section for the current cycle from intensity + position */
    private sectionFor(cycleIndex: number, bar: number, heat: number): Section {
        if (heat >= 0.95) return SECTIONS.finale;
        if (heat < 0.22) return SECTIONS.intro;
        // Every 4th cycle drops into a bridge to break the loop
        if (cycleIndex % 4 === 3) return SECTIONS.bridge;
        if (heat > 0.6) return SECTIONS.chorus;
        // Below chorus heat the last bar of a cycle still lifts
        return bar === 3 && heat > 0.45 ? SECTIONS.chorus : SECTIONS.verse;
    }

    private scheduleMusic() {
        const ctx = this.ctx;
        const song = this.song;
        if (!ctx || !song || ctx.state !== 'running') return;

        const heat = this.musicIntensity;
        const bpm = song.bpm * (0.86 + 0.22 * heat);
        const stepDuration = 60 / bpm / 4; // 16th notes

        while (this.nextNoteTime < ctx.currentTime + 0.25) {
            const cycleIndex = Math.floor(this.musicStep / AudioSystem.CYCLE);
            const cycleStep = this.musicStep % AudioSystem.CYCLE;
            const bar = Math.floor(cycleStep / AudioSystem.BAR);
            const step = cycleStep % AudioSystem.BAR;
            const when = this.nextNoteTime - ctx.currentTime;

            const section = this.sectionFor(cycleIndex, bar, heat);
            const chordDegree = song.progression[bar];
            const chordRoot = this.degreeToMidi(song.root, chordDegree);

            // --- TRIANGLE: bass ---
            this.scheduleBass(section, chordRoot, step, stepDuration, when);

            // --- NOISE: drums ---
            if (section.kick[step] === 'x') this.kick(when);
            if (section.snare[step] === 'x') this.snare(when, 0.1 + 0.08 * heat);
            if (section.hat[step] === 'x') this.hat(when, 0.022 + 0.03 * heat);

            // --- PULSE 2: arpeggio (chord tones at 16th speed) ---
            if (section.arp && step % 2 === 0) {
                const arpDegrees = [0, 2, 4, 7];
                const d = arpDegrees[(step / 2) % arpDegrees.length];
                const midi = this.degreeToMidi(song.root, chordDegree + d) + 12;
                this.chipTone(noteFreq(midi), stepDuration * 0.8, 0.035, song.arpDuty, when, 0);
            }

            // --- PULSE 1: lead motif (8th notes) ---
            if (step % 2 === 0) {
                const motifIndex = (bar * 8 + step / 2) % song.motif.length;
                const degree = song.motif[motifIndex];
                const density = section.lead;
                if (degree >= 0 && this.musicRng() < density) {
                    const midi = this.degreeToMidi(song.root, chordDegree + degree)
                        + 24 + section.leadShift;
                    const long = this.musicRng() < 0.25;
                    this.chipTone(
                        noteFreq(midi),
                        stepDuration * (long ? 3.4 : 1.7),
                        0.05 + 0.02 * heat,
                        song.leadDuty,
                        when,
                        long ? 22 : 0, // vibrato only on sustained notes
                    );
                    // Echo an octave up when the fight is hot
                    if (heat > 0.65 && this.musicRng() < 0.28) {
                        this.chipTone(noteFreq(midi + 12), stepDuration * 0.8, 0.022,
                            0.125, when + stepDuration, 0);
                    }
                }
            }

            // --- Fills ---
            if (cycleStep >= AudioSystem.CYCLE - 2 && heat > 0.4) {
                this.snare(when, 0.09);
                this.snare(when + stepDuration / 2, 0.11);
            }
            if (cycleStep === AudioSystem.CYCLE - 1) this.mutateMotif();

            this.nextNoteTime += stepDuration;
            this.musicStep++;
        }
    }

    private scheduleBass(section: Section, chordRoot: number, step: number, stepDuration: number, when: number) {
        const bassMidi = chordRoot - 12;
        const play = (semi: number, len: number, vol: number, offset: number) =>
            this.bassTone(noteFreq(bassMidi + semi), stepDuration * len, vol, when + stepDuration * offset);

        if (section.bass === 0) {
            if (step === 0) play(0, 7, 0.2, 0);
            if (step === 8) play(0, 6, 0.16, 0);
        } else if (section.bass === 1) {
            if (step === 0) play(0, 3.5, 0.2, 0);
            if (step === 6) play(7, 1.5, 0.14, 0);
            if (step === 8) play(0, 3.5, 0.18, 0);
            if (step === 14) play(12, 1.5, 0.13, 0);
        } else {
            // Driving eighths with an octave bounce
            if (step % 2 === 0) {
                const semi = step % 8 === 6 ? 12 : step % 4 === 2 ? 7 : 0;
                play(semi, 1.6, step % 4 === 0 ? 0.2 : 0.15, 0);
            }
        }
    }

    // ---------------------------------------------------------
    // Music voices
    // ---------------------------------------------------------

    /** Pulse-wave voice with optional vibrato (lead / arp channels) */
    private chipTone(freq: number, duration: number, volume: number, duty: number, when: number, vibratoCents: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(this.pulseWave(duty));
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        // Chip envelopes are near-instant attack with a short decay to sustain
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.008);
        gain.gain.linearRampToValueAtTime(volume * 0.72, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        osc.connect(gain);
        gain.connect(this.musicBus!);
        osc.start(t);
        osc.stop(t + duration + 0.03);

        if (vibratoCents > 0) {
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 6.5;
            const lfoGain = ctx.createGain();
            lfoGain.gain.setValueAtTime(0, t);
            lfoGain.gain.linearRampToValueAtTime(vibratoCents, t + duration * 0.4);
            lfo.connect(lfoGain);
            lfoGain.connect(osc.detune);
            lfo.start(t);
            lfo.stop(t + duration + 0.03);
        }
    }

    /** Triangle bass — the NES triangle channel had no volume control, so keep it flat */
    private bassTone(freq: number, duration: number, volume: number, when: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.01);
        gain.gain.setValueAtTime(volume, t + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain);
        gain.connect(this.musicBus!);
        osc.start(t);
        osc.stop(t + duration + 0.03);
    }

    /** Punchy kick: fast sine pitch drop + click transient */
    private kick(when: number) {
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(165, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
        gain.gain.setValueAtTime(0.34, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + 0.15);
        this.musicNoise(when, 0.015, 0.06, 'highpass', 4000);
    }

    /** Snare: bandpassed noise burst + body tone */
    private snare(when: number, volume: number) {
        this.musicNoise(when, 0.13, volume, 'bandpass', 1900);
        const ctx = this.ctx!;
        const t = ctx.currentTime + Math.max(0, when);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        gain.gain.setValueAtTime(volume * 0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(gain);
        gain.connect(this.musicGain!);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    /** Hi-hat: short highpassed noise tick */
    private hat(when: number, volume: number) {
        this.musicNoise(when, 0.035, volume, 'highpass', 8000);
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

    /** Nudge one motif note each cycle so the hook evolves over a long run */
    private mutateMotif() {
        const song = this.song;
        if (!song || this.musicRng() < 0.5) return;
        const idx = Math.floor(this.musicRng() * song.motif.length);
        if (this.musicRng() < 0.2) {
            song.motif[idx] = -1;
        } else {
            const base = song.motif[idx] < 0 ? 0 : song.motif[idx];
            song.motif[idx] = Math.max(-2, Math.min(9, base + (this.musicRng() < 0.5 ? -1 : 1)));
        }
    }
}

export const audio = new AudioSystem();
