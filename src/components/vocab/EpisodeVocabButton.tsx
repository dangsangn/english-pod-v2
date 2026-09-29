import { useState } from 'react'
import { Flower2, Loader2 } from 'lucide-react'
import { navigate } from '../../lib/hooks'
import { addEpisodeDeck, useSrs } from '../../lib/srsStore'
import type { Episode } from '../../types'

/** "Study this episode's words" — adds the deck on first use, then opens it. */
export default function EpisodeVocabButton({ episode }: { episode: Episode }) {
  const srs = useSrs()
  const [status, setStatus] = useState<{ id: number | null; state: 'idle' | 'loading' | 'error' }>({
    id: null,
    state: 'idle',
  })
  // Reset automatically when the episode changes.
  const state = status.id === episode.id ? status.state : 'idle'

  const open = async () => {
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
    navigate(`vocab/study/${episode.id}`)
  }

  if (state === 'error') {
    return (
      <span className='inline-block px-3 py-1 rounded-full text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800'>
        Bài này chưa có từ vựng
      </span>
    )
  }

  return (
    <button
      onClick={open}
      disabled={state === 'loading'}
      className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-200 dark:hover:bg-rose-500/30 transition-colors disabled:opacity-60'
    >
      {state === 'loading' ? <Loader2 size={12} className='animate-spin' /> : <Flower2 size={12} />}
      Học từ vựng bài này
    </button>
  )
}
