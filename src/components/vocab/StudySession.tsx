import { useEffect, useState } from 'react'
import classNames from 'classnames'
import { formatDelay, previewDelay, RATINGS, schedule } from '../../lib/srs'
import type { Rating } from '../../lib/srs'
import { buildQueue, markLesson, rateCard, useSrs } from '../../lib/srsStore'
import { coreDeckName, isCoreDeck } from '../../lib/coreDecks'
import {
  collocationsOf,
  episodeIdsOf,
  exampleOf,
  synonymsOf,
  useExamples,
} from '../../lib/examples'
import { speak } from '../../lib/speech'
import { useNow } from '../../lib/hooks'
import Flashcard from './Flashcard'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import type { SessionStats } from './SessionSummary'
import type { SessionProps } from './GameSession'
import { RATING_STYLES } from './stages'

// Learning cards answered in this session come back after a few other cards
// rather than straight away, so the short-term memory has to do some work.
const REQUEUE_GAP = 3

export default function StudySession({ episodeId, episode, lessonStep, onExit }: SessionProps) {
  const srs = useSrs()
  const now = useNow()
  const [start] = useState(() => {
    const queue = buildQueue(srs, Date.now(), episodeId)
    return { queue, episodeIds: episodeIdsOf(queue.map((id) => srs.cards[id])) }
  })
  const [queue, setQueue] = useState(start.queue)
  // Cards show at once; their example sentences appear when the files arrive.
  const examplesReady = useExamples(start.episodeIds)
  // `flipped` is which face is showing; `revealed` is whether the meaning has
  // been seen at all. The card can be turned back and forth freely, and the
  // rating buttons stay available once the answer has been revealed.
  const [flipped, setFlipped] = useState(false)
  const [revealed, setRevealed] = useState(false)
  // Bumped on every answer: it keys the card so the same word shown twice in a
  // row still remounts face-down, and re-triggers auto-speak.
  const [turn, setTurn] = useState(0)
  const [stats, setStats] = useState<SessionStats>(() => ({
    startedAt: Date.now(),
    answers: 0,
    forgotten: 0,
    learned: 0,
  }))

  const card = queue.length ? srs.cards[queue[0]] : null
  const autoSpeak = srs.settings.autoSpeak
  const word = card?.word

  useEffect(() => {
    if (autoSpeak && word) speak(word)
  }, [turn, word, autoSpeak])

  // From the lesson bar: running the queue out with at least one answer completes the step.
  const finished = queue.length === 0
  useEffect(() => {
    if (finished && lessonStep && episodeId !== null && stats.answers > 0) {
      markLesson(episodeId, lessonStep)
    }
  }, [finished, lessonStep, episodeId, stats.answers])

  const flip = () => {
    setFlipped((f) => !f)
    setRevealed(true)
  }

  // `force` is for the on-card Đã thuộc / Chưa thuộc buttons, which may be
  // pressed without turning the card over first.
  const rate = (rating: Rating, force = false) => {
    if (!card || (!revealed && !force)) return
    const answeredAt = Date.now()
    const next = schedule(card, rating, answeredAt)
    rateCard(card.id, rating, answeredAt)

    setQueue((q) => {
      const rest = q.slice(1)
      if (next.state !== 'review') {
        rest.splice(Math.min(rest.length, REQUEUE_GAP), 0, card.id)
      }
      return rest
    })
    setStats((s) => ({
      ...s,
      answers: s.answers + 1,
      forgotten: s.forgotten + (rating === 'again' ? 1 : 0),
      learned: s.learned + (card.state === 'new' ? 1 : 0),
    }))
    setFlipped(false)
    setRevealed(false)
    setTurn((t) => t + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        flip()
      } else if (e.key === 'Escape') {
        onExit()
      } else if (revealed) {
        const rating = RATINGS[Number(e.key) - 1]
        if (rating) rate(rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) {
    return (
      <SessionSummary
        stats={stats}
        onExit={onExit}
        exitLabel={lessonStep ? 'Về bài nghe' : undefined}
      />
    )
  }

  return (
    <div className='min-h-full flex flex-col max-w-xl mx-auto px-4'>
      <SessionHeader queue={queue} cards={srs.cards} answers={stats.answers} onExit={onExit} />

      {episode ? (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          Bài {episode.id} · {episode.title}
        </p>
      ) : episodeId !== null && isCoreDeck(episodeId) ? (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          {coreDeckName(episodeId)}
        </p>
      ) : null}

      <div className='flex-1 flex flex-col justify-center py-3'>
        <Flashcard
          key={turn}
          card={card}
          flipped={flipped}
          canSwipe={revealed}
          example={examplesReady ? exampleOf(card) : null}
          synonyms={examplesReady ? synonymsOf(card) : []}
          collocations={examplesReady ? collocationsOf(card) : []}
          onFlip={flip}
          onAnswer={(rating) => rate(rating, true)}
        />
      </div>

      <footer className='pb-5 sm:pb-8 pt-2'>
        {revealed ? (
          <div className='grid grid-cols-4 gap-2 vocab-rise-in'>
            {RATINGS.map((rating) => {
              const style = RATING_STYLES[rating]
              return (
                <button
                  type='button'
                  key={rating}
                  onClick={() => rate(rating)}
                  className={classNames(
                    'flex flex-col items-center gap-0.5 py-3 rounded-2xl border font-semibold active:scale-95 transition',
                    style.className,
                  )}
                >
                  <span>{style.label}</span>
                  <span className='text-[11px] font-medium opacity-75'>
                    {formatDelay(previewDelay(card, rating, now))}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <button
            type='button'
            onClick={flip}
            className='w-full py-4 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold text-base shadow-lg active:scale-[0.99] transition'
          >
            Hiện nghĩa
          </button>
        )}
        <p className='mt-3 text-center text-xs text-zinc-400 hidden sm:block'>
          {revealed
            ? 'Space để lật lại · phím 1–4 để chấm · vuốt phải = Đã thuộc, vuốt trái = Chưa thuộc'
            : 'Nhấn Space để lật thẻ'}
        </p>
      </footer>
    </div>
  )
}
