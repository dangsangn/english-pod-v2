// lucide's "languages" icon, inlined: the transcript is injected HTML, not React.
const TRANSLATE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>' +
  '<path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>'

/**
 * Put a "translate this line" button at the end of every dialogue line that
 * has a translation. `translations` is indexed like the page's dialogue lines
 * (scripts/build_dialogue.js); the button carries that index in data-line for
 * the transcript's click handler.
 */
export function addLineTranslateButtons(rootEl: HTMLElement, translations: string[]): number {
  const lines = rootEl.querySelectorAll<HTMLElement>('.dialogue-block .text')
  let added = 0
  lines.forEach((line, index) => {
    if (!translations[index]) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'line-translate'
    button.title = 'Dịch câu'
    button.setAttribute('aria-label', 'Dịch câu')
    button.dataset.line = String(index)
    button.innerHTML = TRANSLATE_ICON
    line.append(' ', button)
    added++
  })
  return added
}
