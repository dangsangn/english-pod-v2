/**
 * Resolves an `audio_path` for every episode from the linyuanzky/englishpod365
 * GitHub repo and writes it into src/data/episodes.json.
 *
 * File names in that repo carry a per-episode letter prefix that cannot be
 * derived from the episode number (englishpod_B0001pr, englishpod_C0019pb,
 * englishpod_D0018pb, englishpod_0365pb), so the mapping has to come from the
 * Git Tree API rather than a format string.
 *
 * Usage:
 *   node scripts/build_audio_sources.js            # pin to current main
 *   node scripts/build_audio_sources.js --ref=SHA  # pin to a specific commit
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO = 'linyuanzky/englishpod365';
const EPISODES_PATH = path.resolve(__dirname, '../src/data/episodes.json');

// Preferred audio flavour, best first. `pb` is the full lesson; the 15 earliest
// episodes never got a `pb` and only ship `pr` + `rv`. `dg` is dialogue-only
// and is a last resort — it is roughly a tenth of the length.
const KIND_PRIORITY = ['pb', 'pr', 'dg'];

const MP3_PATH = /^\d{4}-\d{4}\/(\d{4})\/englishpod_[A-Za-z]*\d{4}([a-z]{2})\.mp3$/;

const getJson = (url) =>
    new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'englishpod-build-script',
            Accept: 'application/vnd.github+json',
        };
        // Optional: lifts the unauthenticated 60 req/hour limit. Not needed for
        // the two calls this script makes, but handy when iterating.
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        https
            .get(url, { headers }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`GitHub API ${res.statusCode} for ${url}`));
                    return;
                }
                let body = '';
                res.setEncoding('utf-8');
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (err) {
                        reject(err);
                    }
                });
            })
            .on('error', reject);
    });

async function main() {
    const refArg = process.argv.find((a) => a.startsWith('--ref='));
    let ref = refArg ? refArg.slice('--ref='.length) : null;

    if (!ref) {
        const commit = await getJson(`https://api.github.com/repos/${REPO}/commits/main`);
        ref = commit.sha;
    }
    console.log(`Repo: ${REPO}`);
    console.log(`Ref:  ${ref}`);

    const tree = await getJson(
        `https://api.github.com/repos/${REPO}/git/trees/${ref}?recursive=1`,
    );
    if (tree.truncated) {
        throw new Error('Git tree came back truncated — cannot trust the mapping.');
    }

    // episode number -> { kind: path }
    const byEpisode = new Map();
    for (const node of tree.tree) {
        if (node.type !== 'blob') continue;
        const match = MP3_PATH.exec(node.path);
        if (!match) continue;
        const episodeId = Number(match[1]);
        const kind = match[2];
        if (!byEpisode.has(episodeId)) byEpisode.set(episodeId, {});
        byEpisode.get(episodeId)[kind] = node.path;
    }
    console.log(`Parsed ${byEpisode.size} episodes worth of mp3 paths from the tree.`);

    const episodes = JSON.parse(fs.readFileSync(EPISODES_PATH, 'utf-8'));
    const kindCounts = {};
    const unmapped = [];

    const updated = episodes.map((ep) => {
        const available = byEpisode.get(ep.id) || {};
        const kind = KIND_PRIORITY.find((k) => available[k]);

        if (!kind) {
            unmapped.push(ep.id);
            // Drop any stale mapping rather than leaving a path that no longer
            // exists in the pinned commit.
            const { audio_path: _p, audio_kind: _k, ...rest } = ep;
            return rest;
        }
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;

        return {
            id: ep.id,
            original_title: ep.original_title,
            title: ep.title,
            level: ep.level,
            mp3: ep.mp3,
            audio_path: available[kind],
            audio_kind: kind,
            poster: ep.poster,
            transcript_id: ep.transcript_id,
            transcript_url: ep.transcript_url,
        };
    });

    fs.writeFileSync(EPISODES_PATH, `${JSON.stringify(updated, null, 2)}\n`);

    console.log(`\nMapped ${episodes.length - unmapped.length}/${episodes.length} episodes.`);
    for (const kind of KIND_PRIORITY) {
        if (kindCounts[kind]) console.log(`  ${kind}: ${kindCounts[kind]}`);
    }
    if (unmapped.length) {
        console.warn(`\nWARNING: no audio found for ${unmapped.length} episodes: ${unmapped.join(', ')}`);
    }
    console.log(`\nWrote ${EPISODES_PATH}`);
    console.log(`Set REF in src/lib/audioSources.js to:\n  ${ref}`);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
