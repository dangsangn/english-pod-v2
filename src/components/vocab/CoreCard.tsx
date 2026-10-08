import { useEffect, useState } from 'react'
import { Loader2, Play, Sparkles } from 'lucide-react'
import { navigate, useNow } from '../../lib/hooks'
import { CORE_DECK_IDS, coreDeckName, vocabFile } from '../../lib/coreDecks'
import { addDeckById, summarize, useSrs } from '../../lib/srsStore'

/**
 * The way into the Top 1000 decks from the garden: keeps studying the first
 * added group with words never studied, or adds the next group and starts it
 * in one tap. Hidden once every group that is built has been started.
 */
export default function CoreCard() {
  const srs = useSrs()
  const now = useNow()
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const added = CORE_DECK_IDS.filter((id) => srs.decks.includes(id))
  const current = added.find((id) => summarize(srs, now, id).seed > 0)
  const next = CORE_DECK_IDS.find((id) => !srs.decks.includes(id))
  const nextReady = useDeckBuilt(current === undefined ? next : undefined)

  if (current === undefined && (next === undefined || !nextReady)) return null

  const start = async (id: number) => {
    setStatus('loading')
    try {
      await addDeckById(id)
      navigate(`vocab/study/${id}`)
    } catch {
      setStatus('error')
    }
  }

  const counts = current === undefined ? null : summarize(srs, now, current)
  const learned = counts ? counts.total - counts.seed : 0
  const id = current ?? next!

  return (
    <section className='rounded-3xl bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-rose-900/5 border border-black/[0.03] dark:border-white/5'>
      <div className='flex items-start gap-3'>
        <div className='w-11 h-11 flex-none rounded-2xl bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-300 flex items-center justify-center'>
          <Sparkles size={20} />
        </div>
        <div className='flex-1 min-w-0'>
          <h2 className='font-bold'>1000 từ phổ biến</h2>
          <p className='text-sm text-zinc-500 dark:text-zinc-400'>
            {counts
              ? `${coreDeckName(id)} · ${learned}/${counts.total} từ đã học`
              : added.length === 0
                ? 'Những từ gặp nhiều nhất trong hội thoại, 100 từ mỗi nhóm.'
                : `Nhóm tiếp theo: ${coreDeckName(id)}`}
          </p>
        </div>
      </div>
      {counts && (
        <div className='mt-3 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden'>
          <div
            className='h-full rounded-full bg-amber-400'
            style={{ width: `${(100 * learned) / Math.max(1, counts.total)}%` }}
          />
        </div>
      )}
      <button
        type='button'
        disabled={status === 'loading'}
        onClick={() => (counts ? navigate(`vocab/study/${id}`) : start(id))}
        className='mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-400 hover:bg-amber-500 text-zinc-900 font-semibold disabled:opacity-60'
      >
        {status === 'loading' ? (
          <Loader2 size={16} className='animate-spin' />
        ) : (
          <Play size={14} fill='currentColor' />
        )}
        {counts ? 'Học tiếp' : added.length === 0 ? 'Học 100 từ đầu tiên' : 'Học 100 từ tiếp theo'}
      </button>
      {status === 'error' && (
        <p className='mt-3 text-sm text-rose-600'>Không tải được nhóm từ này. Thử lại sau nhé.</p>
      )}
    </section>
  )
}

/**
 * Whether deck `id`'s vocabulary file is there yet (a Top 1000 group is only
 * written once all its words are done). Reads the body: a dev server answers a
 * missing file with the app's HTML rather than a 404.
 */
function useDeckBuilt(id: number | undefined): boolean {
  const [known, setKnown] = useState<{ id: number; built: boolean } | null>(null)
  useEffect(() => {
    if (id === undefined) return
    let live = true
    fetch(vocabFile(id))
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (entries: unknown) => Array.isArray(entries) && entries.length > 0,
        () => false,
      )
      .then((built) => {
        if (live) setKnown({ id, built })
      })
    return () => {
      live = false
    }
  }, [id])
  return id !== undefined && known?.id === id && known.built
}
