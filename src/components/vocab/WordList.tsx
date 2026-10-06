import { useState } from 'react'
import { Check, ChevronDown, Headphones, Play, RotateCcw, Search, Volume2 } from 'lucide-react'
import classNames from 'classnames'
import { navigate, useNow } from '../../lib/hooks'
import { formatDelay, isDue, isLeech, stageOf } from '../../lib/srs'
import type { Stage } from '../../lib/srs'
import { relearnCard, summarize, useSrs } from '../../lib/srsStore'
import type { StoredCard, Summary } from '../../lib/srsStore'
import type { Episode } from '../../types'
import { speak } from '../../lib/speech'
import { STAGES } from './stages'
import TappableText from '../TappableText'
import LeechBadge from './LeechBadge'

type FilterKey = 'all' | 'learned' | 'leech' | Stage
type SortKey = keyof typeof SORTERS

// "learned" = every card that has been studied at least once.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'learned', label: 'Đã học' },
  ...STAGES.filter((s) => s.key !== 'seed').map((s) => ({ key: s.key, label: s.label })),
  { key: 'seed', label: 'Chưa học' },
  { key: 'leech', label: 'Hay quên' },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'lesson', label: 'Theo bài' },
  { key: 'due', label: 'Ôn sớm nhất' },
  { key: 'recent', label: 'Mới học' },
  { key: 'alpha', label: 'A–Z' },
]

type Sorter = (a: StoredCard, b: StoredCard) => number

const SORTERS = {
  lesson: (a, b) => a.addedAt - b.addedAt,
  due: (a, b) => a.due - b.due,
  recent: (a, b) => (b.lastReview ?? 0) - (a.lastReview ?? 0),
  alpha: (a, b) => a.word.localeCompare(b.word),
} satisfies Record<string, Sorter>

function matches(card: StoredCard, key: FilterKey): boolean {
  if (key === 'all') return true
  if (key === 'learned') return card.state !== 'new'
  if (key === 'leech') return isLeech(card)
  return stageOf(card) === key
}

/**
 * Words in the garden. With `episode`, only that episode's words — every one of
 * them by default, so a finished deck can still be looked through.
 */
interface WordListProps {
  episode?: Episode | null
  /** From the route, so any string; unknown ones fall back to the default. */
  initialFilter?: string
  onOpenEpisode: (id: number) => void
}

export default function WordList({ episode = null, initialFilter, onOpenEpisode }: WordListProps) {
  const srs = useSrs()
  const now = useNow()
  const [filter, setFilter] = useState<FilterKey>(
    FILTERS.some((f) => f.key === initialFilter)
      ? (initialFilter as FilterKey)
      : episode
        ? 'all'
        : 'learned',
  )
  const [sort, setSort] = useState<SortKey>(episode ? 'lesson' : 'due')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const all = Object.values(srs.cards).filter((c) => !episode || c.episodeIds.includes(episode.id))
  const countOf = (key: FilterKey) => all.filter((c) => matches(c, key)).length

  const q = query.trim().toLowerCase()
  const words = all
    .filter((c) => matches(c, filter))
    .filter(
      (c) => !q || [c.word, c.vi, c.def].some((text) => (text || '').toLowerCase().includes(q)),
    )
    .sort(SORTERS[sort])

  return (
    <main className='max-w-2xl mx-auto px-4 pb-16'>
      {episode ? (
        <EpisodeHeader
          episode={episode}
          counts={summarize(srs, now, episode.id)}
          onOpenEpisode={onOpenEpisode}
        />
      ) : (
        <>
          <h1 className='pt-2 text-3xl font-bold tracking-tight'>Danh sách từ</h1>
          <p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>
            {countOf('learned')} / {all.length} từ đã học
          </p>
        </>
      )}

      <div className='sticky top-16 z-10 -mx-4 px-4 pt-4 pb-3 bg-[#fbf6ef]/90 dark:bg-zinc-950/90 backdrop-blur-xl'>
        <label className='flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 focus-within:ring-2 focus-within:ring-rose-300 dark:focus-within:ring-rose-500/40'>
          <Search size={18} className='text-zinc-400' />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Tìm từ hoặc nghĩa (Anh / Việt)…'
            className='flex-1 bg-transparent outline-none text-base placeholder:text-zinc-400'
          />
        </label>
        <div className='mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4'>
          {FILTERS.map((f) => (
            <button
              type='button'
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={classNames(
                'flex-none px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors',
                filter === f.key
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
              )}
            >
              {f.label} <span className='opacity-60 tabular-nums'>{countOf(f.key)}</span>
            </button>
          ))}
        </div>
        <div className='mt-2 flex items-center gap-1 text-xs'>
          <span className='text-zinc-400 mr-1'>Sắp xếp:</span>
          {SORTS.map((s) => (
            <button
              type='button'
              key={s.key}
              onClick={() => setSort(s.key)}
              className={classNames(
                'px-2.5 py-1 rounded-full font-medium',
                sort === s.key
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                  : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ul className='mt-2 space-y-2'>
        {words.map((card) => (
          <WordRow
            key={card.id}
            card={card}
            now={now}
            open={openId === card.id}
            onToggle={() => setOpenId(openId === card.id ? null : card.id)}
          />
        ))}
        {words.length === 0 && (
          <li className='py-16 text-center text-sm text-zinc-500'>
            {q
              ? 'Không tìm thấy từ nào.'
              : filter === 'learned'
                ? 'Bạn chưa học từ nào. Bắt đầu một lượt học nhé 🌱'
                : filter === 'leech'
                  ? 'Không có từ nào hay quên 🎉'
                  : 'Chưa có từ nào ở mục này.'}
          </li>
        )}
      </ul>
    </main>
  )
}

interface EpisodeHeaderProps {
  episode: Episode
  counts: Summary
  onOpenEpisode: (id: number) => void
}

function EpisodeHeader({ episode, counts, onOpenEpisode }: EpisodeHeaderProps) {
  const toStudy = counts.due + counts.seed
  return (
    <div className='pt-2'>
      <p className='text-sm font-medium text-rose-500 dark:text-rose-400'>
        Bài {episode.id} · {episode.level}
      </p>
      <h1 className='mt-1 text-3xl font-bold tracking-tight'>
        <button
          type='button'
          onClick={() => onOpenEpisode(episode.id)}
          title='Nghe bài này'
          className='text-left hover:text-rose-600 dark:hover:text-rose-400 transition-colors'
        >
          {episode.title}
          <Headphones size={20} className='inline ml-2 -mt-1 opacity-50' />
        </button>
      </h1>
      <div className='mt-4 flex items-center gap-3'>
        <p className='flex-1 text-sm text-zinc-500 dark:text-zinc-400'>
          {counts.total - counts.seed} / {counts.total} từ đã học · {counts.bloom} đã nở hoa
        </p>
        {counts.total > 0 && (
          <button
            type='button'
            onClick={() => navigate(`vocab/study/${episode.id}`)}
            className='flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/25'
          >
            <Play size={14} fill='currentColor' /> {toStudy ? `Học ${toStudy} thẻ` : 'Ôn thêm'}
          </button>
        )}
      </div>
    </div>
  )
}

function RelearnButton({ card, now }: { card: StoredCard; now: number }) {
  // Already sent back and waiting at the first step: show that instead of
  // offering the same thing again.
  const queued =
    (card.state === 'learning' || card.state === 'relearning') &&
    card.step === 0 &&
    isDue(card, now)

  if (queued) {
    return (
      <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-rose-400 dark:text-rose-400/80'>
        <Check size={12} /> Chờ học lại
      </span>
    )
  }

  return (
    <button
      type='button'
      onClick={() => relearnCard(card.id)}
      title='Đưa từ này vào lượt học tiếp theo'
      className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/20 transition-colors'
    >
      <RotateCcw size={12} /> Học lại
    </button>
  )
}

interface WordRowProps {
  card: StoredCard
  now: number
  open: boolean
  onToggle: () => void
}

function WordRow({ card, now, open, onToggle }: WordRowProps) {
  let next: { text: string; tone: string }
  if (card.state === 'new') next = { text: 'Chưa học', tone: 'text-zinc-400' }
  else if (isDue(card, now)) next = { text: 'Cần ôn', tone: 'text-rose-500 font-semibold' }
  else
    next = {
      text: `Ôn sau ${formatDelay(card.due - now)}`,
      tone: 'text-zinc-500 dark:text-zinc-400',
    }

  return (
    <li className='rounded-2xl bg-white dark:bg-zinc-900 border border-black/[0.03] dark:border-white/5'>
      <div className='flex items-start gap-3 p-3'>
        <button
          type='button'
          onClick={() => speak(card.word)}
          title='Nghe phát âm'
          className='w-9 h-9 mt-0.5 flex-none rounded-full flex items-center justify-center bg-rose-50 text-rose-500 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20'
        >
          <Volume2 size={16} />
        </button>
        <button type='button' onClick={onToggle} className='flex-1 min-w-0 text-left'>
          <div className='min-w-0'>
            <p className='truncate'>
              <span className='font-semibold text-emerald-600 dark:text-emerald-400'>
                {card.word}
              </span>
              {card.ipa && (
                <span className='ml-2 text-xs text-zinc-400 dark:text-zinc-500'>/{card.ipa}/</span>
              )}
              {isLeech(card) && (
                <LeechBadge className='ml-2 align-middle px-2! py-0.5! text-[11px]!' />
              )}
            </p>
            {card.type && (
              <p className='text-xs italic text-zinc-500 dark:text-zinc-400 truncate'>
                {card.type}
              </p>
            )}
            <p className='vi-text text-sm text-indigo-600 dark:text-indigo-400 truncate'>
              {card.vi}
            </p>
          </div>
        </button>
        {/* Top-right corner: Học lại, with when the word is next due below it. */}
        <div className='flex-none flex flex-col items-end gap-1'>
          {card.state !== 'new' && <RelearnButton card={card} now={now} />}
          <button type='button' onClick={onToggle} className='flex items-center gap-1'>
            <span className={classNames('text-[11px]', next.tone)}>{next.text}</span>
            <ChevronDown
              size={16}
              className={classNames('text-zinc-400 transition-transform', open && 'rotate-180')}
            />
          </button>
        </div>
      </div>

      {open && (
        <div className='px-4 pb-4 pl-15 text-sm space-y-1.5 vocab-rise-in'>
          {(card.def || card.viDef) && (
            <div>
              {card.def && (
                <TappableText text={card.def} className='text-zinc-700 dark:text-zinc-300' />
              )}
              {card.viDef && (
                <p className='vi-text text-indigo-600 dark:text-indigo-400 font-medium'>
                  {card.viDef}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
