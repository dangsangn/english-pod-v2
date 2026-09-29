import { useEffect, useRef, useState } from 'react'
import { PlayCircle, Search } from 'lucide-react'
import classNames from 'classnames'
import type { Episode } from '../types'

interface EpisodeListProps {
  episodes: Episode[]
  currentId: number
  onSelect: (id: number) => void
}

export default function EpisodeList({ episodes, currentId, onSelect }: EpisodeListProps) {
  const [search, setSearch] = useState('')
  const currentRef = useRef<HTMLButtonElement>(null)

  // Keep the playing episode in view when it changes (next/previous, sync).
  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentId])

  const query = search.trim().toLowerCase()
  const filtered = query
    ? episodes.filter(
        (ep) =>
          ep.title.toLowerCase().includes(query) || ep.original_title.toLowerCase().includes(query),
      )
    : episodes

  return (
    <div className='flex flex-col flex-1 min-h-0 bg-zinc-50/50 dark:bg-zinc-900/50'>
      <div className='p-4 border-b border-zinc-200 dark:border-zinc-800/50'>
        <div className='relative'>
          <Search className='absolute left-3 top-2.5 text-zinc-400' size={16} />
          <input
            type='search'
            aria-label='Search episodes'
            placeholder='Search episodes...'
            className='w-full bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-zinc-900 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ul className='flex-1 overflow-y-auto'>
        {filtered.map((ep) => {
          const current = ep.id === currentId
          return (
            <li key={ep.id}>
              <button
                type='button'
                ref={current ? currentRef : undefined}
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(ep.id)}
                className={classNames(
                  'w-full text-left p-4 border-b border-l-4 border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/40 transition-colors flex items-center gap-3 group',
                  current
                    ? 'bg-indigo-50 dark:bg-zinc-800/60 border-l-indigo-500'
                    : 'border-l-transparent',
                )}
              >
                <div
                  className={classNames(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors',
                    current
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
                  )}
                >
                  {current ? (
                    <PlayCircle size={20} />
                  ) : (
                    <span className='text-xs font-bold font-mono'>{ep.id}</span>
                  )}
                </div>
                <div className='flex-1 min-w-0'>
                  <h3
                    className={classNames(
                      'text-sm font-medium truncate transition-colors',
                      current
                        ? 'text-indigo-700 dark:text-indigo-200'
                        : 'text-zinc-700 dark:text-zinc-300',
                    )}
                  >
                    {ep.title}
                  </h3>
                  <p className='text-xs text-zinc-500 mt-0.5 truncate'>{ep.level}</p>
                </div>
              </button>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className='p-8 text-center text-zinc-500 text-sm'>No episodes found.</li>
        )}
      </ul>
    </div>
  )
}
