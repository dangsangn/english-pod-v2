import { useState } from 'react'
import { cardId } from '../lib/srs'
import { useSrs } from '../lib/srsStore'
import TranslatePopover from './TranslatePopover'

const WORD = /([A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*)/

/**
 * English text whose words can each be tapped for a Vietnamese translation —
 * the same card the transcript uses. A word that is already in the garden
 * shows its hand-written translation instead of a machine one.
 *
 * Pointer and click events are stopped here, so a tap never reaches whatever
 * the text sits in (a flashcard would otherwise flip or start a drag). That
 * includes events from the popover: React bubbles them through the portal to
 * this element.
 */
export default function TappableText({ text, className }) {
  const srs = useSrs()
  const [lookup, setLookup] = useState(null) // { text, rect, index }

  if (!text) return null
  const parts = text.split(WORD) // odd indexes are words

  const stop = (e) => e.stopPropagation()
  const open = (e, word, index) => {
    e.stopPropagation()
    setLookup({ text: word, rect: e.currentTarget.getBoundingClientRect(), index })
  }

  const card = lookup ? srs.cards[cardId(lookup.text)] : null

  return (
    <p className={className} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className={lookup?.index === i ? 'tap-word tap-word-active' : 'tap-word'}
            onClick={(e) => open(e, part, i)}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
      {lookup && (
        <TranslatePopover
          target={lookup}
          entry={card}
          entryLabel='Trong vườn từ vựng'
          onClose={() => setLookup(null)}
        />
      )}
    </p>
  )
}
