import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import classNames from 'classnames'
import { navigate } from '../lib/hooks'
import { addEpisodeDeck, LESSON_STEPS, markLesson, nextLessonStep, useSrs } from '../lib/srsStore'
import type { LessonStep } from '../lib/srsStore'
import type { Episode } from '../types'

const LABELS: Record<LessonStep, string> = {
  preview: 'Xem trước',
  listen: 'Nghe',
  review: 'Ôn',
  relisten: 'Nghe lại',
}

interface LessonStepsProps {
  episode: Episode
  /** Nghe / Nghe lại: play the episode (from the top unless it is playing). */
  onListen: () => void
}

/**
 * The episode's lesson loop: preview its words, listen, review the words,
 * listen again. Any step can be pressed at any time; the next one stands out.
 * Progress is in the synced store (srsStore.lessons): the study steps are
 * marked by their session's summary screen, the listening steps when the
 * audio plays to the end (srsStore.listenedTo) or by "Đã nghe xong".
 */
export default function LessonSteps({ episode, onListen }: LessonStepsProps) {
  const srs = useSrs()
  const progress = srs.lessons[episode.id]
  const next = nextLessonStep(progress)
  const [status, setStatus] = useState<{ id: number | null; state: 'idle' | 'loading' | 'error' }>({
    id: null,
    state: 'idle',
  })
  // Reset automatically when the episode changes.
  const state = status.id === episode.id ? status.state : 'idle'

  // The study steps need the episode's words: add its deck on first use.
  const study = async (page: 'study' | 'play') => {
    if (!srs.decks.includes(episode.id)) {
      setStatus({ id: episode.id, state: 'loading' })
      try {
        await addEpisodeDeck(episode)
      } catch {
        setStatus({ id: episode.id, state: 'error' })
        return
      }
      setStatus({ id: episode.id, state: 'idle' })
    }
    navigate(`vocab/${page}/${episode.id}/lesson`)
  }

  const press = (step: LessonStep) => {
    if (step === 'preview') study('study')
    else if (step === 'review') study('play')
    else onListen()
  }

  return (
    <div className='space-y-2'>
      <ol className='flex flex-wrap items-center gap-1.5' aria-label='Vòng học bài này'>
        {LESSON_STEPS.map((step, index) => {
          const done = progress?.[step] !== undefined
          const loading = state === 'loading' && (step === 'preview' || step === 'review')
          return (
            <li key={step}>
              <button
                type='button'
                onClick={() => press(step)}
                disabled={loading}
                aria-current={step === next ? 'step' : undefined}
                className={classNames(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60',
                  step === next
                    ? 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/25'
                      : 'bg-white/50 text-zinc-600 border-zinc-200 hover:bg-white dark:bg-zinc-800/50 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800',
                )}
              >
                {loading ? (
                  <Loader2 size={12} className='animate-spin' />
                ) : done ? (
                  <Check size={12} />
                ) : (
                  <span className='tabular-nums'>{index + 1}</span>
                )}
                {LABELS[step]}
              </button>
            </li>
          )
        })}
      </ol>
      {(next === 'listen' || next === 'relisten') && (
        <button
          type='button'
          onClick={() => markLesson(episode.id, next)}
          className='text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400'
        >
          Đã nghe xong
        </button>
      )}
      {state === 'error' && (
        <p className='text-xs text-zinc-500 dark:text-zinc-400'>Bài này chưa có từ vựng</p>
      )}
    </div>
  )
}
