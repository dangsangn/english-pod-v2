import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { checkSpelling, lettersOf, maskWord, meaningOf } from '../../lib/quiz'
import { speak } from '../../lib/speech'
import { ContinueButton, QuestionCard } from './QuestionParts'

// A wrong check is allowed once; the second one shows the answer.
const MAX_ATTEMPTS = 2

/**
 * Điền từ: the meaning is shown and the word is typed into letter cells.
 * A hidden <input> takes the keyboard so phones open theirs; the cells only
 * draw what it holds. `onDone({ correct, hinted, attempts })` is called when
 * the learner moves on.
 */
export default function SpellQuestion({ card, onDone }) {
  const wordSegments = maskWord(card.word).map(segmentsOf)
  const maxSegmentLength = Math.max(1, ...wordSegments.flat().map((segment) => segment.length))
  const cellSize = cellSizing(maxSegmentLength)
  const answer = lettersOf(card.word)
  const [typed, setTyped] = useState('')
  // Letters given away by Gợi ý, always a prefix of the answer. They survive a
  // wrong check, and mark the answer as hinted.
  const [hinted, setHinted] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [result, setResult] = useState(null) // null | 'right' | 'wrong'
  const [shakes, setShakes] = useState(0)
  const input = useRef(null)
  const done = useRef(false)

  useEffect(() => {
    input.current?.focus()
  }, [])

  const focus = () => input.current?.focus()

  const onChange = (e) => {
    if (result) return
    const next = lettersOf(e.target.value).slice(0, answer.length)
    const given = answer.slice(0, hinted)
    setTyped(next.length < hinted ? given : given + next.slice(hinted))
  }

  const hint = () => {
    if (result) return
    let i = 0
    while (i < typed.length && typed[i] === answer[i]) i++
    const n = Math.min(answer.length, i + 1)
    setHinted(n)
    setTyped(answer.slice(0, n))
    focus()
  }

  const finish = (outcome) => {
    setResult(outcome)
    speak(card.word)
  }

  const check = () => {
    if (result || typed.length < answer.length) return
    const n = attempts + 1
    setAttempts(n)
    if (checkSpelling(typed, card.word)) return finish('right')
    if (n >= MAX_ATTEMPTS) return finish('wrong')
    setShakes((s) => s + 1)
    setTyped(answer.slice(0, hinted))
    focus()
  }

  const giveUp = () => {
    if (!result) finish('wrong')
  }

  const next = () => {
    if (!result || done.current) return
    done.current = true
    onDone({ correct: result === 'right', hinted: hinted > 0, attempts: Math.max(1, attempts) })
  }

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (result) next()
    else check()
  }

  return (
    <div className='w-full max-w-md mx-auto flex flex-col gap-5 vocab-pop-in'>
      <QuestionCard label='Viết từ tiếng Anh'>
        <p className='vi-text mt-3 text-2xl font-bold text-indigo-600 dark:text-indigo-400'>
          {meaningOf(card)}
        </p>
        {card.vi && card.def && (
          <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>{card.def}</p>
        )}

        <div onClick={focus} className='relative mt-6 cursor-text'>
          <div
            key={shakes}
            className={classNames(
              'flex flex-wrap justify-center gap-x-4 gap-y-3',
              shakes > 0 && 'vocab-shake',
            )}
          >
            {wordSegments.map((segments, w) => (
              <span key={w} className='flex flex-wrap items-end gap-x-1.5 gap-y-2'>
                {segments.map((segment, s) => (
                  <span key={s} className='inline-flex items-end gap-1'>
                    {segment.map((t, i) =>
                      t.type === 'mark' ? (
                        <span
                          key={i}
                          style={{ fontSize: cellSize.fontSize }}
                          className='pb-1 font-bold text-zinc-400'
                        >
                          {t.char}
                        </span>
                      ) : (
                        <Cell
                          key={i}
                          char={result === 'wrong' ? t.char : displayChar(typed[t.index], t.char)}
                          size={cellSize}
                          state={
                            result === 'right'
                              ? 'right'
                              : result === 'wrong'
                                ? 'wrong'
                                : t.index < hinted
                                  ? 'hinted'
                                  : t.index === typed.length
                                    ? 'active'
                                    : 'idle'
                          }
                        />
                      ),
                    )}
                  </span>
                ))}
              </span>
            ))}
          </div>
          <input
            ref={input}
            value={typed}
            onChange={onChange}
            onKeyDown={onKeyDown}
            aria-label='Gõ từ tiếng Anh'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            spellCheck={false}
            enterKeyHint='done'
            className='absolute inset-0 w-full h-full opacity-0 cursor-text'
          />
        </div>

        {result && (
          <div className='mt-5 flex flex-wrap items-center justify-center gap-x-2 vocab-rise-in'>
            <span className='text-lg font-bold text-emerald-600 dark:text-emerald-400'>{card.word}</span>
            {card.ipa && <span className='text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</span>}
            <button
              onClick={() => speak(card.word)}
              title='Nghe phát âm'
              aria-label='Nghe phát âm'
              className='p-1.5 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
            >
              <Volume2 size={18} />
            </button>
          </div>
        )}
      </QuestionCard>

      {result ? (
        <ContinueButton correct={result === 'right'} onClick={next} />
      ) : (
        <div className='flex gap-2'>
          <button
            onClick={hint}
            className='flex items-center gap-1.5 px-4 py-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30 active:scale-[0.98] transition'
          >
            <Lightbulb size={18} /> Gợi ý
          </button>
          <button
            onClick={giveUp}
            className='px-4 py-3.5 rounded-2xl border border-zinc-200 text-zinc-600 font-semibold dark:border-zinc-700 dark:text-zinc-300 active:scale-[0.98] transition'
          >
            Bỏ qua
          </button>
          <button
            onClick={check}
            disabled={typed.length < answer.length}
            className='flex-1 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition disabled:opacity-40'
          >
            Kiểm tra
          </button>
        </div>
      )}
      {!result && attempts === 1 && (
        <p className='-mt-2 text-center text-sm font-medium text-rose-600 dark:text-rose-400'>
          Chưa đúng, thử lại một lần nữa nhé.
        </p>
      )}
    </div>
  )
}

// Splits one word's tokens into runs that each end right after a '-' mark, so
// a long hyphenated word (e.g. "state-of-the-art") can wrap between runs
// while each run itself stays on one line.
function segmentsOf(tokens) {
  const segments = []
  let run = []
  for (const t of tokens) {
    run.push(t)
    if (t.type === 'mark' && t.char === '-') {
      segments.push(run)
      run = []
    }
  }
  if (run.length) segments.push(run)
  return segments
}

// Cells shrink to fit the longest segment (letters + marks) inside the card's
// usable width (min(100vw - 2rem, 28rem), minus ~3.25rem of card padding), so
// a word like "intercontinental" still fits a 375px screen. The min() keeps
// today's size for words short enough not to need shrinking.
function cellSizing(maxSegmentLength) {
  const fit = `((min(100vw - 2rem, 28rem) - 3.25rem) / ${maxSegmentLength} - 0.25rem)`
  return {
    width: `min(1.75rem, calc(${fit}))`,
    fontSize: `min(1.5rem, calc(${fit} * 0.85))`,
  }
}

// typed is always lower case (lettersOf lower-cases input); once a guessed
// letter matches, show the word's own case instead of the flattened one.
function displayChar(typedChar, want) {
  if (typedChar == null) return ''
  return typedChar.toLowerCase() === want.toLowerCase() ? want : typedChar
}

const CELL_STYLES = {
  idle: 'border-zinc-300 dark:border-zinc-600',
  active: 'border-rose-500',
  hinted: 'border-amber-400 text-amber-600 dark:text-amber-300',
  right: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  wrong: 'border-rose-400 text-rose-600 dark:text-rose-400',
}

function Cell({ char, state, size }) {
  return (
    <span
      style={size}
      className={classNames(
        'h-10 sm:h-11 flex items-end justify-center pb-0.5 border-b-4 font-bold transition-colors',
        CELL_STYLES[state],
      )}
    >
      {char}
    </span>
  )
}
