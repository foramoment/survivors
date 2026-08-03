/**
 * Custom-property scope check for src/styles.
 *
 * Written because of a real bug, not a hypothetical one: `--build-slot` was
 * declared on `.build-panel` and *used* by the end-of-run build row, which
 * reuses the same `.build-slot` class outside that scope. The variable resolved
 * to nothing, the tiles collapsed to zero width, and their stack badges kept
 * their own font size — a row of numbers floating over invisible squares. The
 * build was green, the tests were green, and it took a screenshot to notice.
 *
 * The check is deliberately a heuristic, not a CSS engine. A variable declared
 * on `:root` is global and always fine. Anything else is scoped, so using it in
 * a file that never declares it is at best fragile and usually a bug.
 *
 * Run: npm run lint:css-vars
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/styles';

/** Strip comments so a commented-out example never counts as a declaration */
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Declarations, as `name -> Set(selector)`, tracking the enclosing block */
function declarations(css) {
    const found = new Map();
    // Selector immediately preceding an opening brace, then the block body
    const blocks = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = blocks.exec(css)) !== null) {
        const selector = m[1].trim().split('\n').pop().trim();
        for (const d of m[2].matchAll(/(--[\w-]+)\s*:/g)) {
            if (!found.has(d[1])) found.set(d[1], new Set());
            found.get(d[1]).add(selector);
        }
    }
    return found;
}

const files = readdirSync(DIR).filter(f => f.endsWith('.css'));
const declaredIn = new Map();   // name -> Set(file)
const globals = new Set();      // declared on :root, so always available
const usedIn = new Map();       // name -> Set(file)

for (const file of files) {
    const css = strip(readFileSync(join(DIR, file), 'utf8'));

    for (const [name, selectors] of declarations(css)) {
        if (!declaredIn.has(name)) declaredIn.set(name, new Set());
        declaredIn.get(name).add(file);
        if ([...selectors].some(s => s.includes(':root') || s === 'html')) globals.add(name);
    }

    // A `var(--x, fallback)` still renders, but if `--x` is never declared the
    // fallback is all there has ever been — a dead reference worth deleting.
    for (const u of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!usedIn.has(u[1])) usedIn.set(u[1], new Set());
        usedIn.get(u[1]).add(file);
    }
}

const problems = [];
for (const [name, users] of usedIn) {
    if (globals.has(name)) continue;
    const owners = declaredIn.get(name);
    if (!owners) {
        problems.push(`${name} is used in ${[...users].join(', ')} but never declared`);
        continue;
    }
    const strangers = [...users].filter(f => !owners.has(f));
    if (strangers.length > 0) {
        problems.push(
            `${name} is scoped (declared in ${[...owners].join(', ')}) ` +
            `but used in ${strangers.join(', ')} — it will resolve to nothing there`
        );
    }
}

if (problems.length === 0) {
    const scoped = [...declaredIn.keys()].filter(n => !globals.has(n)).length;
    console.log(`css vars ok — ${globals.size} global, ${scoped} scoped, across ${files.length} files`);
    process.exit(0);
}

console.error('Custom properties used outside the scope that declares them:\n');
for (const p of problems) console.error(`  ${p}`);
console.error('\nDeclare it on :root if it is meant to be shared.');
process.exit(1);
