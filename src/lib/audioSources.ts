// Where episode audio comes from, in the order we try it.
//
// The original archive.org links break for a lot of users: `/download/` URLs
// have to hit the apex `archive.org` for a 302 before reaching a data node, and
// that apex is blocked at the ISP/DNS level in some regions even though the
// data nodes themselves stay reachable. So it is now the last resort, not the
// first choice.
//
// `audio_path` is written into episodes.json by scripts/build_audio_sources.js.
// Keep REF in sync with the ref that script was last run against.

const REPO = 'linyuanzky/englishpod365'
const REF = '459a08ed310883985a0fcda9d75e3f0e5f139392'

/**
 * Ordered list of URLs to try for an episode's audio.
 *
 * jsDelivr goes first even though raw.githubusercontent measures roughly twice
 * as fast: pinned to a commit SHA it returns `immutable, max-age=31536000`, so
 * a second listen costs no request at all, and it is a public CDN meant for
 * this. raw only caches for 300s and has abuse throttling.
 *
 * @returns non-empty URLs, best first
 */
export function getAudioSources(
  episode: { audio_path?: string; mp3?: string } | null | undefined,
): string[] {
  if (!episode) return []
  const p = episode.audio_path

  return [
    p && `https://cdn.jsdelivr.net/gh/${REPO}@${REF}/${p}`,
    p && `https://raw.githubusercontent.com/${REPO}/${REF}/${p}`,
    episode.mp3,
  ].filter((url): url is string => Boolean(url))
}

export const AUDIO_REPO = REPO
export const AUDIO_REF = REF
