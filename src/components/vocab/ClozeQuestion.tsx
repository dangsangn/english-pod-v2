import type { ReactNode } from 'react'
import { hitRanges, meaningOf } from '../../lib/quiz'
import type { Example } from '../../lib/examples'
import type { StoredCard } from '../../lib/srsStore'
import SpellQuestion from './SpellQuestion'

interface ClozeQuestionProps {
  card: StoredCard
  example: Example
  onDone: (result: { correct: boolean; hinted: boolean; attempts: number }) => void
}

/**
 * Điền vào câu: the example sentence with the word blanked out, and the
 * word's meaning as a clue. The word is typed as it occurs in the sentence
 * ("grabbed", not "grab"); hints, retries and grading are Điền từ's.
 */
export default function ClozeQuestion({ card, example, onDone }: ClozeQuestionProps) {
  // Blank every occurrence: a repeated word would give the answer away.
  const parts: ReactNode[] = []
  let from = 0
  for (const [start, end] of hitRanges(example.ex, example.hit)) {
    parts.push(example.ex.slice(from, start))
    parts.push(
      <span key={start} className='px-1 font-bold text-rose-500'>
        _____
      </span>,
    )
    from = end
  }
  parts.push(example.ex.slice(from))
  return (
    <SpellQuestion
      card={card}
      target={example.hit}
      label='Điền từ còn thiếu'
      spoken={example.ex}
      example={example}
      onDone={onDone}
      prompt={
        <>
          <p className='vi-text mt-3 text-lg font-bold text-indigo-600 dark:text-indigo-400'>
            {meaningOf(card)}
          </p>
          <p className='mt-3 text-xl leading-relaxed text-zinc-700 dark:text-zinc-200'>{parts}</p>
        </>
      }
    />
  )
}
