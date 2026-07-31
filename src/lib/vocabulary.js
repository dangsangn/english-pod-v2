// Vocabulary decoration: IPA + Vietnamese for the Key/Supplementary Vocabulary
// blocks inside a transcript.
//
// The data in public/vocab/englishpod_XXXX.json is generated from the very same
// transcript HTML by scripts/build_vocab.js, so entries line up with the
// .vocab-item elements by position. That keeps lookup exact and spares us from
// normalising oddities like "stand (someone) up", "20/20 vision" or
// "how may i help you?" at runtime.
//
// normalizeText and vocabKey are shared with the build script — both sides must
// agree on what a key looks like or every lookup silently misses.

/** Collapse all whitespace runs (including &nbsp;) and trim. */
export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lookup key for a (word, definition) sense pair.
 *
 * Joined with a NUL rather than a space so ("a b", "c") and ("a", "b c") cannot
 * collapse onto the same key.
 */
export function vocabKey(word, definition) {
  return `${normalizeText(word).toLowerCase()}\u0000${normalizeText(definition).toLowerCase()}`
}

/**
 * Inject IPA and Vietnamese into an already-rendered transcript.
 *
 * Safe to call more than once — existing spans are replaced rather than
 * appended, so a re-render cannot stack duplicates.
 *
 * @param {HTMLElement} rootEl container holding the transcript HTML
 * @param {Array<{word: string, ipa: string, vi: string, viDef: string}>} entries
 * @returns {number} how many items were decorated
 */
export function decorateVocab(rootEl, entries) {
  if (!rootEl || !Array.isArray(entries) || entries.length === 0) return 0

  const items = [...rootEl.querySelectorAll('.vocab-item')]

  // Positional match is the fast path. The by-word index is a safety net in
  // case the transcript HTML and the generated file ever drift apart.
  const byWord = new Map()
  for (const entry of entries) {
    const key = normalizeText(entry.word).toLowerCase()
    if (!byWord.has(key)) byWord.set(key, entry)
  }

  let decorated = 0

  items.forEach((item, index) => {
    const wordEl = item.querySelector('.word')
    const defEl = item.querySelector('.definition')
    if (!wordEl || !defEl) return

    // Strip anything an earlier pass added before reading the word, otherwise
    // the text would include the pronunciation and match nothing.
    wordEl.querySelector('.pronunciation')?.remove()
    defEl.querySelector('.translation')?.remove()

    const wordText = normalizeText(wordEl.textContent).toLowerCase()

    let entry = entries[index]
    if (wordText && (!entry || normalizeText(entry.word).toLowerCase() !== wordText)) {
      entry = byWord.get(wordText)
    }
    if (!entry) return

    // 19 items ship with an empty .word div: the source HTML lost the word and
    // the build reconstructs it (scripts/data/vocab-word-recovery.json). Fill
    // the blank instead of leaving a row that shows a definition and nothing else.
    if (!wordText) wordEl.textContent = entry.word

    // Click-to-speak reads this rather than textContent, which picks up the
    // pronunciation span appended just below.
    wordEl.dataset.speak = entry.word

    if (entry.ipa) {
      const ipaEl = document.createElement('span')
      ipaEl.className = 'pronunciation'
      ipaEl.textContent = `/${entry.ipa}/`
      wordEl.appendChild(ipaEl)
    }

    const viParts = [entry.vi, entry.viDef].filter(Boolean)
    if (viParts.length) {
      const viEl = document.createElement('span')
      viEl.className = 'translation'
      viEl.textContent = viParts.join(' — ')
      defEl.appendChild(viEl)
    }

    decorated++
  })

  return decorated
}
