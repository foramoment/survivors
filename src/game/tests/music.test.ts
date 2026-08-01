import { describe, it, expect } from 'vitest';
import { PROGRESSIONS, SECTIONS, FORM } from '../core/AudioSystem';

/**
 * The tracker reads drum patterns by index, so a 15- or 17-character string
 * silently shifts the groove instead of failing — exactly the kind of typo
 * that is invisible in review and obvious to the ear an hour later.
 */
describe('music patterns', () => {
    it('every drum lane is exactly one bar', () => {
        for (const [name, section] of Object.entries(SECTIONS)) {
            expect(section.kick.length, `${name}.kick`).toBe(16);
            expect(section.snare.length, `${name}.snare`).toBe(16);
            expect(section.hat.length, `${name}.hat`).toBe(16);
            if (section.openHat) expect(section.openHat.length, `${name}.openHat`).toBe(16);
        }
    });

    it('drum lanes only use x and -', () => {
        for (const [name, section] of Object.entries(SECTIONS)) {
            for (const lane of [section.kick, section.snare, section.hat, section.openHat ?? '']) {
                expect(/^[x-]*$/.test(lane), `${name}: "${lane}"`).toBe(true);
            }
        }
    });

    it('a section either arpeggiates or answers, never both', () => {
        for (const [name, section] of Object.entries(SECTIONS)) {
            expect(section.arp && section.answer, `${name}`).toBeFalsy();
        }
    });

    it('every progression is eight bars', () => {
        // Four bars looped every ~7 seconds and wore out inside a single run
        for (const progression of PROGRESSIONS) {
            expect(progression.length).toBe(8);
        }
    });

    it('progressions start on the tonic and stay in the scale', () => {
        for (const progression of PROGRESSIONS) {
            expect(progression[0]).toBe(0);
            for (const degree of progression) {
                expect(degree).toBeGreaterThanOrEqual(0);
                expect(degree).toBeLessThan(7);
            }
        }
    });

    it('the written form only names sections that exist', () => {
        for (const name of FORM) {
            expect(SECTIONS[name], name).toBeDefined();
        }
    });

    it('the form is long enough to not feel like a loop', () => {
        // 12 cycles x 8 bars at ~130 BPM is over four minutes before it repeats
        expect(FORM.length).toBeGreaterThanOrEqual(8);
    });

    it('the form uses more than one section', () => {
        expect(new Set(FORM).size).toBeGreaterThan(3);
    });
});
