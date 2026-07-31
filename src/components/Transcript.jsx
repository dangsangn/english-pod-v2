import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Eye, EyeOff } from 'lucide-react'
import { decorateVocab } from '../lib/vocabulary'

const transcriptFetcher = (url) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Transcript missing')
    return res.text()
  })

// Vocabulary is optional: only some episodes have been through
// scripts/build_vocab.js. A missing file is a normal state, not an error, so it
// resolves to null and the transcript renders undecorated.
const vocabFetcher = (url) =>
  fetch(url).then((res) => (res.ok ? res.json() : null))

const Transcript = ({ episode }) => {
  const [isVisible, setIsVisible] = useState(false)
  const contentRef = useRef(null)

  const swrKey =
    isVisible && episode.transcript_id
      ? `./transcripts/${episode.transcript_id}.html`
      : null

  const {
    data: content,
    error,
    isLoading: loading,
  } = useSWR(swrKey, transcriptFetcher)

  const { data: vocab } = useSWR(
    isVisible && episode.transcript_id
      ? `./vocab/${episode.transcript_id}.json`
      : null,
    vocabFetcher,
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

    // Click a word to hear it. Vocabulary data is not required for this.
    contentRef.current.querySelectorAll('.word').forEach((wordEl) => {
      const wordText = wordEl.textContent.trim()
      if (!wordText) return
      wordEl.onclick = (e) => {
        e.stopPropagation()
        if (!('speechSynthesis' in window)) return
        const utterance = new SpeechSynthesisUtterance(wordText)
        utterance.lang = 'en-US'
        utterance.rate = 0.8 // Slower, for learners.
        speechSynthesis.cancel()
        speechSynthesis.speak(utterance)
      }
    })

    if (vocab) decorateVocab(contentRef.current, vocab)
  }, [content, loading, vocab])

  return (
    <div className="glass-card rounded-2xl p-6 lg:p-8 -mx-6 lg:mx-0">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
          Transcript / Notes
        </h3>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 dark:bg-zinc-800 hover:bg-white dark:hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
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
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-600 dark:text-red-400 text-sm text-center">
              Could not load transcript for this episode.
            </div>
          )}

          {!loading && !error && (
            <>
              <div
                ref={contentRef}
                className="prose prose-zinc dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 transcript-content"
              />
            </>
          )}
        </div>
      )}

      {!isVisible && (
        <div className="text-center py-12 text-zinc-500 dark:text-zinc-500">
          <p>Click "Show" to view the transcript and vocabulary notes.</p>
        </div>
      )}
    </div>
  )
}

export default Transcript
