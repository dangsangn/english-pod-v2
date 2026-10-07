import { useState, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import useSWR from 'swr'
import { Eye, EyeOff } from 'lucide-react'
import { decorateVocab, normalizeText } from '../lib/vocabulary'
import { addLineTranslateButtons } from '../lib/lineTranslate'
import { speak } from '../lib/speech'
import TranslatePopover from './TranslatePopover'
import type { LineTarget } from './TranslatePopover'
import type { Episode, VocabEntry } from '../types'

const transcriptFetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Transcript missing')
    return res.text()
  })

// Vocabulary is optional: only some episodes have been through
// scripts/build_vocab.js. A missing file is a normal state, not an error, so it
// resolves to null and the transcript renders undecorated.
const vocabFetcher = (url: string): Promise<VocabEntry[] | null> =>
  fetch(url).then((res) => (res.ok ? res.json() : null))

// The Vietnamese of each dialogue line, by position (scripts/build_dialogue.js).
// Optional like the vocabulary: without it the lines just have no button.
const dialogueFetcher = (url: string): Promise<string[] | null> =>
  fetch(url).then((res) => (res.ok ? res.json() : null))

const Transcript = ({ episode }: { episode: Episode }) => {
  const [isVisible, setIsVisible] = useState(false)
  // The line whose translation is showing, and its button.
  const [lookup, setLookup] = useState<LineTarget | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const activeButtonRef = useRef<HTMLElement | null>(null)

  const swrKey =
    isVisible && episode.transcript_id ? `./transcripts/${episode.transcript_id}.html` : null

  const { data: content, error, isLoading: loading } = useSWR(swrKey, transcriptFetcher)

  const { data: vocab } = useSWR(
    isVisible && episode.transcript_id ? `./vocab/${episode.transcript_id}.json` : null,
    vocabFetcher,
  )

  const { data: lineTranslations } = useSWR(
    isVisible && episode.transcript_id ? `./dialogue/${episode.transcript_id}.json` : null,
    dialogueFetcher,
  )

  // Render the transcript, then decorate it. This is deliberately one effect:
  // splitting it meant the decorating pass had to sleep 150ms hoping innerHTML
  // had landed, which is a race rather than an ordering guarantee.
  useEffect(() => {
    if (!content || !contentRef.current || loading) return

    const sanitized = content
      .replace(/<!DOCTYPE html>/i, '')
      .replace(/<html[^>]*>/i, '')
      .replace(/<\/html>/i, '')
      .replace(/<head>[\s\S]*?<\/head>/i, '')
      .replace(/<body[^>]*>/i, '<div class="transcript-body">')
      .replace(/<\/body>/i, '</div>')

    contentRef.current.innerHTML = sanitized

    // Decorate first: it fills in the words the source HTML left blank, so
    // those rows can be clicked to speak too.
    if (vocab) decorateVocab(contentRef.current, vocab)

    // Every line with a Vietnamese translation gets a button that shows it.
    if (lineTranslations) addLineTranslateButtons(contentRef.current, lineTranslations)
  }, [content, loading, vocab, lineTranslations])

  const closeLookup = () => {
    activeButtonRef.current?.classList.remove('line-translate-active')
    activeButtonRef.current = null
    setLookup(null)
  }

  const openLookup = (target: LineTarget, button: HTMLElement) => {
    activeButtonRef.current?.classList.remove('line-translate-active')
    activeButtonRef.current = button
    button.classList.add('line-translate-active')
    setLookup(target)
  }

  // One handler for the whole transcript, since its HTML is injected rather
  // than rendered by React.
  const onContentClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element

    // A vocabulary word is spoken; vocabulary data is not required for this.
    // dataset.speak is the bare word, where textContent would include the IPA.
    const vocabWord = target.closest<HTMLElement>('.word')
    if (vocabWord) {
      const text = vocabWord.dataset.speak || vocabWord.textContent?.trim()
      if (text) speak(text)
      return
    }

    // A line's translate button: the line's own text, without the button.
    const lineButton = target.closest<HTMLElement>('.line-translate')
    if (lineButton) {
      // Pressing the open line's button again closes its card.
      if (lineButton === activeButtonRef.current) return closeLookup()
      const translation = lineTranslations?.[Number(lineButton.dataset.line)]
      const text = normalizeText(lineButton.parentElement?.textContent)
      if (translation && text) {
        openLookup({ text, rect: lineButton.getBoundingClientRect(), translation }, lineButton)
      }
    }
  }

  return (
    <div className='glass-card rounded-2xl p-6 lg:p-8 -mx-4 lg:mx-0'>
      <div className='flex items-center justify-between mb-6'>
        <h3 className='text-lg font-semibold text-zinc-700 dark:text-zinc-300'>
          Transcript / Notes
        </h3>
        <button
          type='button'
          onClick={() => setIsVisible(!isVisible)}
          className='flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 dark:bg-zinc-800 hover:bg-white dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
        >
          {isVisible ? (
            <>
              <EyeOff size={16} /> Hide
            </>
          ) : (
            <>
              <Eye size={16} /> Show
            </>
          )}
        </button>
      </div>

      {isVisible && (
        <div className='animate-in fade-in slide-in-from-top-4 duration-300'>
          {loading && (
            <div className='flex justify-center py-12'>
              <div className='w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin'></div>
            </div>
          )}

          {error && (
            <div className='p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm text-center'>
              Could not load transcript for this episode.
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Delegated clicks on the injected HTML: the vocabulary words and the
                  line buttons inside it are its controls. */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                ref={contentRef}
                onClick={onContentClick}
                className='prose prose-zinc dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 transcript-content'
              />
            </>
          )}
        </div>
      )}

      {lookup && isVisible && (
        <TranslatePopover target={lookup} anchor={activeButtonRef} onClose={closeLookup} />
      )}

      {!isVisible && (
        <div className='text-center py-12 text-zinc-500 dark:text-zinc-500'>
          <p>Click “Show” to view the transcript and vocabulary notes.</p>
        </div>
      )}
    </div>
  )
}

export default Transcript
