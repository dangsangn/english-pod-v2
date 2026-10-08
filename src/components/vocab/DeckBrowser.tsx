import { useState } from 'react'
import type { ReactNode } from 'react'
import { Check, List, Loader2, Plus, Search } from 'lucide-react'
import classNames from 'classnames'
import { navigate } from '../../lib/hooks'
import { CORE_DECK_IDS, coreDeckName, coreGroup } from '../../lib/coreDecks'
import { addDeckById, removeDeck, useSrs } from '../../lib/srsStore'
import type { Episode } from '../../types'

const ALL = 'Tất cả'

type Status = 'loading' | 'error' | undefined

interface DeckBrowserProps {
  episodes: Episode[]
  onOpenEpisode: (id: number) => void
}

export default function DeckBrowser({ episodes, onOpenEpisode }: DeckBrowserProps) {
  const srs = useSrs()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState(ALL)
  const [status, setStatus] = useState<Record<number, Status>>({})

  const levels = [ALL, ...new Set(episodes.map((e) => e.level).filter(Boolean))]
  const q = query.trim().toLowerCase()
  const visible = episodes.filter(
    (e) =>
      (level === ALL || e.level === level) &&
      (!q || e.title.toLowerCase().includes(q) || String(e.id) === q),
  )

  const toggle = async (id: number) => {
    if (srs.decks.includes(id)) {
      removeDeck(id)
      return
    }
    setStatus((s) => ({ ...s, [id]: 'loading' }))
    try {
      await addDeckById(id)
      setStatus((s) => ({ ...s, [id]: undefined }))
    } catch {
      setStatus((s) => ({ ...s, [id]: 'error' }))
    }
  }

  return (
    <main className='max-w-2xl mx-auto px-4 pb-16'>
      <h1 className='pt-2 text-3xl font-bold tracking-tight'>Chọn bộ từ</h1>
      <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>
        Chọn nhóm 1000 từ phổ biến, hoặc thêm bài podcast bạn đã nghe để ôn lại từ vựng của bài.
      </p>

      <section className='mt-6'>
        <h2 className='text-lg font-bold tracking-tight'>1000 từ phổ biến</h2>
        <p className='mt-1 text-xs text-zinc-500 dark:text-zinc-400'>
          Những từ gặp nhiều nhất trong hội thoại, xếp theo{' '}
          <a
            href='https://www.newgeneralservicelist.com'
            target='_blank'
            rel='noreferrer'
            className='underline hover:text-rose-500'
          >
            NGSL 1.2
          </a>{' '}
          (Browne, Culligan &amp; Phillips, CC BY-SA 4.0) và tần suất trong EnglishPod.
        </p>
        <ul className='mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2'>
          {CORE_DECK_IDS.map((id) => (
            <DeckItem
              key={id}
              id={id}
              badge={`T${coreGroup(id)}`}
              title={coreDeckName(id)}
              detail='100 từ'
              error='Nhóm này đang được soạn'
              added={srs.decks.includes(id)}
              status={status[id]}
              onToggle={() => toggle(id)}
            />
          ))}
        </ul>
      </section>

      <h2 className='mt-8 text-lg font-bold tracking-tight'>Theo bài</h2>
      <div className='sticky top-16 z-10 -mx-4 px-4 pt-3 pb-3 bg-[#fbf6ef]/90 dark:bg-zinc-950/90 backdrop-blur-xl'>
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
        {visible.map((episode) => (
          <DeckItem
            key={episode.id}
            id={episode.id}
            badge={String(episode.id)}
            title={episode.title}
            detail={episode.level}
            error='Bài này chưa có từ vựng'
            added={srs.decks.includes(episode.id)}
            status={status[episode.id]}
            onTitle={() => onOpenEpisode(episode.id)}
            onToggle={() => toggle(episode.id)}
          />
        ))}
        {visible.length === 0 && (
          <li className='py-12 text-center text-sm text-zinc-500'>Không tìm thấy bài nào.</li>
        )}
      </ul>
    </main>
  )
}

interface DeckItemProps {
  id: number
  badge: string
  title: string
  detail: string
  /** Shown instead of `detail` when adding the deck failed. */
  error: string
  added: boolean
  status: Status
  /** Episodes open the podcast; without it the title is plain text. */
  onTitle?: () => void
  onToggle: () => void
}

function DeckItem({
  id,
  badge,
  title,
  detail,
  error,
  added,
  status,
  onTitle,
  onToggle,
}: DeckItemProps) {
  const text: ReactNode = (
    <>
      <p className='font-medium truncate'>{title}</p>
      <p
        className={classNames(
          'text-xs',
          status === 'error'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-zinc-500 dark:text-zinc-400',
        )}
      >
        {status === 'error' ? error : detail}
      </p>
    </>
  )
  return (
    <li className='flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/[0.03] dark:border-white/5'>
      <div className='w-10 h-10 flex-none rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold tabular-nums text-zinc-500 dark:text-zinc-400'>
        {badge}
      </div>
      {onTitle ? (
        <button
          type='button'
          onClick={onTitle}
          title='Nghe bài này'
          className='flex-1 min-w-0 text-left hover:text-rose-600 dark:hover:text-rose-400 transition-colors'
        >
          {text}
        </button>
      ) : (
        <div className='flex-1 min-w-0'>{text}</div>
      )}
      {added && (
        <button
          type='button'
          onClick={() => navigate(`vocab/episode/${id}`)}
          title='Danh sách từ vựng'
          className='w-9 h-9 flex-none rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:text-zinc-400 dark:hover:bg-rose-500/10'
        >
          <List size={18} />
        </button>
      )}
      <button
        type='button'
        onClick={onToggle}
        disabled={status === 'loading'}
        title={added ? 'Bỏ khỏi vườn' : 'Thêm vào vườn'}
        className={classNames(
          'w-9 h-9 flex-none rounded-full flex items-center justify-center transition-colors',
          added
            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20',
        )}
      >
        {status === 'loading' ? (
          <Loader2 size={18} className='animate-spin' />
        ) : added ? (
          <Check size={18} />
        ) : (
          <Plus size={18} />
        )}
      </button>
    </li>
  )
}
