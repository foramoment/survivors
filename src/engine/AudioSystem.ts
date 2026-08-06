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
 * a key, tempo, an eight-bar chord progression and a pair of 8-note motifs
 * (a hook and its answer). Bars are assembled from hand-authored drum/bass
 * patterns picked by the current section, and sections follow a written form
 * (see FORM) that gameplay intensity overrides only at the extremes.
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

/**
 * Modes, because a mode is the cheapest way to give a place its own feeling.
 *
 * Aeolian is the default minor everyone hears as "heroic sad". Dorian raises
 * the sixth, which takes the sorrow out and leaves something wary and
 * mechanical. Phrygian flattens the second, and that one semitone is the whole
 * difference between "sad" and "wrong" — it is the sound of somewhere you
 * should not be.
 */
export const MODES: Record<string, number[]> = {
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
};

/**
 * The musical character of one place. The GAME registers these by theme name
 * (see registerMusicProfile) — the engine has no idea what an Asteroid Field is.
 *
 * Every field is a *range* or a *pool* rather than a value, because a stage
 * gets three tracks, not one, and they have to sound like siblings: same mode,
 * same tempo band, same room, different tune.
 */
export interface MusicProfile {
    mode: keyof typeof MODES | string;
    /** Tempo band, inclusive */
    bpm: [number, number];
    /** Root MIDI note the variants are transposed around */
    root: number;
    /** Which PROGRESSIONS indices suit this place */
    progressions: number[];
    /** Lead pulse duties this place is allowed to use */
    leadDuties: number[];
    /** Echo: wet level 0..1 and time in seconds */
    delay: [number, number];
    /** Waveshaper drive — grit */
    drive: number;
    /** Lowpass ceiling in Hz: how bright this place is allowed to get */
    brightness: number;
}

const DEFAULT_PROFILE: MusicProfile = {
    mode: 'aeolian',
    bpm: [124, 142],
    root: 45,
    progressions: [0, 1, 2, 3],
    leadDuties: [0.125, 0.25, 0.5],
    delay: [0.3, 0.21],
    drive: 6,
    brightness: 6000,
};

/** How many distinct tracks each theme gets */
export const TRACKS_PER_THEME = 3;

const LAST_TRACK_KEY = 'survivors.lastTrack';

/**
 * Chord degrees (scale steps), eight bars per cycle.
 *
 * These used to be four bars, so the harmony came back around every ~7
 * seconds and the track wore out fast in a ten-minute run. Eight bars in an
 * A-A'-B-B' shape doubles the loop and, more importantly, gives the second
 * half somewhere to *go*: the fourth bar of each half is a half cadence
 * (question), the eighth resolves (answer).
 */
export const PROGRESSIONS: number[][] = [
    [0, 5, 3, 4, 0, 5, 3, 0], // i  VI IV V  | i  VI IV i   — heroic
    [0, 3, 4, 4, 5, 3, 4, 0], // i  IV V  V  | VI IV V  i   — driving
    [0, 6, 5, 4, 0, 6, 3, 4], // i  VII VI V | i  VII IV V  — descending, epic
    [0, 2, 5, 4, 2, 5, 6, 0], // i  III VI V | III VI VII i — wistful
];

/** One 16-step bar of drums/bass behaviour */
export interface Section {
    kick: string;
    snare: string;
    hat: string;
    /** Open hi-hat accents — longer, brighter than the closed hat */
    openHat?: string;
    /** 0 = roots only, 1 = root+fifth, 2 = driving eighths, 3 = walking */
    bass: number;
    /** Lead note density multiplier */
    lead: number;
    /** Fast arpeggio on the second pulse channel */
    arp: boolean;
    /**
     * Sparse chord-tone answers on the second pulse channel, in the gaps the
     * lead leaves. Sections either arpeggiate or answer, never both — two busy
     * voices on one channel just turns to mud.
     */
    answer?: boolean;
    /** Base octave offset for the lead, in semitones */
    leadShift: number;
}

export const SECTIONS: Record<string, Section> = {
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
        openHat: '--------------x-',
        bass: 1, lead: 0.7, arp: false, answer: true, leadShift: 0,
    },
    // Second half of a verse: same groove, syncopated kick and a busier answer
    verseB: {
        kick: 'x-----x---x-x---',
        snare: '----x-------x---',
        hat: '--x-x-x-x-x-x-xx',
        openHat: '------x-------x-',
        bass: 1, lead: 0.8, arp: false, answer: true, leadShift: 0,
    },
    chorus: {
        kick: 'x---x---x---x---',
        snare: '----x-------x---',
        hat: '-x-x-x-x-x-x-xxx',
        openHat: '------------x---',
        bass: 2, lead: 1, arp: true, leadShift: 12,
    },
    bridge: {
        kick: 'x-------x---x---',
        snare: '----x-------x-x-',
        hat: '--x---x---x---x-',
        bass: 3, lead: 0.8, arp: true, leadShift: 0,
    },
    // Everything drops out but the pulse — the room to breathe that makes the
    // next chorus land
    breakdown: {
        kick: 'x-------x-------',
        snare: '--------------x-',
        hat: '----x-------x---',
        bass: 0, lead: 0.55, arp: false, answer: true, leadShift: 12,
    },
    finale: {
        kick: 'x-x-x-x-x-x-x-x-',
        snare: '----x---x---x-x-',
        hat: 'xxxxxxxxxxxxxxxx',
        openHat: '--------------x-',
        bass: 2, lead: 1.15, arp: true, leadShift: 12,
    },
};

/**
 * The arrangement, as a list of section names one per cycle. Heat still
 * overrides it at the extremes (a calm player gets the intro, a boss fight gets
 * the finale), but in between the track follows a written form instead of
 * flipping between two sections on a threshold — that flipping is what made it
 * feel like it was looping even when it wasn't.
 */
export const FORM: string[] = [
    'verse', 'verseB', 'chorus', 'verse',
    'verseB', 'chorus', 'bridge', 'chorus',
    'breakdown', 'chorus', 'verseB', 'bridge',
];

/** Everything a stage theme needs to sound like its own track */
interface Song {
    /** Root note (MIDI) of the key */
    root: number;
    bpm: number;
    progression: number[];
    /** 8 scale-degree offsets (or -1 for a rest) — the hook, first half */
    motif: number[];
    /** Answering phrase for the second half */
    motifB: number[];
    /** Duty cycle of the lead pulse: 0.125 / 0.25 / 0.5 */
    leadDuty: number;
    arpDuty: number;
    /** Semitone offsets of this track's mode */
    scale: number[];
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
    /** Set by pauseMusic so resumeMusic knows there is a song to pick back up */
    private musicPaused: boolean = false;
    private nextNoteTime: number = 0;
    private musicStep: number = 0;
    private musicRng: () => number = mulberry32(1);
    private song: Song | null = null;
    /** Theme name -> how that place sounds. Filled by the game, never here. */
    private musicProfiles: Map<string, MusicProfile> = new Map();
    /** Live handles on the music bus, so a stage can change the room */
    private musicDelay: DelayNode | null = null;
    private musicDelayMix: GainNode | null = null;
    private musicDrive: WaveShaperNode | null = null;
    /** Lowpass ceiling for the current place — see MusicProfile.brightness */
    private musicBrightness: number = 6000;
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
        this.musicDrive = drive;

        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.21;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.32;
        const delayMix = ctx.createGain();
        delayMix.gain.value = 0.3;
        this.musicDelay = delay;
        this.musicDelayMix = delayMix;
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

    private static readonly BAR = 16;    // 16th-note steps per bar
    private static readonly BARS = 8;    // bars per cycle (was 4 — see PROGRESSIONS)
    private static readonly CYCLE = AudioSystem.BAR * AudioSystem.BARS;

    /**
     * Set music dynamics (0 = calm intro, 1 = full assault).
     * Drives tempo, the section choice, filter brightness and lead busyness.
     */
    setMusicIntensity(value: number) {
        this.musicIntensity = Math.max(0, Math.min(1, value));
        if (!this.musicFilter || !this.ctx) return;

        // Classic filter-opening buildup. This is called every frame, so only
        // re-arm the automation when the target actually moved.
        // The ceiling is the stage's, not a constant: a place that is supposed
        // to sound muffled must stay muffled even at full intensity
        const target = 1500 + (this.musicBrightness - 1500) * this.musicIntensity;
        if (Math.abs(target - this.filterTarget) < 120) return;
        this.filterTarget = target;
        this.musicFilter.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    }

    /**
     * Re-tune the shared music chain for a place.
     *
     * The room is as much of the identity as the notes are — the same tune
     * through a long echo and through a short gritty slapback is two different
     * places. Applied when a track starts, so the chain itself is still built
     * once and shared by every voice.
     */
    private applyRoom(profile: MusicProfile) {
        this.musicBrightness = profile.brightness;
        this.filterTarget = -1; // force the next intensity update to re-arm

        const [wet, time] = profile.delay;
        if (this.musicDelayMix) this.musicDelayMix.gain.value = wet;
        if (this.musicDelay) this.musicDelay.delayTime.value = time;
        if (this.musicDrive) this.musicDrive.curve = AudioSystem.makeDriveCurve(profile.drive);
    }

    /**
     * Teach the engine what a place sounds like.
     *
     * Keyed by the same theme string `startMusic` takes. The engine ships no
     * profiles at all — "Derelict Station sounds industrial" is a fact about
     * the game, and src/engine is not allowed to know any of those.
     */
    registerMusicProfile(theme: string, profile: MusicProfile) {
        this.musicProfiles.set(theme, profile);
    }

    /**
     * Which of this theme's tracks to play, avoiding the one that played last.
     *
     * Pure random repeats about a third of the time, and a repeat is exactly
     * the case the player notices — "it's the same music again" is the whole
     * complaint this feature answers. Excluding the previous pick costs one
     * localStorage read and makes back-to-back repeats impossible.
     */
    private pickTrack(theme: string): number {
        let last = -1;
        try {
            last = Number(localStorage.getItem(`${LAST_TRACK_KEY}.${theme}`) ?? -1);
        } catch {
            // Storage unavailable — fall back to plain random
        }

        const choices: number[] = [];
        for (let i = 0; i < TRACKS_PER_THEME; i++) if (i !== last) choices.push(i);
        const picked = choices[Math.floor(Math.random() * choices.length)];

        try {
            localStorage.setItem(`${LAST_TRACK_KEY}.${theme}`, String(picked));
        } catch {
            // Nothing to do; the next run just gets another free choice
        }
        return picked;
    }

    startMusic(theme: string) {
        if (!this.ensureContext()) return;
        this.stopMusic();

        const profile = this.musicProfiles.get(theme) ?? DEFAULT_PROFILE;
        const track = this.pickTrack(theme);

        // Seeded by theme AND track, so a stage's three tunes are different
        // pieces — but they all draw from the same profile, so they are
        // siblings rather than strangers
        this.musicRng = mulberry32(hashString(`${theme}#${track}`));
        const rng = this.musicRng;

        const [bpmLow, bpmHigh] = profile.bpm;
        const scale = MODES[profile.mode] ?? MODES.aeolian;
        // Related keys, not arbitrary ones: the tonic, its minor third and its
        // fifth. Three tracks in wildly different keys stop being one place.
        const transpose = [0, 3, 7][track % 3];
        const motif = this.makeMotif(rng);

        this.song = {
            root: profile.root + transpose,
            bpm: bpmLow + Math.floor(rng() * (bpmHigh - bpmLow + 1)),
            progression: PROGRESSIONS[
                profile.progressions[Math.floor(rng() * profile.progressions.length)]
            ],
            motif,
            motifB: this.makeAnswer(motif, rng),
            leadDuty: profile.leadDuties[Math.floor(rng() * profile.leadDuties.length)],
            arpDuty: 0.125,
            scale,
        };

        this.applyRoom(profile);

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
        this.musicPaused = false;
    }

    /**
     * Suspend the tracker without losing the song (game pause).
     * Notes already scheduled a fraction of a second ahead still play out —
     * cancelling them would click.
     */
    pauseMusic() {
        if (this.musicTimer === null) return;
        clearInterval(this.musicTimer);
        this.musicTimer = null;
        this.musicPaused = true;
    }

    /** Pick the song back up where it stopped */
    resumeMusic() {
        if (!this.musicPaused || !this.song || !this.ctx) return;
        this.musicPaused = false;
        // Re-anchor the scheduler to *now*, otherwise it dumps every note it
        // "missed" while the game was paused in one burst.
        this.nextNoteTime = this.ctx.currentTime + 0.1;
        this.musicTimer = setInterval(() => this.scheduleMusic(), 40);
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

    /**
     * The answering phrase: the same hook a third higher with a new tail.
     *
     * Generating a second independent motif would just sound like two unrelated
     * tunes taking turns. Reusing the shape and changing where it lands is what
     * makes a call and a response — the listener recognises it and still hears
     * something new.
     */
    private makeAnswer(motif: number[], rng: () => number): number[] {
        const lift = rng() < 0.5 ? 2 : 3;
        const answer = motif.map(d => (d < 0 ? -1 : Math.min(9, d + lift)));

        // Rewrite the last two notes so the phrase closes instead of repeating
        const tail = answer.length - 2;
        answer[tail] = Math.max(0, answer[tail] - 1);
        answer[tail + 1] = rng() < 0.6 ? 0 : 4;
        return answer;
    }

    /** Scale degree (can be negative / above an octave) → MIDI note */
    private degreeToMidi(root: number, degree: number): number {
        const scale = this.song?.scale ?? MODES.aeolian;
        const octave = Math.floor(degree / scale.length);
        let idx = degree % scale.length;
        if (idx < 0) idx += scale.length;
        return root + octave * 12 + scale[idx];
    }

    /**
     * Pick the section for the current cycle.
     *
     * Heat owns the extremes — a calm player gets the intro, a boss fight gets
     * the finale — and in between the track walks the written FORM. Within a
     * cycle the two halves can differ, so an eight-bar cycle is not just the
     * same four bars twice: the second half lifts when the fight is hot.
     *
     * ## The thresholds are calibrated to the heat the GAME actually sends
     *
     * They were originally spread across 0..1 as if intensity used the whole
     * range. It does not. The caller feeds
     * `0.15 + 0.55 * min(1, t / 480) + 0.3 * adaptHeat`, so a run opens at
     * about **0.20** and only reaches 0.85 near minute eight. Measured against
     * the old numbers, that meant:
     *
     *   - `< 0.45` held every chorus back to verseB for the first **3:38**
     *   - `> 0.66` never lifted anything before **6:41**
     *   - `>= 0.95` was unreachable outside a boss, so the finale never fired
     *
     * A player therefore spent the first third of a run in the quiet half of
     * the arrangement, which is the whole of "the tracks lost their drive" —
     * the writing was fine, the gates were set for a signal that never arrives.
     *
     * If the heat formula in GameManager changes, these move with it.
     */
    private sectionFor(cycleIndex: number, bar: number, heat: number): Section {
        // Reachable now: a hot minute eight sits near 0.85, and a boss pins 1
        if (heat >= 0.84) return SECTIONS.finale;
        // ~17 seconds of opener at the start of a run, then it is done
        if (heat < 0.22) return SECTIONS.intro;

        const planned = SECTIONS[FORM[cycleIndex % FORM.length]] ?? SECTIONS.verse;

        // Hot fight: the back half of any non-chorus cycle steps up. Crosses
        // around minute four instead of minute seven.
        if (heat > 0.5 && bar >= 4 && planned !== SECTIONS.chorus) {
            return planned === SECTIONS.bridge ? SECTIONS.chorus : SECTIONS.verseB;
        }
        // Quiet stretch: hold a chorus back so it still means something later.
        // Only the opening minute now, not the opening third of the run.
        if (heat < 0.30 && planned === SECTIONS.chorus) return SECTIONS.verseB;

        return planned;
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
            const chordDegree = song.progression[bar % song.progression.length];
            const chordRoot = this.degreeToMidi(song.root, chordDegree);
            const isFillBar = bar === AudioSystem.BARS - 1 && cycleIndex % 4 === 3;

            // --- TRIANGLE: bass ---
            this.scheduleBass(section, chordRoot, step, stepDuration, when);

            // --- NOISE: drums ---
            // The last bar of every fourth cycle is a fill instead of the
            // pattern — the signpost that says "here comes the next section"
            const filling = isFillBar && heat > 0.35;
            if (filling) {
                this.scheduleFill(step, stepDuration, when, heat);
            } else {
                if (section.kick[step] === 'x') this.kick(when);
                if (section.snare[step] === 'x') this.snare(when, 0.1 + 0.08 * heat);
                if (section.hat[step] === 'x') this.hat(when, 0.022 + 0.03 * heat);
            }
            if (section.openHat?.[step] === 'x') this.openHat(when, 0.02 + 0.025 * heat);

            // --- PULSE 2: arpeggio (chord tones at 16th speed) ---
            if (section.arp && step % 2 === 0) {
                const arpDegrees = [0, 2, 4, 7];
                const d = arpDegrees[(step / 2) % arpDegrees.length];
                const midi = this.degreeToMidi(song.root, chordDegree + d) + 12;
                this.chipTone(noteFreq(midi), stepDuration * 0.8, 0.035, song.arpDuty, when, 0);
            }

            // --- PULSE 2: countermelody in the lead's gaps ---
            // Sections without an arpeggio used to leave this channel silent,
            // which is most of the quiet half of the track. A held chord tone
            // answering off the beat fills it without competing with the hook.
            if (section.answer && step === 12) {
                const d = [4, 2, 7, 0][bar % 4];
                const midi = this.degreeToMidi(song.root, chordDegree + d) + 12;
                this.chipTone(noteFreq(midi), stepDuration * 3, 0.03, 0.25, when, 12);
            }

            // --- PULSE 1: lead motif (8th notes) ---
            if (step % 2 === 0) {
                // First half of the cycle asks with the hook, second half
                // answers with its variation
                const phrase = bar < AudioSystem.BARS / 2 ? song.motif : song.motifB;
                const motifIndex = (bar * 8 + step / 2) % phrase.length;
                const degree = phrase[motifIndex];
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

            // --- Turnaround ---
            // A two-hit pickup into the next cycle. Skipped on fill bars, which
            // already have a whole bar of roll of their own.
            if (!filling && cycleStep >= AudioSystem.CYCLE - 2 && heat > 0.4) {
                this.snare(when, 0.09);
                this.snare(when + stepDuration / 2, 0.11);
            }
            if (cycleStep === AudioSystem.CYCLE - 1) this.mutateMotif();

            this.nextNoteTime += stepDuration;
            this.musicStep++;
        }
    }

    /**
     * One-bar drum fill: a snare roll that accelerates into the downbeat.
     * Written as a ramp rather than a fixed pattern so it works at any tempo.
     */
    private scheduleFill(step: number, stepDuration: number, when: number, heat: number) {
        if (step % 4 === 0) this.kick(when);

        // Doubles up over the second half of the bar
        const dense = step >= 8;
        if (dense || step % 2 === 0) {
            this.snare(when, 0.06 + 0.07 * (step / 16) + 0.03 * heat);
        }
        if (dense && step % 2 === 1) {
            this.snare(when + stepDuration / 2, 0.05 + 0.05 * (step / 16));
        }
        if (step === 15) this.openHat(when, 0.05);
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
        } else if (section.bass === 2) {
            // Driving eighths with an octave bounce
            if (step % 2 === 0) {
                const semi = step % 8 === 6 ? 12 : step % 4 === 2 ? 7 : 0;
                play(semi, 1.6, step % 4 === 0 ? 0.2 : 0.15, 0);
            }
        } else {
            // Walking line for the bridge: quarter notes climbing the chord and
            // stepping back down, so the low end moves while the drums thin out
            const walk = [0, 3, 7, 10, 12, 10, 7, 3];
            if (step % 2 === 0) {
                play(walk[(step / 2) % walk.length], 1.7, step % 8 === 0 ? 0.2 : 0.14, 0);
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

    /** Open hi-hat: same voice, long enough to ring into the next beat */
    private openHat(when: number, volume: number) {
        this.musicNoise(when, 0.22, volume, 'highpass', 6800);
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

    /**
     * Nudge one note of one phrase each cycle so the hook drifts over a long
     * run. Only one phrase per cycle, and only half the time — mutate both and
     * the tune loses its shape after a few minutes instead of aging into a
     * variation of itself.
     */
    private mutateMotif() {
        const song = this.song;
        if (!song || this.musicRng() < 0.5) return;

        const phrase = this.musicRng() < 0.5 ? song.motif : song.motifB;
        const idx = Math.floor(this.musicRng() * phrase.length);
        if (this.musicRng() < 0.2) {
            phrase[idx] = -1;
        } else {
            const base = phrase[idx] < 0 ? 0 : phrase[idx];
            phrase[idx] = Math.max(-2, Math.min(9, base + (this.musicRng() < 0.5 ? -1 : 1)));
        }
    }
}

export const audio = new AudioSystem();
