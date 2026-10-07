import type { RefObject } from 'react'
import { Volume2, X } from 'lucide-react'
import { cardId, isLeech, stageOf } from '../lib/srs'
import { useSrs } from '../lib/srsStore'
import { speak } from '../lib/speech'
import FloatingCard from './FloatingCard'
import LeechBadge from './vocab/LeechBadge'
import StageBadge from './vocab/StageBadge'
import { STAGE_BY_KEY } from './vocab/stages'
import type { VocabEntry } from '../types'

const WIDTH = 288

export interface WordTarget {
  entry: VocabEntry
  rect: DOMRect
}

interface WordPopoverProps {
  target: WordTarget
  /** The highlighted word: pressing it again toggles rather than reopens. */
  anchor?: RefObject<Element | null>
  onClose: () => void
}

/**
 * Small card next to a highlighted word in the dialogue: the word, its IPA
 * and Vietnamese, and where it stands in the garden. The card in the garden
 * wins over the episode's vocab file, so it shows what is being studied.
 */
export default function WordPopover({ target, anchor, onClose }: WordPopoverProps) {
  const srs = useSrs()
  const card = srs.cards[cardId(target.entry.word)]
  const { word, ipa, vi, viDef } = card ?? target.entry
  const meaning = [vi, viDef].filter(Boolean).join(' — ')

  return (
    <FloatingCard
      rect={target.rect}
      width={WIDTH}
      label={`Từ vựng: ${word}`}
      anchor={anchor}
      onClose={onClose}
    >
      <div className='flex items-start gap-2'>
        <div className='flex-1 min-w-0 pt-1'>
          <p className='text-lg font-bold leading-tight'>{word}</p>
          {ipa && <p className='text-sm text-zinc-400 dark:text-zinc-500'>/{ipa}/</p>}
        </div>
        <button
          type='button'
          onClick={() => speak(word)}
          title='Nghe từ'
          aria-label='Nghe từ'
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
      {meaning && (
        <p className='vi-text mt-2 text-base text-indigo-600 dark:text-indigo-400'>{meaning}</p>
      )}
      <div className='mt-3 flex flex-wrap gap-1.5'>
        {card ? (
          <>
            <StageBadge stage={STAGE_BY_KEY[stageOf(card)]} isNew={card.state === 'new'} />
            {isLeech(card) && <LeechBadge />}
          </>
        ) : (
          <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'>
            Chưa học
          </span>
        )}
      </div>
    </FloatingCard>
  )
}
