import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Eye, EyeOff } from 'lucide-react'

const transcriptFetcher = (url) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Transcript missing')
    return res.text()
  })

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

  // Set innerHTML only once when content changes
  useEffect(() => {
    if (!content || !contentRef.current || loading) return

    // Sanitize and set HTML
    const sanitized = content
      .replace(/<!DOCTYPE html>/i, '')
      .replace(/<html[^>]*>/i, '')
      .replace(/<\/html>/i, '')
      .replace(/<head>[\s\S]*?<\/head>/i, '')
      .replace(/<body[^>]*>/i, '<div class="transcript-body">')
      .replace(/<\/body>/i, '</div>')

    contentRef.current.innerHTML = sanitized
  }, [content, loading])

  useEffect(() => {
    if (!content || !contentRef.current || loading) {
      return
    }

    // Helper function to create speaker button
    const createSpeakerButton = (wordEl, wordText) => {
      wordEl.onclick = (e) => {
        e.stopPropagation()
        // Use Web Speech API to speak the word
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(wordText)
          utterance.lang = 'en-US'
          utterance.rate = 0.8 // Slower for learning
          speechSynthesis.cancel() // Cancel any ongoing speech
          speechSynthesis.speak(utterance)
        }
      }
    }

    const fetchAllPronunciations = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))

      const wordElements = contentRef.current.querySelectorAll('.word')

      // Get words that don't have pronunciation yet
      const wordsToFetch = []
      wordElements.forEach((wordEl) => {
        const hasPronunciation = wordEl.querySelector('.pronunciation')
        if (!hasPronunciation) {
          const wordText = wordEl.textContent.trim()
          if (wordText) {
            wordsToFetch.push({ element: wordEl, text: wordText })
          }
        }
      })

      if (wordsToFetch.length === 0) {
        return
      }

      // Add loading state to all words
      wordsToFetch.forEach(({ element }) => {
        element.style.opacity = '0.6'
      })

      wordsToFetch.forEach(({ element: wordEl, text: wordText }) => {
        // If no pronunciation found, show a message but still add audio button
        createSpeakerButton(wordEl, wordText)

        // Remove loading state
        wordEl.style.opacity = '1'
      })
    }

    // Start fetching pronunciations
    fetchAllPronunciations()
  }, [content, loading])

  return (
    <div className="glass-card rounded-2xl p-6 lg:p-8">
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
