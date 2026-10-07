import { useRef, useState } from 'react'
import type { ReactNode, Ref, SyntheticEvent } from 'react'
import { Languages, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import type { Example } from '../../lib/examples'
import { speak } from '../../lib/speech'
import { hitIndex } from '../../lib/quiz'
import FloatingCard from '../FloatingCard'

interface ExampleSentenceProps {
  example: Example
  /**
   * Show the Vietnamese under the sentence (a question's answer). Otherwise a
   * button after the sentence opens it in a floating card (a flashcard).
   */
  showTranslation?: boolean
  className?: string
}

/**
 * An example sentence: the English with the word in bold, then a button that reads it aloud and, on a
 * flashcard, one that shows the Vietnamese. The buttons follow the last word
 * rather than sitting in a column of their own, so a long sentence keeps the
 * full width.
 *
 * On a flashcard the translation floats over the card instead of being laid
 * out under the sentence: the card's face centres its content, so anything
 * added below would push every line above it up.
 *
 * Pointer and click events stop here (the floating card's too, since React
 * bubbles them through the portal), so it can sit on a flashcard without
 * flipping or dragging it.
 */
export default function ExampleSentence({
  example,
  showTranslation = false,
  className,
}: ExampleSentenceProps) {
  const root = useRef<HTMLDivElement>(null)
  const translateButton = useRef<HTMLButtonElement>(null)
  // Where the sentence was when the button was pressed; the floating card
  // sits right under it, so the English stays readable next to the Vietnamese.
  const [openAt, setOpenAt] = useState<DOMRect | null>(null)
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  const toggle = () =>
    setOpenAt((rect) => (rect ? null : (root.current?.getBoundingClientRect() ?? null)))

  const { ex, hit } = example
  const from = hitIndex(ex, hit)
  const to = from + hit.length

  return (
    // Only stops events (see above); the buttons inside are the controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={root}
      className={classNames('text-left', className)}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <p className='text-base break-words text-zinc-700 dark:text-zinc-300'>
        {from < 0 ? (
          ex
        ) : (
          <>
            {ex.slice(0, from)}
            <span className='font-bold text-emerald-600 dark:text-emerald-400'>
              {ex.slice(from, to)}
            </span>
            {ex.slice(to)}
          </>
        )}{' '}
        {/* nowrap: the buttons move to the next line together. */}
        <span className='inline-flex gap-0.5 align-middle whitespace-nowrap'>
          <InlineButton label='Nghe câu' onClick={() => speak(ex)}>
            <Volume2 size={16} />
          </InlineButton>
          {!showTranslation && (
            <InlineButton
              buttonRef={translateButton}
              label={openAt ? 'Ẩn bản dịch' : 'Dịch câu'}
              pressed={openAt !== null}
              onClick={toggle}
            >
              <Languages size={16} />
            </InlineButton>
          )}
        </span>
      </p>
      {showTranslation && (
        <p className='vi-text mt-1 text-sm text-indigo-600 dark:text-indigo-400'>{example.vi}</p>
      )}
      {openAt && (
        <FloatingCard
          rect={openAt}
          width={280}
          label='Bản dịch câu ví dụ'
          anchor={translateButton}
          placement='below'
          onClose={() => setOpenAt(null)}
        >
          <p className='vi-text text-base font-medium text-indigo-600 dark:text-indigo-400'>
            {example.vi}
          </p>
        </FloatingCard>
      )}
    </div>
  )
}

interface InlineButtonProps {
  label: string
  pressed?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  children: ReactNode
}

// Small enough to sit in a line of text without stretching its height.
function InlineButton({ label, pressed, buttonRef, onClick, children }: InlineButtonProps) {
  return (
    <button
      ref={buttonRef}
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
