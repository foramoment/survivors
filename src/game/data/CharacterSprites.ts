/**
 * CHARACTER SPRITES — one hand-built pixel template per playable character.
 *
 * Every class used to share a single astronaut template tinted by
 * `hashString(className)`, so "choosing a character" changed a hue and nothing
 * else. The roster is small enough now (six) that each one can have its own
 * silhouette, which is the part you actually read at gameplay zoom — helmet
 * shape, shoulder width, what is sticking off the back.
 *
 * Templates are 12 wide × 16 tall: 13 rows of body plus 3 rows of legs, with
 * two leg frames for the walk cycle. Glyphs:
 *
 *   .  empty        s  suit (mid)     S  suit (light)   d  suit (dark)
 *   h  hard shell   v  visor / glow   a  class accent   b  boots
 *
 * Kept as strings on purpose: this is the only readable way to edit pixel art
 * in a text file, and it costs nothing at runtime — SpriteFactory bakes each
 * frame into a canvas once and caches it.
 */

export interface CharacterPalette {
    dark: string;
    mid: string;
    light: string;
    shell: string;
    visor: string;
    accent: string;
    boots: string;
}

export interface CharacterSprite {
    /** 13 rows of body, 12 characters wide */
    body: string[];
    /** 3 rows each; frame 0 and frame 1 of the walk cycle */
    legs: [string[], string[]];
    palette: CharacterPalette;
}

/** Default stride — most characters share it; heavies override it */
const LEGS_LIGHT: [string[], string[]] = [
    [
        '..dss..ssd..',
        '..ds....sd..',
        '..bb....bb..',
    ],
    [
        '...dssssd...',
        '...ds..sd...',
        '...bb..bb...',
    ],
];

/** Wider, heavier stance for armoured characters */
const LEGS_HEAVY: [string[], string[]] = [
    [
        '.dSss..ssSd.',
        '.dss....ssd.',
        '.bbb....bbb.',
    ],
    [
        '..dsssssssd.',
        '..dss..ssd..',
        '..bbb..bbb..',
    ],
];

export const CHARACTER_SPRITES: Record<string, CharacterSprite> = {
    // Near-black silhouette with a broken halo above the head and a collapsing
    // core in the chest. Deliberately the darkest figure on the roster: the
    // Void Walker is saturated violet, this one is the absence of colour with a
    // pale event-horizon rim.
    null_warden: {
        body: [
            '..a......a..',
            '...hhhhhh...',
            '..hsvvvvsh..',
            '..hsvvvvsh..',
            '...dssssd...',
            'a.dsSaaSsd.a',
            '.adsSaaSsda.',
            '..dsSaaSsd..',
            '..dssaassd..',
            '..ds.aa.sd..',
            '...dssssd...',
            '...dssssd...',
            '....dssd....',
        ],
        legs: LEGS_HEAVY,
        palette: {
            dark: '#0a0814', mid: '#1c1930', light: '#38335a',
            shell: '#7d76a8', visor: '#9dfcff', accent: '#e8e0ff', boots: '#050409',
        },
    },

    // Slim, hooded, trailing void wisps off both shoulders
    void_walker: {
        body: [
            '....dddd....',
            '...dssssd...',
            '..dsvvvvsd..',
            '..dsvvvvsd..',
            '...dssssd...',
            '..a.ssss.a..',
            '.aadssssdaa.',
            '.adsSssSsda.',
            '..dsSssSsd..',
            '..ds.ss.sd..',
            '...dssssd...',
            '...dssssd...',
            '....dssd....',
        ],
        legs: LEGS_LIGHT,
        palette: {
            dark: '#241344', mid: '#3d2470', light: '#6c46b8',
            shell: '#b9a6ff', visor: '#8affff', accent: '#c07bff', boots: '#160c29',
        },
    },

    // Horned helmet, pauldrons, blade slung across the back
    cyber_samurai: {
        body: [
            '..a......a..',
            '..aa....aa..',
            '...hhhhhh...',
            '..hhvvvvhh..',
            '..hhvvvvhh..',
            '...hhhhhh...',
            '.SS.ssss.SS.',
            '.SSsssssSS.a',
            '..ssssssss.a',
            '..dssssssd.a',
            '...ssssss.a.',
            '...dssssd...',
            '...dssssd...',
        ],
        legs: LEGS_LIGHT,
        palette: {
            dark: '#2b0f1c', mid: '#8c1c34', light: '#d2384f',
            shell: '#dfe6f2', visor: '#ff4f6d', accent: '#7ff6ff', boots: '#1a0a12',
        },
    },

    // Power armour: no neck, huge pauldrons, chest lamp
    exo_marine: {
        body: [
            '...hhhhhh...',
            '..hhhhhhhh..',
            '..hvvvvvvh..',
            '...hhhhhh...',
            '.SSSssssSSS.',
            'SSSSssssSSSS',
            'SSSsssssssSS',
            '.dsssaasssd.',
            '.dssssssssd.',
            '..ssssssss..',
            '..dssssssd..',
            '...dssssd...',
            '...dssssd...',
        ],
        legs: LEGS_HEAVY,
        palette: {
            dark: '#1d2a17', mid: '#3f5c2e', light: '#6d8f4a',
            shell: '#c2cbb4', visor: '#ffb545', accent: '#ffe27a', boots: '#121a0e',
        },
    },

    // Bubble helmet with a face inside, tank and hose on the left
    astro_biologist: {
        body: [
            '....vvvv....',
            '...vvvvvv...',
            '..vvhhhhvv..',
            '..vvhhhhvv..',
            '...vvvvvv...',
            '..a.ssss....',
            '..adssssd...',
            '.aadsSSsd...',
            '.aadssssd...',
            '.aa.ssss....',
            '....ssss....',
            '...dssssd...',
            '...dssssd...',
        ],
        legs: LEGS_LIGHT,
        palette: {
            dark: '#123326', mid: '#1f6b47', light: '#3fae74',
            shell: '#ffd9a8', visor: '#a8ffe0', accent: '#b6ff4d', boots: '#0a1d15',
        },
    },

    // Hood, no visor — two burning eyes — and a conductor rod on the right
    storm_mage: {
        body: [
            '....dddd....',
            '...dddddd...',
            '..dda..add..',
            '..ddaaaadd..',
            '...dddddd...',
            '....ssss...a',
            '...sssssss.a',
            '..dsssssssda',
            '..dsssssss.a',
            '...ssssss..a',
            '...ssssss...',
            '...dssssd...',
            '...dssssd...',
        ],
        legs: LEGS_LIGHT,
        palette: {
            dark: '#151a3d', mid: '#26306b', light: '#4356b5',
            shell: '#cfe0ff', visor: '#ffe14d', accent: '#7ee8ff', boots: '#0c0f24',
        },
    },

    // No helmet at all: burning crest, bare arms, heavy stance
    berserker: {
        body: [
            '.....aa.....',
            '....aaaa....',
            '...ahhhha...',
            '...hvvvvh...',
            '...hhhhhh...',
            '..S.ssss.S..',
            '.SSdssssdSS.',
            '.SSdssssdSS.',
            '.S.dssssd.S.',
            '...ssssss...',
            '...ssssss...',
            '...dssssd...',
            '...dssssd...',
        ],
        legs: LEGS_HEAVY,
        palette: {
            dark: '#3a1206', mid: '#8f3210', light: '#d8611f',
            shell: '#f0b98a', visor: '#fff0a8', accent: '#ffb02e', boots: '#200a04',
        },
    },
};

/** Shown when a class has no template (dev mode, stale save data) */
export const FALLBACK_SPRITE_ID = 'void_walker';
