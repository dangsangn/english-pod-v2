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
