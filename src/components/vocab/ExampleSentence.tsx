import { useRef, useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { Languages, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import type { Example } from '../../lib/examples'
import { speak } from '../../lib/speech'
import TappableText from '../TappableText'

interface ExampleSentenceProps {
  example: Example
  /** Show the Vietnamese from the start (it can still be hidden again). */
  showTranslation?: boolean
  className?: string
}

/**
 * An example sentence: the English with the word in bold (each word can be
 * tapped for a translation), then a button that reads it aloud and one that
 * shows the Vietnamese. The buttons follow the last word rather than sitting
 * in a column of their own, so a long sentence keeps the full width. Pointer
 * and click events stop here, so it can sit on a flashcard without flipping
 * or dragging it.
 */
export default function ExampleSentence({
  example,
  showTranslation = false,
  className,
}: ExampleSentenceProps) {
  const [translated, setTranslated] = useState(showTranslation)
  const translation = useRef<HTMLParagraphElement>(null)
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  return (
    // Only stops events (see above); the buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={classNames('text-left', className)}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <TappableText
        text={example.ex}
        highlight={example.hit}
        className='text-base break-words text-zinc-700 dark:text-zinc-300'
        after={
          <>
            {' '}
            {/* nowrap: the two buttons move to the next line together. */}
            <span className='inline-flex gap-0.5 align-middle whitespace-nowrap'>
              <InlineButton label='Nghe câu' onClick={() => speak(example.ex)}>
                <Volume2 size={16} />
              </InlineButton>
              <InlineButton
                label={translated ? 'Ẩn bản dịch' : 'Dịch câu'}
                pressed={translated}
                onClick={() => {
                  setTranslated((t) => !t)
                  // On a flashcard the sentence can sit at the bottom of a scrolling
                  // face: bring the translation into view once it renders.
                  requestAnimationFrame(() =>
                    translation.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
                  )
                }}
              >
                <Languages size={16} />
              </InlineButton>
            </span>
          </>
        }
      />
      {translated && (
        <p
          ref={translation}
          className='vi-text mt-1 text-sm text-indigo-600 dark:text-indigo-400 vocab-rise-in'
        >
          {example.vi}
        </p>
      )}
    </div>
  )
}

interface InlineButtonProps {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}

// Small enough to sit in a line of text without stretching its height.
function InlineButton({ label, pressed, onClick, children }: InlineButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={classNames(
        '-my-1 p-1 rounded-full transition-colors',
        pressed
          ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300'
          : 'text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  )
}
