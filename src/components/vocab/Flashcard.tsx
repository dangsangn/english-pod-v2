import { useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, ReactNode, SyntheticEvent } from 'react'
import { Check, RotateCcw, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { isLeech, stageOf } from '../../lib/srs'
import type { StoredCard } from '../../lib/srsStore'
import { speak } from '../../lib/speech'
import { STAGE_BY_KEY } from './stages'
import type { StageStyle } from './stages'
import TappableText from '../TappableText'
import type { Example } from '../../lib/examples'
import ExampleSentence from './ExampleSentence'
import LeechBadge from './LeechBadge'

const SWIPE_THRESHOLD = 100 // px of horizontal drag that counts as an answer
const TAP_SLOP = 6 // px of movement still treated as a tap
const MAX_TILT = 15 // deg; the tilt follows the drag but must not spin the card

/** The two answers a flashcard gives by itself. */
type CardAnswer = 'good' | 'again'

interface FlashcardProps {
  card: StoredCard
  flipped: boolean
  canSwipe: boolean
  /** Shown on the back under the definition. */
  example?: Example | null
  onFlip: () => void
  onAnswer: (rating: CardAnswer) => void
}

/**
 * `onAnswer` receives 'good' (Đã thuộc) or 'again' (Chưa thuộc), from a swipe
 * or from the buttons at the bottom of the card.
 */
export default function Flashcard({
  card,
  flipped,
  canSwipe,
  example,
  onFlip,
  onAnswer,
}: FlashcardProps) {
  const [dx, setDx] = useState(0)
  const [flying, setFlying] = useState(false)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number | null>(null)

  const stage = STAGE_BY_KEY[stageOf(card)]

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (flying) return
    start.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null || !canSwipe) return
    setDx(e.clientX - start.current)
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    const moved = canSwipe ? e.clientX - start.current : 0
    start.current = null
    setDragging(false)

    if (Math.abs(moved) < TAP_SLOP) {
      setDx(0)
      onFlip()
      return
    }
    if (Math.abs(moved) < SWIPE_THRESHOLD) {
      setDx(0)
      return
    }
    flyOut(moved > 0 ? 'good' : 'again')
  }

  // Let the card fly off before answering; the parent then remounts us.
  const flyOut = (rating: CardAnswer) => {
    if (flying) return
    setFlying(true)
    setDx((rating === 'good' ? 1 : -1) * window.innerWidth)
    setTimeout(() => onAnswer(rating), 180)
  }

  const onPointerCancel = () => {
    start.current = null
    setDragging(false)
    setDx(0)
  }

  const say = () => speak(card.word)

  const lean = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)

  return (
    <div
      className='relative mx-auto w-full max-w-md aspect-[3/4] max-h-[64vh] touch-pan-y select-none cursor-pointer vocab-pop-in'
      style={{
        transform: `translateX(${dx}px) rotate(${Math.max(-MAX_TILT, Math.min(MAX_TILT, dx / 18))}deg)`,
        transition: dragging && !flying ? 'none' : 'transform 200ms ease-out',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className='w-full h-full perspective-[1400px]'>
        <div
          className={classNames(
            'relative w-full h-full transform-3d transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]',
            flipped && 'rotate-y-180',
          )}
        >
          {/* Front: the word */}
          <Face>
            <Badges card={card} stage={stage} />
            <div className='flex-1 flex flex-col items-center justify-center text-center gap-3'>
              <h2 className='text-4xl sm:text-5xl font-bold tracking-tight break-words text-emerald-600 dark:text-emerald-400'>
                {card.word}
              </h2>
              {card.ipa && <p className='text-lg text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</p>}
            </div>
            <CardActions onAnswer={flyOut} onSpeak={say} />
            {!canSwipe && (
              <p className='mt-2 text-center text-xs text-zinc-400'>Chạm thẻ để xem nghĩa</p>
            )}
          </Face>

          {/* Back: the meaning */}
          <Face className='rotate-y-180'>
            <Badges card={card} stage={stage} />
            {/* min-h-0 + overflow: long definitions scroll inside the card
                instead of pushing the footer off it. */}
            <div className='flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center-safe text-center py-2'>
              <h2 className='text-2xl font-bold tracking-tight break-words text-emerald-600 dark:text-emerald-400'>
                {card.word}
              </h2>
              {card.ipa && <p className='text-sm text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</p>}
              {card.type && (
                <p className='mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400'>
                  {card.type}
                </p>
              )}
              <div className='my-4 w-12 h-1 flex-none rounded-full bg-indigo-200 dark:bg-indigo-500/30' />
              <p className='vi-text text-3xl font-bold text-indigo-600 dark:text-indigo-400'>
                {card.vi}
              </p>
              {/* Definition: the English one from the transcript, with its
                  Vietnamese translation (viDef) directly underneath. */}
              {(card.def || card.viDef) && (
                <div className='mt-5 w-full max-w-xs flex-none text-left'>
                  <p className='text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>
                    Definition
                  </p>
                  {card.def && (
                    <TappableText
                      text={card.def}
                      className='mt-0.5 text-base text-zinc-700 dark:text-zinc-300'
                    />
                  )}
                  {card.viDef && (
                    <p className='vi-text mt-0.5 text-sm font-medium text-indigo-600 dark:text-indigo-400'>
                      {card.viDef}
                    </p>
                  )}
                </div>
              )}
              {example && (
                <div className='mt-5 w-full max-w-xs flex-none text-left'>
                  <p className='text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>
                    Example
                  </p>
                  <ExampleSentence example={example} className='mt-0.5' />
                </div>
              )}
            </div>
            <CardActions onAnswer={flyOut} onSpeak={say} />
          </Face>
        </div>
      </div>

      {/* Swipe feedback, stamped on top of the card while dragging */}
      {canSwipe && dx !== 0 && (
        <div
          className={classNames(
            'pointer-events-none absolute top-8 px-4 py-1.5 rounded-xl border-4 text-2xl font-black tracking-wider',
            dx > 0
              ? 'left-8 -rotate-12 border-emerald-500 text-emerald-500'
              : 'right-8 rotate-12 border-rose-500 text-rose-500',
          )}
          style={{ opacity: lean }}
        >
          {dx > 0 ? 'ĐÃ THUỘC' : 'CHƯA THUỘC'}
        </div>
      )}
    </div>
  )
}

/** Chưa thuộc · Nghe phát âm · Đã thuộc — icon-only, one row. */
function CardActions({
  onAnswer,
  onSpeak,
}: {
  onAnswer: (rating: CardAnswer) => void
  onSpeak: () => void
}) {
  // Pointer-down must not reach the card, or pressing a button would start a
  // drag; click must not reach it either, or it would flip the card.
  const handle = (action: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    action()
  }
  const stop = (e: SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className='flex-none flex items-center justify-center gap-6'
      onPointerDown={stop}
      onPointerUp={stop}
    >
      <IconButton
        label='Chưa thuộc'
        onClick={handle(() => onAnswer('again'))}
        className='w-14 h-14 bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/20'
      >
        <RotateCcw size={24} />
      </IconButton>
      <IconButton
        label='Nghe phát âm'
        onClick={handle(onSpeak)}
        className='w-12 h-12 bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700'
      >
        <Volume2 size={20} />
      </IconButton>
      <IconButton
        label='Đã thuộc'
        onClick={handle(() => onAnswer('good'))}
        className='w-14 h-14 bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/20'
      >
        <Check size={26} />
      </IconButton>
    </div>
  )
}

interface IconButtonProps {
  label: string
  onClick: (e: MouseEvent) => void
  className: string
  children: ReactNode
}

function IconButton({ label, onClick, className, children }: IconButtonProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      title={label}
      aria-label={label}
      className={classNames(
        'rounded-full border flex items-center justify-center active:scale-90 transition',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Face({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={classNames(
        'absolute inset-0 backface-hidden flex flex-col p-6 rounded-[2rem] bg-white dark:bg-zinc-900 border border-black/[0.04] dark:border-white/10 shadow-2xl shadow-rose-900/10 dark:shadow-black/40',
        className,
      )}
    >
      {children}
    </div>
  )
}

function Badges({ card, stage }: { card: StoredCard; stage: StageStyle }) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      <StageBadge stage={stage} isNew={card.state === 'new'} />
      {isLeech(card) && <LeechBadge />}
    </div>
  )
}

function StageBadge({ stage, isNew }: { stage: StageStyle; isNew: boolean }) {
  const { Icon } = stage
  return (
    <span
      className={classNames(
        'self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        stage.tile,
      )}
    >
      <Icon size={14} />
      {isNew ? 'Từ mới' : stage.label}
    </span>
  )
}
