/**
 * Validates the generated public/vocab/*.json against the transcripts they came
 * from. Reports missing entries by name rather than hiding them behind a count.
 *
 * Usage:
 *   node scripts/verify_vocab.js
 *   node scripts/verify_vocab.js --episodes=1-50
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readEpisodeItems } from './lib/transcripts.js';
import { normalizeText, vocabKey } from '../src/lib/vocabulary.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/vocab');
const VI_DIR = path.join(__dirname, 'data/vocab-vi');

function parseRange(arg) {
    if (!arg) return { from: 1, to: 365 };
    const m = /^--episodes=(\d+)(?:-(\d+))?$/.exec(arg);
    if (!m) throw new Error(`Bad --episodes value: ${arg}`);
    return { from: Number(m[1]), to: m[2] ? Number(m[2]) : Number(m[1]) };
}

function checkBatchFiles(problems) {
    if (!fs.existsSync(VI_DIR)) return 0;
    const seen = new Map();
    let count = 0;

    for (const file of fs.readdirSync(VI_DIR).filter((f) => f.endsWith('.jsonl')).sort()) {
        fs.readFileSync(path.join(VI_DIR, file), 'utf-8')
            .split('\n')
            .forEach((line, i) => {
                const where = `${file}:${i + 1}`;
                if (!line.trim()) return;
                let row;
                try {
                    row = JSON.parse(line);
                } catch {
                    problems.push(`${where}: not valid JSON`);
                    return;
                }
                count++;

                for (const field of ['w', 'vi', 'vd']) {
                    if (typeof row[field] !== 'string' || !row[field].trim()) {
                        problems.push(`${where}: field "${field}" is missing or empty`);
                    }
                }
                // "d" may legitimately be empty: episode 194 has two vocab items
                // ("Fortune Cookie", "Chow Mein") whose definition div is blank
                // in the source HTML, and the key has to match that exactly.
                if (typeof row.d !== 'string') {
                    problems.push(`${where}: field "d" is missing`);
                }
                if (row.w !== normalizeText(row.w) || row.d !== normalizeText(row.d)) {
                    problems.push(`${where}: "w"/"d" carry stray whitespace and will never match`);
                }

                const key = vocabKey(row.w, row.d);
                if (seen.has(key)) {
                    problems.push(`${where}: duplicate of ${seen.get(key)} — ${row.w} / ${row.d}`);
                }
                seen.set(key, where);
            });
    }
    return count;
}

function main() {
    const { from, to } = parseRange(process.argv.find((a) => a.startsWith('--episodes=')));
    const problems = [];

    const batchCount = checkBatchFiles(problems);

    let episodesWithFile = 0;
    let episodesWithout = [];
    let totalItems = 0;
    let covered = 0;
    let withIpa = 0;
    const missingIpa = [];

    for (let id = from; id <= to; id++) {
        const items = readEpisodeItems(id);
        if (!items || items.length === 0) continue;
        totalItems += items.length;

        const file = path.join(OUT_DIR, `englishpod_${String(id).padStart(4, '0')}.json`);
        if (!fs.existsSync(file)) {
            episodesWithout.push(id);
            continue;
        }
        episodesWithFile++;

        const entries = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (entries.length !== items.length) {
            problems.push(
                `ep ${id}: ${entries.length} entries for ${items.length} vocab items in the transcript`,
            );
            continue;
        }

        entries.forEach((entry, i) => {
            const item = items[i];
            if (normalizeText(entry.word).toLowerCase() !== normalizeText(item.word).toLowerCase()) {
                problems.push(
                    `ep ${id} #${i}: entry "${entry.word}" does not line up with transcript "${item.word}"`,
                );
            }
            if (!entry.vi || !entry.viDef) {
                problems.push(`ep ${id} #${i}: "${entry.word}" has no Vietnamese`);
            } else {
                covered++;
            }
            if (entry.ipa) withIpa++;
            else missingIpa.push(`ep ${id}: ${entry.word}`);
        });
    }

    console.log(`Range: episodes ${from}-${to}`);
    console.log(`Batch translation rows: ${batchCount}`);
    console.log(`Episodes with a vocab file: ${episodesWithFile}`);
    console.log(`Episodes still without one: ${episodesWithout.length}`);
    if (episodesWithout.length) {
        console.log(`  ${episodesWithout.join(', ')}`);
    }
    console.log(`Vocab items in range: ${totalItems}`);
    console.log(`Items with Vietnamese: ${covered}`);
    console.log(`Items with IPA: ${withIpa}`);
    if (missingIpa.length) {
        console.log(`Items without IPA: ${missingIpa.length}`);
        for (const m of missingIpa) console.log(`  ${m}`);
    }

    if (problems.length) {
        console.error(`\n${problems.length} problems:`);
        for (const p of problems) console.error(`  ${p}`);
        process.exit(1);
    }
    console.log('\nNo inconsistencies between transcripts and generated vocab files.');
}

main();
