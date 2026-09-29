import { X } from 'lucide-react'
import type { StoredCard } from '../../lib/srsStore'

interface SessionHeaderProps {
  queue: string[]
  cards: Record<string, StoredCard>
  answers: number
  onExit: () => void
}

/**
 * Exit button, progress bar and the remaining work by kind, Anki-style: blue
 * new, rose learning, green review. Shared by the flashcard and game sessions.
 */
export default function SessionHeader({ queue, cards, answers, onExit }: SessionHeaderProps) {
  const remaining = { new: 0, learning: 0, review: 0 }
  for (const id of new Set(queue)) {
    const c = cards[id]
    if (!c) continue
    if (c.state === 'new') remaining.new++
    else if (c.state === 'review') remaining.review++
    else remaining.learning++
  }
  const progress = answers / (answers + queue.length)

  return (
    <header className='h-16 flex items-center gap-3'>
      <button
        onClick={onExit}
        title='Thoát (Esc)'
        className='p-2 -ml-2 rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10'
      >
        <X size={22} />
      </button>
      <div className='flex-1 h-2.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden'>
        <div
          className='h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500 transition-[width] duration-500'
          style={{ width: `${Math.max(4, progress * 100)}%` }}
        />
      </div>
      <div className='flex gap-2 text-sm font-bold tabular-nums'>
        <span className='text-sky-500' title='Từ mới'>{remaining.new}</span>
        <span className='text-rose-500' title='Đang học'>{remaining.learning}</span>
        <span className='text-emerald-500' title='Cần ôn'>{remaining.review}</span>
      </div>
    </header>
  )
}
