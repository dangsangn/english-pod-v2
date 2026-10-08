import { Volume2 } from 'lucide-react'
import { speak } from '../../lib/speech'
import type { RelatedWord } from '../../types'

/**
 * A labelled list of synonyms or collocations: each with its IPA, a button
 * that reads it aloud, and its Vietnamese underneath.
 */
export default function RelatedList({ label, items }: { label: string; items: RelatedWord[] }) {
  return (
    <div>
      <p className='text-[11px] font-semibold uppercase tracking-wider text-zinc-400'>{label}</p>
      <ul className='mt-1 space-y-1.5'>
        {items.map((item) => (
          <li key={item.en} className='leading-snug'>
            <p className='flex items-center gap-1.5 flex-wrap'>
              <span className='text-base font-medium text-zinc-800 dark:text-zinc-200'>
                {item.en}
              </span>
              {item.ipa && (
                <span className='text-xs text-zinc-400 dark:text-zinc-500'>/{item.ipa}/</span>
              )}
              <button
                type='button'
                onClick={() => speak(item.en)}
                title='Nghe phát âm'
                aria-label={`Nghe phát âm ${item.en}`}
                className='-my-1 p-1 rounded-full text-zinc-400 hover:text-emerald-600 hover:bg-black/5 dark:hover:bg-white/10'
              >
                <Volume2 size={14} />
              </button>
            </p>
            <p className='vi-text text-sm text-indigo-600 dark:text-indigo-400'>{item.vi}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
