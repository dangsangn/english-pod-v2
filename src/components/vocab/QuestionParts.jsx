import { ArrowRight, Check, X } from 'lucide-react'
import classNames from 'classnames'

/** The white card a game question sits on, with its instruction on top. */
export function QuestionCard({ label, children }) {
  return (
    <div className='rounded-[2rem] bg-white dark:bg-zinc-900 border border-black/[0.04] dark:border-white/10 shadow-2xl shadow-rose-900/10 dark:shadow-black/40 p-6 text-center'>
      <p className='text-xs font-semibold uppercase tracking-wider text-zinc-400'>{label}</p>
      {children}
    </div>
  )
}

/** Shown once a question is answered: how it went, and the way on. */
export function ContinueButton({ correct, onClick }) {
  return (
    <div className='flex items-center gap-3 vocab-rise-in'>
      <p
        className={classNames(
          'flex-1 flex items-center gap-2 font-bold',
          correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}
      >
        {correct ? <Check size={20} /> : <X size={20} />}
        {correct ? 'Chính xác!' : 'Chưa đúng'}
      </p>
      <button
        onClick={onClick}
        className='flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-bold shadow-lg active:scale-[0.98] transition'
      >
        Tiếp <ArrowRight size={18} />
      </button>
    </div>
  )
}
