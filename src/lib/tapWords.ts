// Make every English word in a transcript's dialogue individually clickable by
// wrapping it in <span class="tap-word">. Only text nodes are touched, so the
// existing markup (speakers, lines) is left as it is.

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g

export function wrapDialogueWords(rootEl: HTMLElement): number {
  const blocks = rootEl.querySelectorAll('.dialogue-block .text')
  let wrapped = 0
  for (const block of blocks) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)

    for (const node of nodes) {
      const text = node.data
      if (!WORD.test(text)) continue
      WORD.lastIndex = 0
      const frag = document.createDocumentFragment()
      let last = 0
      for (const m of text.matchAll(WORD)) {
        if (m.index > last) frag.append(text.slice(last, m.index))
        const span = document.createElement('span')
        span.className = 'tap-word'
        span.textContent = m[0]
        frag.append(span)
        last = m.index + m[0].length
        wrapped++
      }
      if (last < text.length) frag.append(text.slice(last))
      node.replaceWith(frag)
    }
  }
  return wrapped
}

// lucide's "languages" icon, inlined: the transcript is injected HTML, not React.
const TRANSLATE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>' +
  '<path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>'

/**
 * Put a "translate this line" button at the end of every dialogue line. The
 * transcript's click handler finds it by its class and reads the line's text.
 */
export function addLineTranslateButtons(rootEl: HTMLElement): number {
  const lines = rootEl.querySelectorAll<HTMLElement>('.dialogue-block .text')
  for (const line of lines) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'line-translate'
    button.title = 'Dịch câu'
    button.setAttribute('aria-label', 'Dịch câu')
    button.innerHTML = TRANSLATE_ICON
    line.append(' ', button)
  }
  return lines.length
}
