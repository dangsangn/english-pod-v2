import type { RefObject } from 'react'
import { Volume2, X } from 'lucide-react'
import { speak } from '../lib/speech'
import FloatingCard from './FloatingCard'

const WIDTH = 288

export interface LineTarget {
  /** The English line, for reading it aloud. */
  text: string
  rect: DOMRect
  /** Its hand-written Vietnamese (scripts/data/dialogue-vi). */
  translation: string
}

interface TranslatePopoverProps {
  target: LineTarget
  /** The control that opened the card: pressing it again toggles rather than reopens. */
  anchor?: RefObject<Element | null>
  onClose: () => void
}

/**
 * Small card next to a dialogue line's translate button, with the line's
 * Vietnamese. The English is right there in the transcript, so it is not
 * repeated.
 */
export default function TranslatePopover({ target, anchor, onClose }: TranslatePopoverProps) {
  return (
    <FloatingCard
      rect={target.rect}
      width={WIDTH}
      label='Bản dịch câu'
      anchor={anchor}
      onClose={onClose}
    >
      <div className='flex items-start gap-2'>
        <p className='flex-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>
          Dịch câu
        </p>
        <button
          type='button'
          onClick={() => speak(target.text)}
          title='Nghe câu'
          aria-label='Nghe câu'
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
      <p className='vi-text mt-2 text-base text-indigo-600 dark:text-indigo-400'>
        {target.translation}
      </p>
    </FloatingCard>
  )
}
