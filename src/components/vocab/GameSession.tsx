import { useEffect, useState } from 'react'
import { isLeech, schedule } from '../../lib/srs'
import { buildQueue, getSrsState, markLesson, rateCard, useSrs } from '../../lib/srsStore'
import { gradeFor, makeQuestion } from '../../lib/quiz'
import type { Question, QuestionKind } from '../../lib/quiz'
import type { SrsState } from '../../lib/srsStore'
import type { Episode } from '../../types'
import { canSpeak } from '../../lib/speech'
import { episodeIdsOf, exampleOf, useExamples } from '../../lib/examples'
import ChoiceQuestion from './ChoiceQuestion'
import ClozeQuestion from './ClozeQuestion'
import DictationQuestion from './DictationQuestion'
import SessionHeader from './SessionHeader'
import SessionSummary from './SessionSummary'
import type { SessionStats } from './SessionSummary'
import SpellQuestion from './SpellQuestion'

// As in StudySession: a card still learning comes back after a few others.
const REQUEUE_GAP = 3

// Answered by typing, so the keyboard hint differs.
const TYPED_KINDS: QuestionKind[] = ['spell', 'cloze', 'dictation']

/**
 * The head of `queue` with its question. Cards nothing can be asked about (see
 * quiz.makeQuestion) are dropped from this game; flashcards still cover them.
 */
interface Round {
  queue: string[]
  question: Question | null
  recent: QuestionKind[]
}

function nextRound(srs: SrsState, queue: string[], recent: QuestionKind[]): Round {
  const pool = Object.values(srs.cards)
  let rest = queue
  while (rest.length) {
    const card = srs.cards[rest[0]]
    const question = card
      ? makeQuestion(card, pool, recent, { canSpeak, hasExample: exampleOf(card) !== null })
      : null
    if (question) return { queue: rest, question, recent }
    rest = rest.slice(1)
  }
  return { queue: rest, question: null, recent }
}

export interface SessionProps {
  episodeId: number | null
  episode: Episode | undefined
  /** Opened from the episode page's lesson bar: the step the session completes. */
  lessonStep?: 'preview' | 'review'
  onExit: () => void
}

export default function GameSession({ episodeId, episode, lessonStep, onExit }: SessionProps) {
  const srs = useSrs()
  // Which kinds a card can be asked depends on its example sentence, so the
  // first question waits for the examples of the session's episodes.
  const [start] = useState(() => {
    const queue = buildQueue(srs, Date.now(), episodeId)
    return { queue, episodeIds: episodeIdsOf(queue.map((id) => srs.cards[id])) }
  })
  const examplesReady = useExamples(start.episodeIds)
  const [round, setRound] = useState<Round | null>(null)
  if (examplesReady && round === null) setRound(nextRound(srs, start.queue, []))
  // Bumped on every answer: it keys the question so the same card twice in a
  // row still remounts fresh.
  const [turn, setTurn] = useState(0)
  const [stats, setStats] = useState<SessionStats>(() => ({
    startedAt: Date.now(),
    answers: 0,
    forgotten: 0,
    learned: 0,
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  // From the lesson bar: reaching the summary with at least one answer completes the step.
  const finished = round !== null && round.question === null
  useEffect(() => {
    if (finished && lessonStep && episodeId !== null && stats.answers > 0) {
      markLesson(episodeId, lessonStep)
    }
  }, [finished, lessonStep, episodeId, stats.answers])

  if (!round) {
    return (
      <div className='py-24 text-center text-sm text-zinc-500'>
        <p>Đang chuẩn bị…</p>
        <button type='button' onClick={onExit} className='mt-4 font-semibold underline'>
          Thoát
        </button>
      </div>
    )
  }

  const { queue, question, recent } = round
  const card = question ? srs.cards[queue[0]] : null

  const answer = (result: Parameters<typeof gradeFor>[0]) => {
    if (!card || !question) return
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

  if (!card || !question) {
    return (
      <SessionSummary
        stats={stats}
        onExit={onExit}
        exitLabel={lessonStep ? 'Về bài nghe' : undefined}
      />
    )
  }

  const example = exampleOf(card)
  // Words forgotten again and again get their sentence whatever the question.
  const extra = isLeech(card) ? example : null

  return (
    <div className='min-h-full flex flex-col max-w-xl mx-auto px-4'>
      <SessionHeader queue={queue} cards={srs.cards} answers={stats.answers} onExit={onExit} />

      {episode && (
        <p className='text-center text-xs font-medium text-zinc-500 dark:text-zinc-400'>
          Bài {episode.id} · {episode.title}
        </p>
      )}

      <div className='flex-1 flex flex-col justify-center py-6'>
        {question.kind === 'cloze' && example ? (
          <ClozeQuestion key={turn} card={card} example={example} onDone={answer} />
        ) : question.kind === 'dictation' && example ? (
          <DictationQuestion key={turn} card={card} example={example} onDone={answer} />
        ) : question.kind === 'meaning' || question.kind === 'listen' ? (
          <ChoiceQuestion
            key={turn}
            card={card}
            kind={question.kind}
            options={question.options}
            answerIndex={question.answerIndex}
            autoSpeak={srs.settings.autoSpeak}
            example={extra}
            onDone={answer}
          />
        ) : (
          <SpellQuestion key={turn} card={card} example={extra} onDone={answer} />
        )}
      </div>

      <p className='pb-8 text-center text-xs text-zinc-400 hidden sm:block'>
        {TYPED_KINDS.includes(question.kind)
          ? 'Enter để kiểm tra · Esc để thoát'
          : 'Phím 1–4 để chọn · Enter để tiếp · Esc để thoát'}
      </p>
    </div>
  )
}
