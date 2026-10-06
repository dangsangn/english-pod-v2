/**
 * Checks the English voice choice (src/lib/voices.ts) against the voice lists
 * real browsers report, so a robotic or novelty voice is never picked where a
 * natural one is installed.
 *
 * Usage:
 *   node scripts/verify_speech.js
 */

import { pickVoice } from '../src/lib/voices.ts';

const local = (name, lang = 'en-US') => ({ name, lang, localService: true });
const remote = (name, lang = 'en-US') => ({ name, lang, localService: false });

// macOS Chrome, as listed on a stock Mac (alphabetical, novelty voices included).
const MAC = [
    local('Daniel (English (United Kingdom))', 'en-GB'),
    ...['Aaron', 'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos'].map((n) => local(n)),
    local('Eddy (English (United States))'),
    local('Fred'),
    local('Grandma (English (United States))'),
    local('Junior'),
    local('Kathy'),
    local('Nicky'),
    local('Ralph'),
    local('Samantha'),
    local('Whisper'),
    local('Zarvox'),
];

const cases = [
    ['macOS: Samantha over Aaron and the novelty voices', MAC, 'Samantha'],
    ['macOS without Samantha: Nicky, never Albert', MAC.filter((v) => v.name !== 'Samantha'), 'Nicky'],
    [
        'a downloaded Premium voice wins',
        [...MAC, local('Ava (Premium)'), local('Samantha (Enhanced)')],
        'Ava (Premium)',
    ],
    [
        'Chrome: a good local voice beats the remote Google one (no network delay)',
        [remote('Google US English'), ...MAC],
        'Samantha',
    ],
    [
        'Windows Chrome: Google US English over the old desktop voices',
        [local('Microsoft David - English (United States)'), remote('Google US English'), remote('Google UK English Female', 'en-GB')],
        'Google US English',
    ],
    [
        'Edge: the Natural voice',
        [
            local('Microsoft David - English (United States)'),
            remote('Microsoft Aria Online (Natural) - English (United States)'),
        ],
        'Microsoft Aria Online (Natural) - English (United States)',
    ],
    ['Android: the local US voice', [local('English United Kingdom', 'en-GB'), local('English United States')], 'English United States'],
    ['only novelty voices: still English', [local('Albert'), local('Vietnamese', 'vi-VN')], 'Albert'],
    ['no English voice at all', [local('Linh', 'vi-VN')], null],
    ['no voices yet', [], null],
];

const problems = [];
for (const [name, voices, want] of cases) {
    const got = pickVoice(voices)?.name ?? null;
    if (got !== want) problems.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
}
console.log('All speech checks passed.');
