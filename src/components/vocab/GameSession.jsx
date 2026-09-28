import { useEffect, useState } from 'react'
import { schedule } from '../../lib/srs'
import { buildQueue, getSrsState, rateCard, useSrs } from '../../lib/srsStore'
import { gradeFor, makeQuestion } from '../../lib/quiz'
import { canSpeak } from '../../lib/speech'
import ChoiceQuestion from './ChoiceQuestion'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import SpellQuestion from './SpellQuestion'

// As in StudySession: a card still learning comes back after a few others.
const REQUEUE_GAP = 3

/**
 * The head of `queue` with its question. Cards nothing can be asked about (see
 * quiz.makeQuestion) are dropped from this game; flashcards still cover them.
 */
function nextRound(srs, queue, recent) {
  const pool = Object.values(srs.cards)
  let rest = queue
  while (rest.length) {
    const card = srs.cards[rest[0]]
    const question = card ? makeQuestion(card, pool, recent, { canSpeak }) : null
    if (question) return { queue: rest, question, recent }
    rest = rest.slice(1)
  }
  return { queue: rest, question: null, recent }
}

export default function GameSession({ episodeId, episode, onExit }) {
  const srs = useSrs()
  const [round, setRound] = useState(() =>
    nextRound(srs, buildQueue(srs, Date.now(), episodeId), []),
  )
  // Bumped on every answer: it keys the question so the same card twice in a
  // row still remounts fresh.
  const [turn, setTurn] = useState(0)
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    answers: 0,
    forgotten: 0,
    learned: 0,
  }))

  const { queue, question, recent } = round
  const card = question ? srs.cards[queue[0]] : null

  const answer = (result) => {
    if (!card) return
    const rating = gradeFor(result)
    const answeredAt = Date.now()
    const next = schedule(card, rating, answeredAt)
    rateCard(card.id, rating, answeredAt)

    const rest = queue.slice(1)
    if (next.state !== 'review') {
      rest.splice(Math.min(rest.length, REQUEUE_GAP), 0, card.id)
    }
    // Read the store again: `srs` from this render predates the rating above.
    setRound(nextRound(getSrsState(), rest, [...recent, question.kind].slice(-2)))
    setStats((s) => ({
      ...s,
      answers: s.answers + 1,
      forgotten: s.forgotten + (rating === 'again' ? 1 : 0),
      learned: s.learned + (card.state === 'new' ? 1 : 0),
    }))
    setTurn((t) => t + 1)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  if (!card) {
    return <SessionSummary stats={stats} onExit={onExit} />
  }

  return (
    <div className='min-h-full flex flex-col max-w-xl mx-auto px-4'>
      <SessionHeader queue={queue} cards={srs.cards} answers={stats.answers} onExit={onExit} />

      {episode && (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          Bài {episode.id} · {episode.title}
        </p>
      )}

      <div className='flex-1 flex flex-col justify-center py-6'>
        {question.kind === 'spell' ? (
          <SpellQuestion key={turn} card={card} onDone={answer} />
        ) : (
          <ChoiceQuestion
            key={turn}
            card={card}
            kind={question.kind}
            options={question.options}
            answerIndex={question.answerIndex}
            autoSpeak={srs.settings.autoSpeak}
            onDone={answer}
          />
        )}
      </div>

      <p className='pb-8 text-center text-xs text-zinc-400 hidden sm:block'>
        {question.kind === 'spell'
          ? 'Enter để kiểm tra · Esc để thoát'
          : 'Phím 1–4 để chọn · Enter để tiếp · Esc để thoát'}
      </p>
    </div>
  )
}
