import type { RefObject } from 'react'
import { Volume2, X } from 'lucide-react'
import { speak } from '../lib/speech'
import type { VocabEntry } from '../types'
import FloatingCard from './FloatingCard'

const WIDTH = 288

export interface LookupTarget {
  text: string
  rect: DOMRect
  /**
   * A whole dialogue line's hand-written Vietnamese. The line is right there,
   * so the card shows only this, not the English again.
   */
  translation?: string
}

interface TranslatePopoverProps {
  target: LookupTarget
  entry?: VocabEntry | null
  entryLabel?: string
  /** The control that opened the card: pressing it again toggles rather than reopens. */
  anchor?: RefObject<Element | null>
  onClose: () => void
}

/**
 * Small card next to a tapped word, or a dialogue line, with its Vietnamese.
 *
 * Only hand-written Vietnamese is shown — machine translation got the meaning
 * wrong too often to put in front of learners:
 * - a line: `target.translation` (scripts/data/dialogue-vi);
 * - a word: `entry`, its vocabulary entry (from this episode, or a card in the
 *   garden; `entryLabel` says which). A word with none still gets its
 *   pronunciation.
 */
export default function TranslatePopover({
  target,
  entry,
  entryLabel = 'Từ vựng của bài',
  anchor,
  onClose,
}: TranslatePopoverProps) {
  const sentence = target.translation !== undefined

  return (
    <FloatingCard
      rect={target.rect}
      width={WIDTH}
      label={sentence ? 'Bản dịch câu' : `Nghĩa của ${target.text}`}
      anchor={anchor}
      onClose={onClose}
    >
      <div className='flex items-start gap-2'>
        <div className='flex-1 min-w-0'>
          {sentence ? (
            <p className='pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>
              Dịch câu
            </p>
          ) : (
            <p className='font-bold text-lg leading-tight text-emerald-600 dark:text-emerald-400 break-words'>
              {target.text}
            </p>
          )}
          {entry?.ipa && <p className='text-sm text-zinc-400 dark:text-zinc-500'>/{entry.ipa}/</p>}
        </div>
        <button
          type='button'
          onClick={() => speak(target.text)}
          title='Nghe phát âm'
          aria-label='Nghe phát âm'
          className='p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        >
          <Volume2 size={18} />
        </button>
        <button
          type='button'
          onClick={onClose}
          title='Đóng'
          aria-label='Đóng'
          className='p-2 -mr-2 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        >
          <X size={18} />
        </button>
      </div>

      <div className='mt-2'>
        {sentence ? (
          <p className='vi-text text-base font-semibold text-indigo-600 dark:text-indigo-400'>
            {target.translation}
          </p>
        ) : entry ? (
          <>
            <p className='vi-text text-base font-semibold text-indigo-600 dark:text-indigo-400'>
              {entry.vi}
            </p>
            {entry.def && (
              <p className='mt-1 text-sm text-zinc-700 dark:text-zinc-300'>{entry.def}</p>
            )}
            {entry.viDef && (
              <p className='vi-text text-sm text-indigo-600 dark:text-indigo-400'>{entry.viDef}</p>
            )}
            <p className='mt-2 text-[11px] text-zinc-400'>{entryLabel}</p>
          </>
        ) : (
          <p className='text-sm text-zinc-500 dark:text-zinc-400'>
            Từ này chưa có trong bộ từ vựng. Bấm loa để nghe phát âm.
          </p>
        )}
      </div>
    </FloatingCard>
  )
}
