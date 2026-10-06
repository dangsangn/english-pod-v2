import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Snail, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { gradeDictation, meaningOf } from '../../lib/quiz'
import type { DictationResult, DictationStatus } from '../../lib/quiz'
import type { Example } from '../../lib/examples'
import type { StoredCard } from '../../lib/srsStore'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

const SLOW_RATE = 0.55

const WORD_STYLES: Record<DictationStatus, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  missed: 'text-rose-600 dark:text-rose-400 underline decoration-wavy decoration-rose-400',
  extra: 'text-zinc-400 line-through',
}

interface DictationQuestionProps {
  card: StoredCard
  example: Example
  onDone: (result: { correct: boolean }) => void
}

/**
 * Chép chính tả: the example sentence is read out and typed back. It is graded
 * word by word (quiz.gradeDictation), but only the card's own word decides the
 * rating, so a slip elsewhere in the sentence costs nothing. One check only.
 */
export default function DictationQuestion({ card, example, onDone }: DictationQuestionProps) {
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<DictationResult | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  // A listening question: always read, whatever the auto-speak setting.
  useEffect(() => {
    input.current?.focus()
    speak(example.ex)
  }, [example.ex])

  const check = () => {
    if (result || !typed.trim()) return
    setResult(gradeDictation(typed, example.ex, example.hit))
  }

  const giveUp = () => {
    if (!result) setResult(gradeDictation('', example.ex, example.hit))
  }

  const next = () => {
    if (!result || done.current) return
    done.current = true
    onDone({ correct: result.targetCorrect })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    check()
  }

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label='Nghe và chép lại cả câu'>
        <div className='mt-4 flex justify-center gap-3'>
          <button
            type='button'
            onClick={() => speak(example.ex)}
            title='Nghe lại'
            aria-label='Nghe lại'
            className='w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-95 transition'
          >
            <Volume2 size={28} />
          </button>
          <button
            type='button'
            onClick={() => speak(example.ex, { rate: SLOW_RATE })}
            title='Nghe chậm'
            aria-label='Nghe chậm'
            className='w-16 h-16 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300 flex items-center justify-center active:scale-95 transition'
          >
            <Snail size={28} />
          </button>
        </div>

        {result ? (
          <div className='mt-5 text-left vocab-rise-in'>
            <p className='text-lg leading-relaxed'>
              {result.words.map((w, i) => (
                <span key={i}>
                  <span className={classNames(WORD_STYLES[w.status], w.target && 'font-bold')}>
                    {w.text}
                  </span>{' '}
                </span>
              ))}
            </p>
            <p className='mt-1 text-xs text-zinc-500 dark:text-zinc-400'>
              Đúng {Math.round(result.accuracy * 100)}% số từ
            </p>
            <p className='vi-text mt-3 text-sm text-indigo-600 dark:text-indigo-400'>
              {example.vi}
            </p>
            <p className='mt-3 text-sm'>
              <span className='font-bold text-emerald-600 dark:text-emerald-400'>{card.word}</span>
              {card.ipa && <span className='text-zinc-400'> /{card.ipa}/</span>}
              <span className='vi-text text-zinc-600 dark:text-zinc-300'> · {meaningOf(card)}</span>
            </p>
          </div>
        ) : (
          <textarea
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            aria-label='Gõ lại câu vừa nghe'
            placeholder='Gõ lại câu bạn nghe được…'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            spellCheck={false}
            enterKeyHint='done'
            className='mt-5 w-full resize-none rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent p-3 text-base text-left outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-500/40'
          />
        )}
      </QuestionCard>

      {result ? (
        <ContinueButton correct={result.targetCorrect} onClick={next} />
      ) : (
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={giveUp}
            className='px-4 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold dark:border-zinc-700 dark:text-zinc-300 active:scale-[0.98] transition'
          >
            Bỏ qua
          </button>
          <button
            type='button'
            onClick={check}
            disabled={!typed.trim()}
            className='flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition disabled:opacity-40'
          >
            Kiểm tra
          </button>
        </div>
      )}
    </div>
  )
}
