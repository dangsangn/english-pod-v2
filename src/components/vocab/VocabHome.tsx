import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ChevronRight,
  Flame,
  Gamepad2,
  Headphones,
  List,
  Play,
  Plus,
  Sprout,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import classNames from 'classnames'
import { navigate, useNow } from '../../lib/hooks'
import { dayKey, formatDelay } from '../../lib/srs'
import {
  addEpisodeDeck,
  removeDeck,
  streakOf,
  summarize,
  updateSettings,
  useSrs,
} from '../../lib/srsStore'
import type { Settings as SrsSettings, Summary } from '../../lib/srsStore'
import { MIN_POOL } from '../../lib/quiz'
import { STAGES } from './stages'
import type { StageStyle } from './stages'
import type { Episode } from '../../types'

const PLAY_NEEDS = `Cần ít nhất ${MIN_POOL} từ trong vườn để chơi`
// The choices for Từ mới mỗi ngày; null is no limit.
const NEW_PER_DAY_CHOICES = [5, 10, 15, 20, 30, null]

interface VocabHomeProps {
  episodes: Episode[]
  onOpenEpisode: (id: number) => void
}

export default function VocabHome({ episodes, onOpenEpisode }: VocabHomeProps) {
  const srs = useSrs()
  const now = useNow()

  const overall = summarize(srs, now)
  const streak = streakOf(srs, now)
  const doneToday = srs.days[dayKey(now)]?.reviews || 0
  const goal = doneToday + overall.due + overall.freshToday
  // The games draw wrong answers from the whole garden, so they need a few words.
  const canPlay = Object.keys(srs.cards).length >= MIN_POOL

  const nextDue = Object.values(srs.cards)
    .filter((c) => c.state !== 'new' && c.due > now)
    .reduce((min, c) => Math.min(min, c.due), Infinity)

  // By episode number, not by the order the decks were added in.
  const decks = srs.decks
    .map((id) => episodes.find((e) => e.id === id))
    .filter((e): e is Episode => Boolean(e))
    .sort((a, b) => a.id - b.id)

  return (
    <main className='max-w-2xl mx-auto px-4 pb-16 space-y-8'>
      <section className='pt-2'>
        <p className='text-sm font-medium text-rose-500 dark:text-rose-400'>{greeting(now)}</p>
        <h1 className='mt-1 text-3xl font-bold tracking-tight'>Vườn từ vựng</h1>
      </section>

      {decks.length === 0 ? (
        <EmptyGarden firstEpisode={episodes[0]} />
      ) : (
        <>
          <TodayCard
            streak={streak}
            doneToday={doneToday}
            goal={goal}
            due={overall.due}
            fresh={overall.freshToday}
            capReached={overall.seed > 0 && overall.freshToday === 0}
            newPerDay={srs.settings.newPerDay}
            ahead={overall.ahead}
            nextDue={nextDue === Infinity ? null : nextDue - now}
            canPlay={canPlay}
          />

          <section>
            <div className='flex items-center justify-between'>
              <SectionTitle>Khu vườn của bạn</SectionTitle>
              <button
                type='button'
                onClick={() => navigate('vocab/words')}
                className='flex items-center gap-1 -mt-3 px-3 py-1.5 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10'
              >
                <List size={16} /> Danh sách từ
              </button>
            </div>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              {STAGES.map((stage) => (
                <StageTile key={stage.key} stage={stage} count={overall[stage.key]} />
              ))}
            </div>
          </section>

          <section>
            <div className='flex items-center justify-between'>
              <SectionTitle>Bộ từ ({decks.length})</SectionTitle>
              <button
                type='button'
                onClick={() => navigate('vocab/decks')}
                className='flex items-center gap-1 -mt-3 px-3 py-1.5 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/10'
              >
                <Plus size={16} /> Thêm bộ từ
              </button>
            </div>
            <ul className='space-y-3'>
              {decks.map((episode) => (
                <DeckRow
                  key={episode.id}
                  episode={episode}
                  onOpenEpisode={onOpenEpisode}
                  counts={summarize(srs, now, episode.id)}
                  canPlay={canPlay}
                />
              ))}
            </ul>
          </section>

          <Settings settings={srs.settings} />
        </>
      )}
    </main>
  )
}

function StageTile({ stage, count }: { stage: StageStyle; count: number }) {
  const { Icon } = stage
  return (
    <button
      type='button'
      onClick={() => navigate(`vocab/words/${stage.key}`)}
      className='text-left rounded-3xl bg-white dark:bg-zinc-900 p-4 shadow-sm shadow-rose-900/5 border border-black/[0.03] dark:border-white/5 hover:shadow-md hover:-translate-y-0.5 transition'
    >
      <div className='flex items-start justify-between'>
        <div
          className={classNames(
            'w-10 h-10 rounded-2xl flex items-center justify-center',
            stage.tile,
          )}
        >
          <Icon size={20} />
        </div>
        <ChevronRight size={16} className='text-zinc-300 dark:text-zinc-600' />
      </div>
      <p className='mt-3 text-2xl font-bold tabular-nums'>{count}</p>
      <p className='text-sm font-medium'>{stage.label}</p>
      <p className='text-xs text-zinc-500 dark:text-zinc-400'>{stage.hint}</p>
    </button>
  )
}

interface TodayCardProps {
  streak: number
  doneToday: number
  goal: number
  due: number
  fresh: number
  capReached: boolean
  newPerDay: number | null
  ahead: number
  nextDue: number | null
  canPlay: boolean
}

function TodayCard({
  streak,
  doneToday,
  goal,
  due,
  fresh,
  capReached,
  newPerDay,
  ahead,
  nextDue,
  canPlay,
}: TodayCardProps) {
  // Nothing is ever locked for the day: with nothing due or new, the button
  // reviews ahead of schedule instead (see buildQueue).
  const hasWork = due + fresh > 0
  const canStudy = hasWork || ahead > 0
  const progress = goal === 0 ? 1 : doneToday / goal

  return (
    <section className='relative overflow-hidden rounded-[2rem] p-6 text-white bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 dark:from-rose-600 dark:via-pink-700 dark:to-orange-600 shadow-xl shadow-rose-300/40 dark:shadow-rose-950/40'>
      {/* Soft petals in the corner, purely decorative. */}
      <div className='absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/15' />
      <div className='absolute top-16 -right-16 w-32 h-32 rounded-full bg-white/10' />

      <div className='relative flex items-center gap-5'>
        <ProgressRing value={progress}>
          <span className='text-xl font-bold tabular-nums'>{doneToday}</span>
          <span className='text-[10px] uppercase tracking-wider opacity-80'>lượt</span>
        </ProgressRing>

        <div className='flex-1 min-w-0'>
          <div className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold'>
            <Flame size={14} className={streak ? 'text-yellow-200' : ''} />
            {streak ? `${streak} ngày liên tiếp` : 'Bắt đầu chuỗi ngày học'}
          </div>
          <h2 className='mt-2 text-xl font-bold leading-snug'>
            {hasWork ? 'Vườn đang chờ bạn tưới' : 'Hôm nay đã tưới xong 🌸'}
          </h2>
          <p className='text-sm opacity-90'>
            {[
              due > 0 && `${due} từ cần ôn`,
              fresh > 0 && `${fresh} từ mới`,
              capReached && `đã đủ ${newPerDay} từ mới hôm nay`,
              !hasWork &&
                (nextDue !== null
                  ? `lượt ôn tiếp theo sau ${formatDelay(nextDue)} · vẫn có thể ôn thêm ${ahead} từ`
                  : !capReached && 'thêm bộ từ để có từ mới.'),
            ]
              .filter(Boolean)
              .join(' · ')
              .replace(/^./, (c) => c.toUpperCase())}
          </p>
        </div>
      </div>

      <div className='relative mt-6 flex gap-2'>
        <button
          type='button'
          disabled={!canStudy}
          onClick={() => navigate('vocab/study')}
          className='flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-rose-600 font-bold text-base shadow-lg shadow-rose-900/10 hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-60 disabled:hover:scale-100 dark:bg-zinc-950 dark:text-rose-300'
        >
          <Play size={18} fill='currentColor' />
          {hasWork ? 'Bắt đầu học' : 'Ôn thêm'}
        </button>
        <button
          type='button'
          disabled={!canStudy || !canPlay}
          title={canPlay ? 'Ôn bằng trò chơi' : PLAY_NEEDS}
          onClick={() => navigate('vocab/play')}
          className='flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-white/20 border border-white/40 text-white font-bold text-base hover:bg-white/30 active:scale-[0.99] transition disabled:opacity-60'
        >
          <Gamepad2 size={18} />
          Chơi
        </button>
      </div>
    </section>
  )
}

function ProgressRing({ value, children }: { value: number; children: ReactNode }) {
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className='relative w-24 h-24 flex-none'>
      <svg viewBox='0 0 80 80' className='w-full h-full -rotate-90'>
        <circle cx='40' cy='40' r={r} fill='none' strokeWidth='8' className='stroke-white/25' />
        <circle
          cx='40'
          cy='40'
          r={r}
          fill='none'
          strokeWidth='8'
          strokeLinecap='round'
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, value))}
          className='stroke-white transition-[stroke-dashoffset] duration-700'
        />
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center leading-none'>
        {children}
      </div>
    </div>
  )
}

interface DeckRowProps {
  episode: Episode
  counts: Summary
  onOpenEpisode: (id: number) => void
  canPlay: boolean
}

function DeckRow({ episode, counts, onOpenEpisode, canPlay }: DeckRowProps) {
  const [confirming, setConfirming] = useState(false)
  const toStudy = counts.due + counts.seed

  return (
    <li className='rounded-3xl bg-white dark:bg-zinc-900 p-4 shadow-sm shadow-rose-900/5 border border-black/[0.03] dark:border-white/5'>
      <div className='flex items-start gap-3'>
        <button
          type='button'
          onClick={() => onOpenEpisode(episode.id)}
          title='Nghe bài này'
          className='flex-1 min-w-0 flex items-start gap-3 text-left group'
        >
          <div className='w-11 h-11 flex-none rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-300 flex items-center justify-center text-sm font-bold tabular-nums'>
            {episode.id}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='font-semibold truncate group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors'>
              {episode.title}
              <Headphones
                size={13}
                className='inline ml-1.5 -mt-0.5 opacity-0 group-hover:opacity-70 transition-opacity'
              />
            </p>
            <p className='text-xs text-zinc-500 dark:text-zinc-400'>
              {episode.level} · {counts.total} từ · {counts.bloom} đã nở hoa
            </p>
          </div>
        </button>
        {confirming ? (
          <div className='flex gap-1'>
            <button
              type='button'
              onClick={() => removeDeck(episode.id)}
              className='px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-600 text-white'
            >
              Xóa
            </button>
            <button
              type='button'
              onClick={() => setConfirming(false)}
              className='px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800'
            >
              Hủy
            </button>
          </div>
        ) : (
          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={() => navigate(`vocab/episode/${episode.id}`)}
              title='Danh sách từ vựng'
              className='p-2 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:text-zinc-400 dark:hover:bg-rose-500/10'
            >
              <List size={18} />
            </button>
            <button
              type='button'
              onClick={() => setConfirming(true)}
              title='Xóa bộ từ'
              className='p-2 rounded-full text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
            >
              <Trash2 size={16} />
            </button>
            <button
              type='button'
              disabled={counts.total === 0 || !canPlay}
              title={canPlay ? 'Chơi với bộ từ này' : PLAY_NEEDS}
              onClick={() => navigate(`vocab/play/${episode.id}`)}
              className='p-2 rounded-full text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:text-zinc-400 dark:hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent'
            >
              <Gamepad2 size={18} />
            </button>
            <button
              type='button'
              disabled={counts.total === 0}
              title={toStudy ? 'Học bài này' : 'Ôn thêm bài này'}
              onClick={() => navigate(`vocab/study/${episode.id}`)}
              className='flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-full text-sm font-semibold bg-rose-500 text-white hover:bg-rose-600 disabled:bg-zinc-100 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500'
            >
              <Play size={14} fill='currentColor' />
              {toStudy || 'Ôn'}
            </button>
          </div>
        )}
      </div>
      <StageBar counts={counts} />
    </li>
  )
}

/** One thin bar split by stage, so a deck's growth is visible at a glance. */
function StageBar({ counts }: { counts: Summary }) {
  if (!counts.total) return null
  return (
    <div className='mt-3 flex h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800'>
      {STAGES.map(({ key, bar }) =>
        counts[key] ? (
          <div
            key={key}
            className={classNames(bar, 'transition-all duration-500')}
            style={{ width: `${(counts[key] / counts.total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  )
}

function Settings({ settings }: { settings: SrsSettings }) {
  const newPerDayId = useId()
  // The server allows 1-999, so a synced value may not be one of the presets.
  const current = settings.newPerDay
  const numbers = NEW_PER_DAY_CHOICES.filter((n) => n !== null)
  const newPerDayChoices: (number | null)[] =
    current === null || numbers.includes(current)
      ? NEW_PER_DAY_CHOICES
      : [...[...numbers, current].sort((a, b) => a - b), null]
  return (
    <section>
      <SectionTitle>Cài đặt</SectionTitle>
      <div className='rounded-3xl bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 shadow-sm shadow-rose-900/5 border border-black/[0.03] dark:border-white/5'>
        <button
          type='button'
          role='switch'
          aria-checked={settings.autoSpeak}
          onClick={() => updateSettings({ autoSpeak: !settings.autoSpeak })}
          className='w-full p-4 flex items-center justify-between text-left'
        >
          <span className='flex items-center gap-3'>
            {settings.autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span className='font-medium'>Tự động phát âm</span>
          </span>
          <span
            className={classNames(
              'w-11 h-6 rounded-full p-0.5 transition-colors',
              settings.autoSpeak ? 'bg-rose-500' : 'bg-zinc-300 dark:bg-zinc-700',
            )}
          >
            <span
              className={classNames(
                'block w-5 h-5 rounded-full bg-white shadow transition-transform',
                settings.autoSpeak && 'translate-x-5',
              )}
            />
          </span>
        </button>
        <div className='p-4 flex items-center justify-between gap-3'>
          <label htmlFor={newPerDayId} className='flex items-center gap-3'>
            <Sprout size={18} />
            <span className='font-medium'>Từ mới mỗi ngày</span>
          </label>
          <select
            id={newPerDayId}
            value={settings.newPerDay ?? ''}
            onChange={(e) =>
              updateSettings({ newPerDay: e.target.value ? Number(e.target.value) : null })
            }
            className='px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-rose-300'
          >
            {newPerDayChoices.map((n) => (
              <option key={n ?? 'all'} value={n ?? ''}>
                {n ?? 'Không giới hạn'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  )
}

function EmptyGarden({ firstEpisode }: { firstEpisode: Episode | undefined }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const quickStart = async () => {
    if (!firstEpisode) return
    setStatus('loading')
    try {
      await addEpisodeDeck(firstEpisode)
      navigate('vocab/study')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className='rounded-[2rem] bg-white dark:bg-zinc-900 p-8 text-center shadow-sm shadow-rose-900/5 border border-black/[0.03] dark:border-white/5'>
      <div className='mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-rose-100 to-amber-100 dark:from-rose-500/20 dark:to-amber-500/20 flex items-center justify-center text-4xl'>
        🌱
      </div>
      <h2 className='mt-5 text-xl font-bold'>Khu vườn còn trống</h2>
      <p className='mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto'>
        Chọn bài podcast để gieo hạt từ vựng. Mỗi ngày ôn một chút, từ sẽ nảy mầm rồi nở hoa trong
        trí nhớ của bạn.
      </p>
      <div className='mt-6 flex flex-col sm:flex-row gap-3 justify-center'>
        {firstEpisode && (
          <button
            type='button'
            onClick={quickStart}
            disabled={status === 'loading'}
            className='px-5 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-semibold shadow-lg shadow-rose-500/25 disabled:opacity-60'
          >
            {status === 'loading' ? 'Đang gieo hạt…' : `Bắt đầu với bài ${firstEpisode.id}`}
          </button>
        )}
        <button
          type='button'
          onClick={() => navigate('vocab/decks')}
          className='px-5 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-semibold'
        >
          Chọn bộ từ
        </button>
      </div>
      {status === 'error' && (
        <p className='mt-4 text-sm text-rose-600'>Không tải được từ vựng. Thử lại sau nhé.</p>
      )}
    </section>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className='mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400'>
      {children}
    </h2>
  )
}

function greeting(now: number) {
  const hour = new Date(now).getHours()
  if (hour < 11) return 'Chào buổi sáng ☀️'
  if (hour < 14) return 'Chào buổi trưa 🌤'
  if (hour < 18) return 'Chào buổi chiều 🌿'
  return 'Chào buổi tối 🌙'
}
