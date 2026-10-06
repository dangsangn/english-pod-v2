import type { SyntheticEvent } from 'react'
import { Volume2 } from 'lucide-react'
import classNames from 'classnames'
import type { Example } from '../../lib/examples'
import { speak } from '../../lib/speech'
import TappableText from '../TappableText'

/**
 * An example sentence: the English with the word in bold (each word can be
 * tapped for a translation), a button that reads it aloud, and the
 * Vietnamese. Pointer and click events stop here, so it can sit on a
 * flashcard without flipping or dragging it.
 */
export default function ExampleSentence({
  example,
  className,
}: {
  example: Example
  className?: string
}) {
  const stop = (e: SyntheticEvent) => e.stopPropagation()
  return (
    // Only stops events (see above); the button inside is the control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className={classNames('flex items-start gap-2 text-left', className)}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
    >
      <button
        type='button'
        onClick={() => speak(example.ex)}
        title='Nghe câu'
        aria-label='Nghe câu'
        className='flex-none p-1.5 rounded-full text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10'
      >
        <Volume2 size={16} />
      </button>
      <div className='min-w-0'>
        <TappableText
          text={example.ex}
          highlight={example.hit}
          className='text-base text-zinc-700 dark:text-zinc-300'
        />
        <p className='vi-text mt-0.5 text-sm text-indigo-600 dark:text-indigo-400'>{example.vi}</p>
      </div>
    </div>
  )
}
