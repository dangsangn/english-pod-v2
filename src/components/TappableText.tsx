import { useState } from 'react'
import type { MouseEvent, SyntheticEvent } from 'react'
import classNames from 'classnames'
import { hitIndex } from '../lib/quiz'
import { cardId } from '../lib/srs'
import { useSrs } from '../lib/srsStore'
import TranslatePopover from './TranslatePopover'
import type { LookupTarget } from './TranslatePopover'

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
interface TappableTextProps {
  text: string | null | undefined
  className?: string
  /** Shown in bold where it first occurs in `text` (the word an example is about). */
  highlight?: string
}

export default function TappableText({ text, className, highlight }: TappableTextProps) {
  const srs = useSrs()
  const [lookup, setLookup] = useState<(LookupTarget & { index: number }) | null>(null)

  if (!text) return null
  const parts = text.split(WORD) // odd indexes are words

  // Character range of the highlight, and where each part starts.
  const from = highlight ? hitIndex(text, highlight) : -1
  const to = from + (highlight?.length ?? 0)
  const starts = parts.map((_, i) => parts.slice(0, i).join('').length)
  const highlighted = (i: number) =>
    from >= 0 && starts[i] < to && starts[i] + parts[i].length > from

  const stop = (e: SyntheticEvent) => e.stopPropagation()
  const open = (e: MouseEvent<HTMLSpanElement>, word: string, index: number) => {
    e.stopPropagation()
    setLookup({ text: word, rect: e.currentTarget.getBoundingClientRect(), index })
  }

  const card = lookup ? srs.cards[cardId(lookup.text)] : null

  return (
    // Only stops events (see above); nothing here is a control of its own.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <p className={className} onPointerDown={stop} onPointerUp={stop} onClick={stop}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // Tapping a word is a touch and mouse shortcut: the card already shows
          // the meaning, and a tab stop per word would bury the card's controls.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            key={i}
            className={classNames(
              'tap-word',
              lookup?.index === i && 'tap-word-active',
              highlighted(i) && 'font-bold text-emerald-600 dark:text-emerald-400',
            )}
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
