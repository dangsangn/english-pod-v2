import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { Loader2, Volume2, X } from 'lucide-react'
import { translate } from '../lib/translate'
import { speak } from '../lib/speech'
import type { VocabEntry } from '../types'
import FloatingCard from './FloatingCard'

const WIDTH = 288

export interface LookupTarget {
  text: string
  rect: DOMRect
  /** A whole line rather than a word: it is right there, so it isn't repeated. */
  sentence?: boolean
}

interface TranslatePopoverProps {
  target: LookupTarget
  entry?: VocabEntry | null
  entryLabel?: string
  /** The control that opened the card: pressing it again toggles rather than reopens. */
  anchor?: RefObject<Element | null>
  onClose: () => void
}

// `key` is the text it answers; then either the translation or an error.
interface Result {
  key: string | null
  text?: string
  error?: string
}

/**
 * Small card next to a tapped word (or selected phrase) with its Vietnamese.
 *
 * `target` = { text, rect } where rect is the word's viewport rectangle.
 * `entry` is a hand-written vocabulary entry for the word, if there is one
 * (from this episode, or a card in the garden): it beats machine translation,
 * so nothing is fetched then. `entryLabel` says where it came from.
 */
export default function TranslatePopover({
  target,
  entry,
  entryLabel = 'Từ vựng của bài',
  anchor,
  onClose,
}: TranslatePopoverProps) {
  // Keyed by the text it answers, so a stale response for an earlier word
  // can never show under a newer one.
  const [result, setResult] = useState<Result>({ key: null })

  useEffect(() => {
    if (entry) return
    let cancelled = false
    translate(target.text).then(
      (r) => !cancelled && setResult({ key: target.text, ...r }),
      (err: Error) => !cancelled && setResult({ key: target.text, error: err.message }),
    )
    return () => {
      cancelled = true
    }
  }, [target.text, entry])

  const ready = result.key === target.text

  return (
    <FloatingCard
      rect={target.rect}
      width={WIDTH}
      label={target.sentence ? 'Bản dịch câu' : `Nghĩa của ${target.text}`}
      anchor={anchor}
      onClose={onClose}
    >
      <div className='flex items-start gap-2'>
        <div className='flex-1 min-w-0'>
          {target.sentence ? (
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
        {entry ? (
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
        ) : !ready ? (
          <p className='flex items-center gap-2 text-sm text-zinc-500'>
            <Loader2 size={14} className='animate-spin' /> Đang dịch…
          </p>
        ) : result.error ? (
          <p className='text-sm text-rose-600 dark:text-rose-400'>
            {result.error === 'quota'
              ? 'Đã hết lượt dịch miễn phí hôm nay. Thử lại vào ngày mai nhé.'
              : 'Không dịch được. Kiểm tra kết nối mạng rồi thử lại.'}
          </p>
        ) : (
          <>
            <p className='vi-text text-base font-semibold text-indigo-600 dark:text-indigo-400'>
              {result.text}
            </p>
            <p className='mt-2 text-[11px] text-zinc-400'>Dịch máy · MyMemory</p>
          </>
        )}
      </div>
    </FloatingCard>
  )
}
