/**
 * Reading the archived transcript HTML in public/transcripts/: the vocabulary
 * items and the dialogue lines. Shared by build_vocab.js and the example
 * sentence scripts so they agree on what an episode contains.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeText } from '../../src/lib/vocabulary.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '../..');
export const TRANSCRIPT_DIR = path.join(ROOT, 'public/transcripts');
export const LAST_EPISODE = 365;

const VOCAB_ITEM =
    /<div class="word">([\s\S]*?)<\/div>\s*<div class="type">([\s\S]*?)<\/div>\s*<div class="definition">([\s\S]*?)<\/div>/g;

// Only dialogue lines use class="text"; the vocabulary blocks use word/type/definition.
const DIALOGUE_LINE = /<div class="text">([\s\S]*?)<\/div>/g;

export const decodeEntities = (s) =>
    s
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

let wordRecovery = null;
/**
 * 19 vocab items across the corpus have a definition but an empty
 * <div class="word"> in the archive.org HTML, so re-fetching cannot help. The
 * words in this file were reconstructed from the episode's own dialogue and
 * from definitions that happen to carry the word after a "/" — see the "why"
 * field on each entry.
 */
function loadWordRecovery() {
    if (wordRecovery) return wordRecovery;
    wordRecovery = new Map();
    const file = path.join(ROOT, 'scripts/data/vocab-word-recovery.json');
    if (fs.existsSync(file)) {
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8')))) {
            if (k.startsWith('_')) continue;
            wordRecovery.set(k, normalizeText(v.word));
        }
    }
    return wordRecovery;
}

function readTranscript(episodeId) {
    const file = path.join(TRANSCRIPT_DIR, `englishpod_${String(episodeId).padStart(4, '0')}.html`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

/** The episode's vocabulary items, or null when there is no transcript. */
export function readEpisodeItems(episodeId) {
    const html = readTranscript(episodeId);
    if (html === null) return null;

    const recovery = loadWordRecovery();
    const items = [];
    let index = 0;
    for (const m of html.matchAll(VOCAB_ITEM)) {
        const type = normalizeText(decodeEntities(m[2]));
        const definition = normalizeText(decodeEntities(m[3]));
        // Keep counting even when an item is dropped: the index has to stay in
        // step with the .vocab-item elements the runtime walks.
        const domIndex = index++;
        const word =
            normalizeText(decodeEntities(m[1])) || recovery.get(`${episodeId}#${domIndex}`) || '';
        if (!word) continue;
        items.push({ word, type, definition, domIndex });
    }
    return items;
}

/** The dialogue's lines as plain text; empty when there is no transcript. */
export function readDialogueLines(episodeId) {
    const html = readTranscript(episodeId);
    if (html === null) return [];
    return [...html.matchAll(DIALOGUE_LINE)]
        .map((m) => normalizeText(decodeEntities(m[1].replace(/<[^>]+>/g, ''))))
        .filter(Boolean);
}
