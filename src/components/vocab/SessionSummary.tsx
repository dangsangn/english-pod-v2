import { useState } from 'react'
import type { ReactNode } from 'react'

export interface SessionStats {
  startedAt: number
  answers: number
  forgotten: number
  learned: number
}

export default function SessionSummary({ stats, onExit }: { stats: SessionStats; onExit: () => void }) {
  // Frozen when the summary first shows, so the minutes don't keep ticking.
  const [endedAt] = useState(() => Date.now())

  if (stats.answers === 0) {
    return (
      <Screen emoji='🌿' title='Chưa có thẻ nào' onExit={onExit}>
        Thêm bộ từ vào vườn để bắt đầu học nhé.
      </Screen>
    )
  }

  const remembered = Math.round(
    ((stats.answers - stats.forgotten) / stats.answers) * 100,
  )
  const minutes = Math.max(1, Math.round((endedAt - stats.startedAt) / 60000))

  return (
    <Screen emoji='🌸' title='Tuyệt vời!' onExit={onExit}>
      Bạn vừa chăm sóc khu vườn của mình. Hẹn gặp lại ở lượt ôn tiếp theo.
      <div className='mt-8 grid grid-cols-3 gap-3 text-zinc-900 dark:text-zinc-100'>
        <Stat value={stats.answers} label='lượt trả lời' />
        <Stat value={`${remembered}%`} label='nhớ được' />
        <Stat value={stats.learned} label='từ mới' />
      </div>
      <p className='mt-3 text-xs'>Thời gian: {minutes} phút</p>
    </Screen>
  )
}

interface ScreenProps {
  emoji: string
  title: string
  onExit: () => void
  children: ReactNode
}

function Screen({ emoji, title, onExit, children }: ScreenProps) {
  return (
    <div className='min-h-full max-w-md mx-auto px-4 flex flex-col items-center justify-center text-center py-12 vocab-pop-in'>
      <div className='w-28 h-28 rounded-full bg-gradient-to-br from-rose-100 via-pink-100 to-amber-100 dark:from-rose-500/20 dark:via-pink-500/15 dark:to-amber-500/15 flex items-center justify-center text-6xl shadow-xl shadow-rose-200/50 dark:shadow-none'>
        {emoji}
      </div>
      <h1 className='mt-6 text-3xl font-bold tracking-tight'>{title}</h1>
      <div className='mt-2 w-full text-zinc-500 dark:text-zinc-400'>{children}</div>
      <button
        onClick={onExit}
        className='mt-10 w-full py-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-lg shadow-rose-500/25'
      >
        Về khu vườn
      </button>
    </div>
  )
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className='rounded-2xl bg-white dark:bg-zinc-900 p-4 border border-black/[0.03] dark:border-white/5'>
      <p className='text-2xl font-bold tabular-nums'>{value}</p>
      <p className='text-xs text-zinc-500 dark:text-zinc-400'>{label}</p>
    </div>
  )
}
