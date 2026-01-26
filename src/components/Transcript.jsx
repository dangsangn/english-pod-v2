import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// In-memory cache for pronunciation (per session)
const pronunciationCache = new Map()

// Fetch pronunciation from API
const fetchPronunciation = async (word) => {
  try {
    const cleanWord = word.trim().toLowerCase()

    // Try to fetch the whole phrase first
    const wholePhrase = await fetchSingleWordPronunciation(cleanWord)
    if (wholePhrase) {
      return wholePhrase
    }

    // If phrase not found and contains multiple words, try individual words
    if (cleanWord.includes(' ')) {
      const words = cleanWord.split(' ')
      const pronunciations = await Promise.all(
        words.map((w) => fetchSingleWordPronunciation(w)),
      )
      return pronunciations.filter(Boolean).join(' ') || null
    }

    return null
  } catch (error) {
    console.error('🚀 ~ error:', error)
    return null
  }
}

// Try Free Dictionary API
const tryFreeDictionaryAPI = async (word) => {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )

    if (!response.ok) return null

    const data = await response.json()

    if (data[0]?.phonetics) {
      for (const phonetic of data[0].phonetics) {
        if (phonetic.text) {
          return phonetic.text.replace(/^\/|\/$/g, '')
        }
      }
    }

    return null
  } catch (error) {
    console.error('🚀 ~ error:', error)
    return null
  }
}

// Fetch Vietnamese translation
const fetchVietnameseTranslation = async (word) => {
  const cleanWord = word.trim().toLowerCase()

  // Check cache first
  const cacheKey = `vi_${cleanWord}`
  if (pronunciationCache.has(cacheKey)) {
    return pronunciationCache.get(cacheKey)
  }

  try {
    // MyMemory Translation API (free, no API key needed)
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`,
    )

    if (!response.ok) return null

    const data = await response.json()

    if (data.responseData && data.responseData.translatedText) {
      const translation = data.responseData.translatedText
      // Cache the result
      pronunciationCache.set(cacheKey, translation)
      return translation
    }

    pronunciationCache.set(cacheKey, null)
    return null
  } catch (error) {
    console.error('🚀 ~ error:', error)
    pronunciationCache.set(cacheKey, null)
    return null
  }
}

// Try Wiktionary API (more comprehensive)
const tryWiktionaryAPI = async (word) => {
  try {
    const response = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    )

    if (!response.ok) return null

    const data = await response.json()

    // Wiktionary has pronunciation in the data
    // Try to extract IPA from the definitions
    if (data.en) {
      for (const entry of data.en) {
        if (entry.pronunciations && entry.pronunciations.length > 0) {
          for (const pron of entry.pronunciations) {
            if (pron.text && pron.text.includes('/')) {
              // Extract IPA between slashes
              const match = pron.text.match(/\/([^/]+)\//)
              if (match) {
                return match[1]
              }
            }
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error('🚀 ~ error:', error)
    return null
  }
}

// Fetch pronunciation for a single word with fallback APIs
const fetchSingleWordPronunciation = async (word) => {
  const cleanWord = word.trim().toLowerCase()

  // Check in-memory cache first
  if (pronunciationCache.has(cleanWord)) {
    return pronunciationCache.get(cleanWord)
  }

  // Try Free Dictionary API first (faster)
  let ipa = await tryFreeDictionaryAPI(cleanWord)
  if (ipa) {
    pronunciationCache.set(cleanWord, ipa)
    return ipa
  }

  // Fallback to Wiktionary API (more comprehensive)
  ipa = await tryWiktionaryAPI(cleanWord)
  if (ipa) {
    pronunciationCache.set(cleanWord, ipa)
    return ipa
  }
  // Cache null result to avoid re-fetching
  pronunciationCache.set(cleanWord, null)
  return null
}

const Transcript = ({ episode }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [fetchingIPA, setFetchingIPA] = useState(false)
  const [ipaProgress, setIpaProgress] = useState({ current: 0, total: 0 })
  const contentRef = useRef(null)
  const hasFetchedRef = useRef(false)

  // Fetch transcript HTML
  useEffect(() => {
    if (isVisible && episode.transcript_id) {
      setLoading(true)
      setError(false)
      hasFetchedRef.current = false // Reset fetch flag
      const url = `./transcripts/${episode.transcript_id}.html?v=${Date.now()}`

      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error('Transcript missing')
          return res.text()
        })
        .then((html) => {
          setContent(html)
          setLoading(false)
        })
        .catch((err) => {
          console.error('🚀 ~ err:', err)
          setError(true)
          setLoading(false)
        })
    }
  }, [isVisible, episode.transcript_id])

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

  // Auto-fetch pronunciations for all vocabulary words when transcript is shown
  useEffect(() => {
    if (!content || !contentRef.current || loading || hasFetchedRef.current) {
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
      // Mark as fetched to prevent multiple calls
      hasFetchedRef.current = true

      // Wait a bit for DOM to be fully rendered after innerHTML is set
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

      // Set fetching state
      setFetchingIPA(true)
      setIpaProgress({ current: 0, total: wordsToFetch.length })

      // Add loading state to all words
      wordsToFetch.forEach(({ element }) => {
        element.style.opacity = '0.6'
      })

      // Fetch all pronunciations AND translations in parallel
      const results = await Promise.allSettled(
        wordsToFetch.map(async ({ text }) => {
          const [pronunciation, translation] = await Promise.all([
            fetchPronunciation(text),
            fetchVietnameseTranslation(text),
          ])
          return { pronunciation, translation }
        }),
      )

      // Process results and add to DOM
      let completed = 0
      wordsToFetch.forEach(({ element: wordEl, text: wordText }, index) => {
        const result = results[index]

        if (result.status === 'fulfilled' && result.value) {
          const { pronunciation: ipa, translation } = result.value

          // Add pronunciation (if available)
          if (ipa) {
            const pronunciationSpan = document.createElement('span')
            pronunciationSpan.className = 'pronunciation'
            pronunciationSpan.textContent = `/${ipa}/`
            wordEl.appendChild(document.createTextNode(' '))
            wordEl.appendChild(pronunciationSpan)
          } else {
            const pronunciationSpan = document.createElement('span')
            pronunciationSpan.className = 'pronunciation'
            pronunciationSpan.textContent = `(no IPA)`
            pronunciationSpan.style.opacity = '0.5'
            wordEl.appendChild(document.createTextNode(' '))
            wordEl.appendChild(pronunciationSpan)
          }

          // Add Vietnamese translation to definition
          if (translation) {
            // Find the definition element (sibling of word element)
            const vocabItem = wordEl.closest('.vocab-item')
            if (vocabItem) {
              const definitionEl = vocabItem.querySelector('.definition')
              if (definitionEl && !definitionEl.querySelector('.translation')) {
                const translationSpan = document.createElement('span')
                translationSpan.className = 'translation'
                translationSpan.textContent = ` (${translation})`
                definitionEl.appendChild(translationSpan)
              }
            }
          }
        } else {
          // If no pronunciation found, show a message but still add audio button
          const pronunciationSpan = document.createElement('span')
          pronunciationSpan.className = 'pronunciation'
          pronunciationSpan.textContent = `(no IPA)`
          pronunciationSpan.style.opacity = '0.5'
          wordEl.appendChild(document.createTextNode(' '))
          wordEl.appendChild(pronunciationSpan)
        }
        createSpeakerButton(wordEl, wordText)

        // Remove loading state
        wordEl.style.opacity = '1'

        // Update progress
        completed++
        setIpaProgress({ current: completed, total: wordsToFetch.length })
      })

      // Reset fetching state
      setFetchingIPA(false)
      setIpaProgress({ current: 0, total: 0 })
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
              {fetchingIPA && (
                <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-lg flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      Fetching pronunciations & translations...
                    </div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                      {ipaProgress.current} / {ipaProgress.total} words (IPA +
                      🇻🇳 Vietnamese)
                    </div>
                  </div>
                  <div className="text-xs text-indigo-500 dark:text-indigo-400">
                    {Math.round(
                      (ipaProgress.current / ipaProgress.total) * 100,
                    )}
                    %
                  </div>
                </div>
              )}
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
