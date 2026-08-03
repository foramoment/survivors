/**
 * The engine may not know about the game.
 *
 * `src/engine/` is the reusable half — spatial hash, particles, juice, audio,
 * pixel font, input, screen kit. `src/game/` is Survivors: weapons, waves,
 * perks, stages. The whole value of the split is that the first can be dropped
 * into a different game, and that stops being true the moment one file in
 * `engine/` imports one file from `game/`.
 *
 * A boundary that lives in someone's head is a boundary that erodes. This makes
 * it a build failure instead, the same way check-css-vars.mjs does for custom
 * properties — and that one exists because a real bug shipped past code review.
 *
 * The check also tells you what is *not* engine: if something you moved needs
 * `game/`, it did not belong on this side of the line. Invert the dependency
 * (let the game register into the engine) or move it back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ENGINE_DIR = join('src', 'engine');
const GAME_DIR = join('src', 'game');

/** Every .ts file under a directory, recursively */
function collect(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...collect(full));
        else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const violations = [];

for (const file of collect(ENGINE_DIR)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
        const spec = match[1];
        if (!spec.startsWith('.')) continue;

        // Resolve against the importing file's directory
        const dir = file.slice(0, file.lastIndexOf(sep));
        const resolved = relative(process.cwd(), join(dir, spec));

        if (resolved.startsWith(GAME_DIR)) {
            const line = source.slice(0, match.index).split('\n').length;
            violations.push(`${file}:${line}  imports  ${spec}`);
        }
    }
}

if (violations.length > 0) {
    console.error('\nEngine boundary violated — src/engine may not import from src/game:\n');
    for (const v of violations) console.error('  ' + v);
    console.error(
        '\nEither invert the dependency (have the game register into the engine),' +
        '\nor move the file back to src/game — it is not engine code.\n'
    );
    process.exit(1);
}

console.log(`engine boundary ok (${collect(ENGINE_DIR).length} files, no imports from src/game)`);
