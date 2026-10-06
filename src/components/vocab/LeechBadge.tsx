import { RotateCcw } from 'lucide-react'
import classNames from 'classnames'

/** "Hay quên": the word has been forgotten again and again (srs.isLeech). */
export default function LeechBadge({ className }: { className?: string }) {
  return (
    <span
      title='Bạn đã quên từ này nhiều lần'
      className={classNames(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
        className,
      )}
    >
      <RotateCcw size={12} />
      Hay quên
    </span>
  )
}
