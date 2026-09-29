import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { meaningOf } from '../../lib/quiz'
import type { StoredCard } from '../../lib/srsStore'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

const OPTION_STYLES = {
  idle: 'bg-white border-zinc-200 hover:border-rose-300 hover:bg-rose-50 dark:bg-zinc-900 dark:border-zinc-700 dark:hover:bg-rose-500/10',
  right: 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/50 dark:text-emerald-300',
  wrong: 'bg-rose-50 border-rose-400 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/50 dark:text-rose-300',
  dim: 'bg-white border-zinc-200 opacity-50 dark:bg-zinc-900 dark:border-zinc-700',
}

/**
 * Chọn nghĩa (`kind` 'meaning': the word is shown, pick its meaning) and
 * Nghe (`kind` 'listen': the word is spoken, pick how it is written).
 * `onDone({ correct })` is called when the learner moves on rather than when
 * they pick, so the right answer stays on screen until then.
 */
interface ChoiceQuestionProps {
  card: StoredCard
  kind: 'meaning' | 'listen'
  options: string[]
  answerIndex: number
  autoSpeak: boolean
  onDone: (result: { correct: boolean }) => void
}

export default function ChoiceQuestion({
  card,
  kind,
  options,
  answerIndex,
  autoSpeak,
  onDone,
}: ChoiceQuestionProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const done = useRef(false)
  const listen = kind === 'listen'
  const answered = picked !== null
  const correct = picked === answerIndex

  useEffect(() => {
    if (listen || autoSpeak) speak(card.word)
  }, [card.word, listen, autoSpeak])

  const pick = (i: number) => {
    if (!answered) setPicked(i)
  }

  const next = () => {
    if (!answered || done.current) return
    done.current = true
    onDone({ correct })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (!answered) {
        const i = Number(e.key) - 1
        if (i >= 0 && i < options.length) pick(i)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const say = () => speak(card.word)
  const meaning = meaningOf(card)

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label={listen ? 'Nghe và chọn từ đúng' : 'Chọn nghĩa đúng'}>
        {listen && !answered ? (
          <button
            onClick={say}
            title='Nghe lại'
            aria-label='Nghe lại'
            className='mt-5 mb-2 mx-auto w-20 h-20 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-95 transition'
          >
            <Volume2 size={36} />
          </button>
        ) : (
          <div className='mt-3 flex flex-col items-center gap-1'>
            <h2 className='text-4xl font-bold tracking-tight break-words text-emerald-600 dark:text-emerald-400'>
              {card.word}
            </h2>
            {card.ipa && <p className='text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</p>}
            <button
              onClick={say}
              title='Nghe phát âm'
              aria-label='Nghe phát âm'
              className='mt-1 p-2 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
            >
              <Volume2 size={20} />
            </button>
            {listen && meaning && (
              <p className='vi-text text-xl font-bold text-indigo-600 dark:text-indigo-400'>{meaning}</p>
            )}
          </div>
        )}
      </QuestionCard>

      <ul className='grid gap-2.5'>
        {options.map((option, i) => {
          const state = !answered
            ? 'idle'
            : i === answerIndex
              ? 'right'
              : i === picked
                ? 'wrong'
                : 'dim'
          return (
            <li key={option}>
              <button
                disabled={answered}
                onClick={() => pick(i)}
                className={classNames(
                  'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left font-semibold transition active:scale-[0.99]',
                  OPTION_STYLES[state],
                  !listen && 'vi-text',
                )}
              >
                <span className='w-7 h-7 flex-none rounded-full bg-black/5 dark:bg-white/10 text-xs flex items-center justify-center tabular-nums'>
                  {i + 1}
                </span>
                <span className='flex-1 break-words'>{option}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {answered && <ContinueButton correct={correct} onClick={next} />}
    </div>
  )
}
