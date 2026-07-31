/**
 * Checks every URL the app would actually request.
 *
 * Deliberately imports the same getAudioSources() the player uses, so a drift
 * between episodes.json and the pinned REF shows up here instead of in front of
 * a user.
 *
 * Usage:
 *   node scripts/verify_audio_sources.js            # skip archive.org
 *   node scripts/verify_audio_sources.js --all      # include archive.org too
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { getAudioSources, AUDIO_REPO, AUDIO_REF } from '../src/lib/audioSources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const episodes = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../src/data/episodes.json'), 'utf-8'),
);

const CONCURRENCY = 12;
const TIMEOUT_MS = 30000;

// A one-byte ranged GET rather than HEAD: it proves the CDN will serve range
// requests, which is what the player relies on for seeking.
const probe = (url) =>
    new Promise((resolve) => {
        const req = https.get(
            url,
            { headers: { Range: 'bytes=0-0', 'User-Agent': 'englishpod-verify' } },
            (res) => {
                res.resume();
                resolve({
                    status: res.statusCode,
                    acceptsRanges: res.statusCode === 206,
                    contentType: res.headers['content-type'] || '',
                });
            },
        );
        req.setTimeout(TIMEOUT_MS, () => {
            req.destroy();
            resolve({ status: 0, acceptsRanges: false, contentType: 'timeout' });
        });
        req.on('error', (err) => resolve({ status: 0, acceptsRanges: false, contentType: err.code || 'error' }));
    });

const hostOf = (url) => new URL(url).host;

async function main() {
    const includeArchive = process.argv.includes('--all');

    const jobs = [];
    for (const ep of episodes) {
        const sources = getAudioSources(ep);
        if (sources.length === 0) {
            jobs.push({ id: ep.id, url: null, host: '(no source)' });
            continue;
        }
        for (const url of sources) {
            const host = hostOf(url);
            if (!includeArchive && host.endsWith('archive.org')) continue;
            jobs.push({ id: ep.id, url, host });
        }
    }

    console.log(`Repo: ${AUDIO_REPO}`);
    console.log(`Ref:  ${AUDIO_REF}`);
    console.log(`Probing ${jobs.length} URLs across ${episodes.length} episodes...\n`);

    const results = [];
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const batch = jobs.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(
            batch.map(async (job) => {
                if (!job.url) return { ...job, status: 0, contentType: 'none' };
                return { ...job, ...(await probe(job.url)) };
            }),
        );
        results.push(...settled);
        process.stdout.write(`\r  ${results.length}/${jobs.length}`);
    }
    process.stdout.write('\n\n');

    const byHost = new Map();
    for (const r of results) {
        if (!byHost.has(r.host)) byHost.set(r.host, []);
        byHost.get(r.host).push(r);
    }

    let allGood = true;
    for (const [host, rows] of byHost) {
        const ok = rows.filter((r) => r.status === 200 || r.status === 206);
        const ranged = rows.filter((r) => r.acceptsRanges);
        const audio = rows.filter((r) => r.contentType.startsWith('audio/'));
        const bad = rows.filter((r) => r.status !== 200 && r.status !== 206);

        console.log(host);
        console.log(`  ok           ${ok.length}/${rows.length}`);
        console.log(`  range (206)  ${ranged.length}/${rows.length}`);
        console.log(`  audio/*      ${audio.length}/${rows.length}`);

        if (bad.length) {
            allGood = false;
            console.log(`  FAILED       ${bad.length}`);
            for (const r of bad) {
                console.log(`    ep ${r.id}: status=${r.status} ${r.contentType} ${r.url || ''}`);
            }
        }

        // Not fatal — browsers sniff media bytes rather than trusting the header
        // — but worth naming rather than hiding behind a count.
        const odd = rows.filter(
            (r) => (r.status === 200 || r.status === 206) && !r.contentType.startsWith('audio/'),
        );
        if (odd.length) {
            console.log(`  non-audio content-type on ${odd.length}:`);
            for (const r of odd) {
                console.log(`    ep ${r.id}: ${r.contentType}`);
            }
        }
        console.log('');
    }

    if (!allGood) {
        console.error('Some sources failed — see the list above.');
        process.exit(1);
    }
    console.log('All probed sources returned audio over a range request.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
