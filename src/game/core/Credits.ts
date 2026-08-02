/**
 * Authorship line, in one place.
 *
 * Shown on the main menu and the end-of-run panel. It is deliberately not a
 * translated string: a name is a name in every language, and keeping it out of
 * the locale tables means it cannot be dropped by a partial translation.
 *
 * It exists because a build of this game is a static bundle that anyone can
 * mirror — an earlier version already turned up re-hosted elsewhere. A credit
 * baked into the UI travels with every copy, so removing it becomes a
 * deliberate act rather than a side effect of Ctrl+C, and until someone does,
 * even a mirror points back at the author.
 */
export const AUTHOR_CREDIT = 'by Aleksey Dudnikov';
