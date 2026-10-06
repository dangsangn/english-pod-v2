/**
 * The Vietnamese for every dialogue line, in scripts/data/dialogue-vi/*.jsonl:
 * one row per line, filed like the example sentences (20 episodes a file):
 *
 *   {"ep":1,"i":0,"s":"A","en":"Good evening. …","vi":"Chào buổi tối. …"}
 *
 * `i` is the line's position in the episode's dialogue (see readDialogue);
 * `en` is the line as the transcript has it, so a changed transcript shows up
 * as a mismatch instead of a translation landing on the wrong line.
 */

import fs from 'fs';
import path from 'path';
import { exFileFor } from './examples.js';
import { ROOT } from './transcripts.js';

export const DIALOGUE_DIR = path.join(ROOT, 'scripts/data/dialogue-vi');
export const DIALOGUE_OUT_DIR = path.join(ROOT, 'public/dialogue');

/** Same layout as the example files: "0003.jsonl" for episodes 41–60. */
export const dialogueFileFor = exFileFor;

export function listDialogueFiles() {
    if (!fs.existsSync(DIALOGUE_DIR)) return [];
    return fs.readdirSync(DIALOGUE_DIR).filter((f) => f.endsWith('.jsonl')).sort();
}

/** Every row of `files`, with where it came from. Throws on a line that is not JSON. */
export function readDialogueRows(files = listDialogueFiles()) {
    const rows = [];
    for (const file of files) {
        const full = path.join(DIALOGUE_DIR, file);
        if (!fs.existsSync(full)) continue;
        fs.readFileSync(full, 'utf-8')
            .split('\n')
            .forEach((text, i) => {
                const trimmed = text.trim();
                if (!trimmed) return;
                let row;
                try {
                    row = JSON.parse(trimmed);
                } catch {
                    throw new Error(`${file}:${i + 1} is not valid JSON: ${trimmed.slice(0, 80)}`);
                }
                rows.push({ row, file, line: i + 1 });
            });
    }
    return rows;
}

export function writeDialogueFile(file, rows) {
    fs.mkdirSync(DIALOGUE_DIR, { recursive: true });
    fs.writeFileSync(path.join(DIALOGUE_DIR, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

export const lineKey = (ep, i) => `${ep}#${i}`;
