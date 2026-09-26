// English → Vietnamese lookup for words tapped in a transcript.
//
// Uses the MyMemory API (https://mymemory.translated.net/doc/spec.php): free,
// no key, and it sends CORS headers so the browser can call it directly.
// Anonymous use is capped at roughly 5,000 characters a day per IP, which is
// plenty for single words — and every answer is cached in localStorage, so a
// word is only ever fetched once.

const CACHE_KEY = 'englishpod_translate_v1'
const CACHE_LIMIT = 1000 // entries; oldest are dropped first
const TIMEOUT_MS = 8000

let cache = null

function loadCache() {
  if (cache) return cache
  try {
    cache = new Map(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'))
  } catch {
    cache = new Map()
  }
  return cache
}

function saveCache() {
  try {
    const entries = [...cache.entries()].slice(-CACHE_LIMIT)
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or blocked: the in-memory cache still works this session.
  }
}

/** MyMemory often returns "khách hàng." for "customers" — drop that full stop. */
const tidy = (s) => String(s ?? '').trim().replace(/[.。]+$/, '')

/**
 * Translate `text` (a word or short phrase). Resolves to { text }; throws on
 * network or quota errors.
 *
 * Only the main translation is kept. The response also lists "matches" from
 * MyMemory's crowd-sourced memory, but they are too noisy to show — "to" comes
 * with "tháng năm", "not" with "GnotskiComment" — and their quality scores
 * do not separate the good ones from the bad.
 */
export async function translate(text) {
  const key = text.trim().toLowerCase()
  const cached = loadCache().get(key)
  if (cached) return cached

  const url =
    'https://api.mymemory.translated.net/get?langpair=en|vi&q=' + encodeURIComponent(key)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let data
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } finally {
    clearTimeout(timer)
  }

  if (data.quotaFinished) throw new Error('quota')
  if (Number(data.responseStatus) !== 200) throw new Error(data.responseDetails || 'failed')

  const main = tidy(data.responseData?.translatedText)
  if (!main) throw new Error('empty')

  const result = { text: main }
  cache.delete(key)
  cache.set(key, result)
  saveCache()
  return result
}
