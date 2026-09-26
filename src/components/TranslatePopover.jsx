import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Volume2, X } from 'lucide-react'
import { translate } from '../lib/translate'
import { speak } from '../lib/speech'

const WIDTH = 288

/**
 * Small card next to a tapped word (or selected phrase) with its Vietnamese.
 *
 * `target` = { text, rect } where rect is the word's viewport rectangle.
 * `entry` is a hand-written vocabulary entry for the word, if there is one
 * (from this episode, or a card in the garden): it beats machine translation,
 * so nothing is fetched then. `entryLabel` says where it came from.
 */
export default function TranslatePopover({ target, entry, entryLabel = 'Từ vựng của bài', onClose }) {
  const ref = useRef(null)
  // Keyed by the text it answers, so a stale response for an earlier word
  // can never show under a newer one.
  const [result, setResult] = useState({ key: null })

  useEffect(() => {
    if (entry) return
    let cancelled = false
    translate(target.text).then(
      (r) => !cancelled && setResult({ key: target.text, ...r }),
      (err) => !cancelled && setResult({ key: target.text, error: err.message }),
    )
    return () => {
      cancelled = true
    }
  }, [target.text, entry])

  // Close on Escape, on a press outside, and when the page scrolls or resizes
  // (the card is positioned for where the word was).
  useEffect(() => {
    // Capture phase + stopPropagation: Escape closes this card only, not the
    // study session listening for Escape on the window behind it.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    // Capture phase, so it still fires when the press lands somewhere that
    // stops propagation (a flashcard, TappableText). The press is used up by
    // closing: stopping it here keeps a flashcard underneath from also
    // flipping. Clicks still go through, so pressing another word closes this
    // card and that word's click opens its own.
    const onDown = (e) => {
      if (ref.current?.contains(e.target)) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const { rect } = target
  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - WIDTH / 2),
    window.innerWidth - WIDTH - 12,
  )
  // Below the word unless it sits in the lower part of the screen.
  const below = rect.bottom < window.innerHeight * 0.6
  const position = below
    ? { top: rect.bottom + 8 }
    : { bottom: window.innerHeight - rect.top + 8 }

  const ready = result.key === target.text

  // Portalled to <body>: the transcript card uses backdrop-filter, which makes
  // it the containing block for `position: fixed` children — rendered inside
  // it, the card would be placed relative to the card instead of the screen.
  // z-[70] keeps it above the vocabulary overlay (z-[60]) too.
  return createPortal(
    <div
      ref={ref}
      role='dialog'
      aria-label={`Nghĩa của ${target.text}`}
      style={{ left, width: WIDTH, ...position }}
      className='fixed z-[70] rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl shadow-zinc-900/15 dark:shadow-black/50 vocab-pop-in'
    >
      <div className='flex items-start gap-2'>
        <div className='flex-1 min-w-0'>
          <p className='font-bold text-lg leading-tight text-emerald-600 dark:text-emerald-400 break-words'>
            {target.text}
          </p>
          {entry?.ipa && (
            <p className='text-sm text-zinc-400 dark:text-zinc-500'>/{entry.ipa}/</p>
          )}
        </div>
        <button
          onClick={() => speak(target.text)}
          title='Nghe phát âm'
          aria-label='Nghe phát âm'
          className='p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        >
          <Volume2 size={18} />
        </button>
        <button
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
    </div>,
    document.body,
  )
}
