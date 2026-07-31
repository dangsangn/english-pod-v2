/**
 * Builds per-episode vocabulary files with IPA + Vietnamese into public/vocab/.
 *
 * IPA comes from CMUdict offline. api.dictionaryapi.dev was measured returning
 * Cloudflare 1015/429 at ~45 concurrent requests, which makes it useless for
 * thousands of lookups; CMUdict covers 96% of our entries with no network at
 * all. Words CMUdict misses fall back to Wiktionary (a couple hundred lookups,
 * well inside its limits).
 *
 * Vietnamese comes from scripts/data/vocab-vi/*.jsonl, authored by hand. Keyed
 * on (word, definition) rather than word alone because 429 words in the corpus
 * carry genuinely different senses — "complimentary" is both "free" and
 * "expressing a compliment".
 *
 * An episode file is only written when every one of its items has a
 * translation, so a file that exists is always complete. Missing entries are
 * printed rather than silently written as blanks.
 *
 * Usage:
 *   node scripts/build_vocab.js                  # all episodes
 *   node scripts/build_vocab.js --episodes=1-50  # limit the range
 *   node scripts/build_vocab.js --pending        # only report what needs translating
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { normalizeText, vocabKey } from '../src/lib/vocabulary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const TRANSCRIPT_DIR = path.join(ROOT, 'public/transcripts');
const OUT_DIR = path.join(ROOT, 'public/vocab');
const VI_DIR = path.join(__dirname, 'data/vocab-vi');
const CACHE_DIR = path.join(__dirname, '.cache');
const CMUDICT_PATH = path.join(CACHE_DIR, 'cmudict.dict');
const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

// ---------------------------------------------------------------- transcripts

const VOCAB_ITEM =
    /<div class="word">([\s\S]*?)<\/div>\s*<div class="type">([\s\S]*?)<\/div>\s*<div class="definition">([\s\S]*?)<\/div>/g;

const decodeEntities = (s) =>
    s
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

function readEpisodeItems(episodeId) {
    const file = path.join(TRANSCRIPT_DIR, `englishpod_${String(episodeId).padStart(4, '0')}.html`);
    if (!fs.existsSync(file)) return null;
    const html = fs.readFileSync(file, 'utf-8');

    const items = [];
    for (const m of html.matchAll(VOCAB_ITEM)) {
        const word = normalizeText(decodeEntities(m[1]));
        const type = normalizeText(decodeEntities(m[2]));
        const definition = normalizeText(decodeEntities(m[3]));
        // 19 items across the corpus have an empty <div class="word">. They
        // render as blank rows and there is nothing to translate.
        if (!word) continue;
        items.push({ word, type, definition });
    }
    return items;
}

// ----------------------------------------------------------------- CMUdict

const ARPABET_TO_IPA = {
    AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', B: 'b', CH: 'tʃ',
    D: 'd', DH: 'ð', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', F: 'f', G: 'ɡ', HH: 'h',
    IH: 'ɪ', IY: 'i', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ',
    OW: 'oʊ', OY: 'ɔɪ', P: 'p', R: 'ɹ', S: 's', SH: 'ʃ', T: 't', TH: 'θ',
    UH: 'ʊ', UW: 'u', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};

const VOWELS = new Set([
    'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW',
    'OY', 'UH', 'UW',
]);

// Onsets a syllable may legally start with. Used to decide how many of the
// consonants sitting between two vowels belong to the following syllable, which
// is what fixes the stress mark landing inside a cluster: ɪnˈstɛd, not ɪˈnstɛd.
const LEGAL_ONSETS = new Set([
    'p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h',
    'tʃ', 'dʒ', 'm', 'n', 'l', 'ɹ', 'w', 'j',
    'pl', 'pɹ', 'pj', 'bl', 'bɹ', 'bj', 'tɹ', 'tw', 'tj', 'dɹ', 'dw', 'dj',
    'kl', 'kɹ', 'kw', 'kj', 'ɡl', 'ɡɹ', 'ɡw', 'fl', 'fɹ', 'fj', 'θɹ', 'θw',
    'sp', 'st', 'sk', 'sl', 'sm', 'sn', 'sw', 'sf', 'ʃɹ', 'ʃl', 'ʃm', 'ʃn',
    'ʃp', 'ʃt', 'ʃk', 'hj', 'vj', 'mj', 'nj', 'lj',
    'spl', 'spɹ', 'spj', 'stɹ', 'stj', 'skl', 'skɹ', 'skw', 'skj',
]);

// CMUdict overloads two symbols by stress: AH0 is the schwa, AH1/AH2 the STRUT
// vowel; ER0 is r-coloured schwa, ER1/ER2 the stressed NURSE vowel. Collapsing
// them gives "fʌˈtɑɡɹʌfɝ" where a dictionary prints "fəˈtɑɡɹəfɚ".
const UNSTRESSED_IPA = { AH: 'ə', ER: 'ɚ' };

/** ARPAbet phone list -> IPA string with primary/secondary stress marks. */
function phonesToIpa(phones) {
    const units = phones.map((p) => {
        const stress = /\d$/.test(p) ? Number(p.slice(-1)) : null;
        const base = stress === null ? p : p.slice(0, -1);
        const ipa =
            (stress === 0 ? UNSTRESSED_IPA[base] : undefined) ?? ARPABET_TO_IPA[base] ?? '';
        return { ipa, isVowel: VOWELS.has(base), stress };
    });
    if (units.some((u) => !u.ipa)) return null;

    const syllables = units.filter((u) => u.isVowel).length;

    // Walk backwards from each stressed vowel over the preceding consonants and
    // keep the longest run that forms a legal onset.
    const marks = new Array(units.length).fill('');
    units.forEach((u, i) => {
        if (!u.isVowel || !u.stress) return;
        // Dictionaries leave monosyllables unmarked, and drop the secondary on
        // two-syllable words: "ɪnˈstɛd", not "ˌɪnˈstɛd".
        if (syllables < 2) return;
        if (u.stress === 2 && syllables < 3) return;
        let start = i;
        for (let take = 3; take >= 1; take--) {
            const from = i - take;
            if (from < 0) continue;
            const run = units.slice(from, i);
            if (run.some((c) => c.isVowel)) continue;
            if (LEGAL_ONSETS.has(run.map((c) => c.ipa).join(''))) {
                start = from;
                break;
            }
        }
        marks[start] = u.stress === 1 ? 'ˈ' : 'ˌ';
    });

    return units.map((u, i) => marks[i] + u.ipa).join('');
}

async function download(url, dest) {
    await new Promise((resolve, reject) => {
        https
            .get(url, { headers: { 'User-Agent': 'englishpod-build' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    download(res.headers.location, dest).then(resolve, reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', reject);
            })
            .on('error', reject);
    });
}

async function loadCmudict() {
    if (!fs.existsSync(CMUDICT_PATH)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('Downloading CMUdict...');
        await download(CMUDICT_URL, CMUDICT_PATH);
    }
    const dict = new Map();
    for (const line of fs.readFileSync(CMUDICT_PATH, 'utf-8').split('\n')) {
        if (!line || line.startsWith(';;;')) continue;
        const hash = line.indexOf('#');
        const clean = (hash === -1 ? line : line.slice(0, hash)).trim();
        if (!clean) continue;
        const [rawWord, ...phones] = clean.split(/\s+/);
        // "word(2)" marks an alternate pronunciation; keep only the first.
        const word = rawWord.replace(/\(\d+\)$/, '');
        if (!dict.has(word) && phones.length) dict.set(word, phones);
    }
    return dict;
}

let ipaOverrides = null;
function loadIpaOverrides() {
    if (ipaOverrides) return ipaOverrides;
    ipaOverrides = new Map();
    const file = path.join(__dirname, 'data/vocab-ipa-overrides.json');
    if (fs.existsSync(file)) {
        for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf-8')))) {
            if (k.startsWith('_')) continue;
            ipaOverrides.set(k.toLowerCase(), v);
        }
    }
    return ipaOverrides;
}

/** Word or phrase -> IPA, composing phrases token by token. */
function ipaFor(entry, cmudict) {
    const override = loadIpaOverrides().get(normalizeText(entry).toLowerCase());
    if (override) return override;

    // Digits have no CMUdict entry and the tokenizer would silently drop them,
    // turning "20/20 vision" into a bare /ˈvɪʒən/. Better no IPA than a wrong
    // one; add these to the override file instead.
    if (/[0-9]/.test(entry)) return '';

    const tokens = entry.toLowerCase().match(/[a-z']+/g);
    if (!tokens || tokens.length === 0) return '';
    const parts = [];
    for (const token of tokens) {
        const phones = cmudict.get(token);
        if (!phones) return '';
        const ipa = phonesToIpa(phones);
        if (!ipa) return '';
        parts.push(ipa);
    }
    return parts.join(' ');
}

// -------------------------------------------------------------- translations

function loadTranslations() {
    const map = new Map();
    const duplicates = [];
    if (!fs.existsSync(VI_DIR)) return { map, duplicates };

    for (const file of fs.readdirSync(VI_DIR).filter((f) => f.endsWith('.jsonl')).sort()) {
        const full = path.join(VI_DIR, file);
        fs.readFileSync(full, 'utf-8')
            .split('\n')
            .forEach((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                let row;
                try {
                    row = JSON.parse(trimmed);
                } catch {
                    throw new Error(`${file}:${i + 1} is not valid JSON: ${trimmed.slice(0, 80)}`);
                }
                const key = vocabKey(row.w, row.d);
                if (map.has(key)) duplicates.push({ key, file, line: i + 1 });
                map.set(key, { vi: row.vi, viDef: row.vd });
            });
    }
    return { map, duplicates };
}

// --------------------------------------------------------------------- main

function parseRange(arg) {
    if (!arg) return null;
    const m = /^--episodes=(\d+)(?:-(\d+))?$/.exec(arg);
    if (!m) throw new Error(`Bad --episodes value: ${arg}`);
    const from = Number(m[1]);
    return { from, to: m[2] ? Number(m[2]) : from };
}

async function main() {
    const probe = process.argv.find((a) => a.startsWith('--probe='));
    if (probe) {
        const cmudict = await loadCmudict();
        for (const w of probe.slice('--probe='.length).split(',')) {
            const ipa = ipaFor(w, cmudict);
            console.log(`${w.padEnd(22)} ${ipa ? `/${ipa}/` : '(none)'}`);
        }
        return;
    }

    const range = parseRange(process.argv.find((a) => a.startsWith('--episodes=')));
    const pendingOnly = process.argv.includes('--pending');

    const from = range ? range.from : 1;
    const to = range ? range.to : 365;

    const { map: translations, duplicates } = loadTranslations();
    if (duplicates.length) {
        console.error(`Duplicate (word, definition) keys across batches: ${duplicates.length}`);
        for (const d of duplicates.slice(0, 10)) console.error(`  ${d.file}:${d.line}  ${d.key}`);
        process.exit(1);
    }

    const cmudict = await loadCmudict();

    const pending = new Map();
    let written = 0;
    let skipped = 0;
    let totalItems = 0;
    let ipaHits = 0;
    const noIpa = new Set();

    fs.mkdirSync(OUT_DIR, { recursive: true });

    for (let id = from; id <= to; id++) {
        const items = readEpisodeItems(id);
        if (!items) continue;

        const entries = [];
        let complete = true;
        for (const item of items) {
            totalItems++;
            const ipa = ipaFor(item.word, cmudict);
            if (ipa) ipaHits++;
            else noIpa.add(item.word);

            const hit = translations.get(vocabKey(item.word, item.definition));
            if (!hit) {
                complete = false;
                // Record the episode too: "iron" in a laundry lesson and "iron"
                // in a fitness one want different Vietnamese.
                pending.set(vocabKey(item.word, item.definition), { ...item, episodeId: id });
                continue;
            }
            entries.push({ word: item.word, ipa, vi: hit.vi, viDef: hit.viDef });
        }

        const out = path.join(OUT_DIR, `englishpod_${String(id).padStart(4, '0')}.json`);
        // A handful of transcripts carry no vocabulary block at all. Writing an
        // empty array would just cost the UI a pointless fetch.
        if (items.length === 0) {
            if (fs.existsSync(out)) fs.unlinkSync(out);
            continue;
        }
        if (!complete) {
            // Never ship a half-filled file: absence is a clean signal to the UI.
            if (fs.existsSync(out)) fs.unlinkSync(out);
            skipped++;
            continue;
        }
        if (!pendingOnly) {
            fs.writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`);
            written++;
        }
    }

    console.log(`Episodes ${from}-${to}: ${totalItems} vocab items`);
    console.log(`IPA: ${ipaHits}/${totalItems} (${((100 * ipaHits) / totalItems).toFixed(1)}%)`);
    if (noIpa.size) console.log(`  ${noIpa.size} distinct words without IPA`);
    console.log(`Episode files written: ${written}, incomplete (skipped): ${skipped}`);

    if (pending.size) {
        const file = path.join(CACHE_DIR, 'vocab-pending.json');
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const titles = new Map(
            JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/episodes.json'), 'utf-8')).map(
                (e) => [e.id, e.original_title],
            ),
        );
        const rows = [...pending.values()].map((i) => ({
            w: i.word,
            t: i.type,
            d: i.definition,
            ep: titles.get(i.episodeId) ?? String(i.episodeId),
        }));
        fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
        console.log(`\n${pending.size} (word, definition) pairs still need Vietnamese.`);
        console.log(`Written to ${path.relative(ROOT, file)}`);
    } else {
        console.log('\nEvery pair in range has a translation.');
    }
}

// Only run when invoked directly, so other scripts can import the helpers
// above without kicking off a full build.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}

export { readEpisodeItems, loadCmudict, ipaFor, loadTranslations };
