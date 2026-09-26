import { Bean, Flower, Flower2, Sprout } from 'lucide-react'

// The garden metaphor: every word starts as a seed and blooms once it is
// remembered for three weeks or more (see srs.stageOf / MATURE_INTERVAL).
export const STAGES = [
  {
    key: 'seed',
    label: 'Hạt giống',
    hint: 'Chưa học',
    Icon: Bean,
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    bar: 'bg-amber-300 dark:bg-amber-500/60',
  },
  {
    key: 'sprout',
    label: 'Nảy mầm',
    hint: 'Đang học',
    Icon: Sprout,
    tile: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
    bar: 'bg-lime-400 dark:bg-lime-500/70',
  },
  {
    key: 'bud',
    label: 'Nụ hoa',
    hint: 'Đang ghi nhớ',
    Icon: Flower,
    tile: 'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300',
    bar: 'bg-pink-300 dark:bg-pink-400/70',
  },
  {
    key: 'bloom',
    label: 'Nở hoa',
    hint: 'Đã thuộc',
    Icon: Flower2,
    tile: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300',
    bar: 'bg-rose-500 dark:bg-rose-400',
  },
]

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]))

export const RATING_STYLES = {
  again: {
    label: 'Quên',
    key: '1',
    className:
      'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/20',
  },
  hard: {
    label: 'Khó',
    key: '2',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/20',
  },
  good: {
    label: 'Nhớ',
    key: '3',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 dark:hover:bg-emerald-500/20',
  },
  easy: {
    label: 'Dễ',
    key: '4',
    className:
      'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30 dark:hover:bg-sky-500/20',
  },
}
