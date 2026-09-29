import { useState } from 'react'
import { Check, List, Loader2, Plus, Search } from 'lucide-react'
import classNames from 'classnames'
import { navigate } from '../../lib/hooks'
import { addEpisodeDeck, removeDeck, useSrs } from '../../lib/srsStore'
import type { Episode } from '../../types'

const ALL = 'Tất cả'

interface DeckBrowserProps {
  episodes: Episode[]
  onOpenEpisode: (id: number) => void
}

export default function DeckBrowser({ episodes, onOpenEpisode }: DeckBrowserProps) {
  const srs = useSrs()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState(ALL)
  const [status, setStatus] = useState<Record<number, 'loading' | 'error' | undefined>>({})

  const levels = [ALL, ...new Set(episodes.map((e) => e.level).filter(Boolean))]
  const q = query.trim().toLowerCase()
  const visible = episodes.filter(
    (e) =>
      (level === ALL || e.level === level) &&
      (!q || e.title.toLowerCase().includes(q) || String(e.id) === q),
  )

  const toggle = async (episode: Episode) => {
    if (srs.decks.includes(episode.id)) {
      removeDeck(episode.id)
      return
    }
    setStatus((s) => ({ ...s, [episode.id]: 'loading' }))
    try {
      await addEpisodeDeck(episode)
      setStatus((s) => ({ ...s, [episode.id]: undefined }))
    } catch {
      setStatus((s) => ({ ...s, [episode.id]: 'error' }))
    }
  }

  return (
    <main className='max-w-2xl mx-auto px-4 pb-16'>
      <h1 className='pt-2 text-3xl font-bold tracking-tight'>Chọn bộ từ</h1>
      <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>
        Mỗi bài podcast là một bộ từ. Thêm bài bạn đã nghe để ôn lại từ vựng.
      </p>

      <div className='sticky top-16 z-10 -mx-4 px-4 pt-4 pb-3 bg-[#fbf6ef]/90 dark:bg-zinc-950/90 backdrop-blur-xl'>
        <label className='flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 focus-within:ring-2 focus-within:ring-rose-300 dark:focus-within:ring-rose-500/40'>
          <Search size={18} className='text-zinc-400' />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Tìm theo tên hoặc số bài…'
            className='flex-1 bg-transparent outline-none text-base placeholder:text-zinc-400'
          />
        </label>
        <div className='mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4'>
          {levels.map((l) => (
            <button
              type='button'
              key={l}
              onClick={() => setLevel(l)}
              className={classNames(
                'flex-none px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors',
                level === l
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <ul className='mt-2 space-y-2'>
        {visible.map((episode) => {
          const added = srs.decks.includes(episode.id)
          const state = status[episode.id]
          return (
            <li
              key={episode.id}
              className='flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/[0.03] dark:border-white/5'
            >
              <div className='w-10 h-10 flex-none rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold tabular-nums text-zinc-500 dark:text-zinc-400'>
                {episode.id}
              </div>
              <button
                type='button'
                onClick={() => onOpenEpisode(episode.id)}
                title='Nghe bài này'
                className='flex-1 min-w-0 text-left hover:text-rose-600 dark:hover:text-rose-400 transition-colors'
              >
                <p className='font-medium truncate'>{episode.title}</p>
                <p
                  className={classNames(
                    'text-xs',
                    state === 'error'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  {state === 'error' ? 'Bài này chưa có từ vựng' : episode.level}
                </p>
              </button>
              {added && (
                <button
                  type='button'
                  onClick={() => navigate(`vocab/episode/${episode.id}`)}
                  title='Danh sách từ vựng'
                  className='w-9 h-9 flex-none rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:text-zinc-400 dark:hover:bg-rose-500/10'
                >
                  <List size={18} />
                </button>
              )}
              <button
                type='button'
                onClick={() => toggle(episode)}
                disabled={state === 'loading'}
                title={added ? 'Bỏ khỏi vườn' : 'Thêm vào vườn'}
                className={classNames(
                  'w-9 h-9 flex-none rounded-full flex items-center justify-center transition-colors',
                  added
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20',
                )}
              >
                {state === 'loading' ? (
                  <Loader2 size={18} className='animate-spin' />
                ) : added ? (
                  <Check size={18} />
                ) : (
                  <Plus size={18} />
                )}
              </button>
            </li>
          )
        })}
        {visible.length === 0 && (
          <li className='py-12 text-center text-sm text-zinc-500'>Không tìm thấy bài nào.</li>
        )}
      </ul>
    </main>
  )
}
