import { useEffect } from 'react'
import { ChevronLeft, Headphones } from 'lucide-react'
import ThemeToggle from '../ThemeToggle'
import { navigate } from '../../lib/hooks'
import { backfillCardContent } from '../../lib/srsStore'
import VocabHome from './VocabHome'
import DeckBrowser from './DeckBrowser'
import StudySession from './StudySession'
import WordList from './WordList'

// Full-screen vocabulary area, laid over the podcast view so audio keeps
// playing underneath. Sub-pages live in the hash (#vocab, #vocab/decks,
// #vocab/words/<filter>, #vocab/episode/<id>, #vocab/study, #vocab/study/<episodeId>) so the browser back button works.
export default function VocabApp({ route, episodes, onOpenEpisode }) {
  const [, page, param] = route.split('/')

  useEffect(() => {
    backfillCardContent(episodes)
  }, [episodes])

  if (page === 'study') {
    const episodeId = param ? Number(param) : null
    return (
      <Shell>
        <StudySession
          // A new scope is a new session: remount rather than patch state.
          key={route}
          episodeId={episodeId}
          episode={episodes.find((e) => e.id === episodeId)}
          onExit={() => navigate('vocab')}
        />
      </Shell>
    )
  }

  const isSubPage = page === 'decks' || page === 'words' || page === 'episode'
  const episode = page === 'episode' ? episodes.find((e) => e.id === Number(param)) : null

  return (
    <Shell>
      <header className='sticky top-0 z-10 bg-[#fbf6ef]/85 dark:bg-zinc-950/85 backdrop-blur-xl'>
        <div className='max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3'>
          {isSubPage ? (
            <button
              onClick={() => navigate('vocab')}
              className='flex items-center gap-1 -ml-2 px-2 py-1.5 rounded-full text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
            >
              <ChevronLeft size={18} /> Vườn từ vựng
            </button>
          ) : (
            <button
              onClick={() => navigate('')}
              className='flex items-center gap-2 -ml-2 px-3 py-1.5 rounded-full text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10'
            >
              <Headphones size={16} /> Podcast
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {page === 'decks' ? (
        <DeckBrowser episodes={episodes} onOpenEpisode={onOpenEpisode} />
      ) : episode ? (
        <WordList
          key={route}
          episode={episode}
          onOpenEpisode={onOpenEpisode}
        />
      ) : page === 'words' ? (
        <WordList key={route} initialFilter={param} />
      ) : (
        <VocabHome episodes={episodes} onOpenEpisode={onOpenEpisode} />
      )}
    </Shell>
  )
}

// overflow-x-hidden: a flashcard flying off-screen must not grow the page
// sideways, or a horizontal scrollbar flickers in for the length of the animation.
function Shell({ children }) {
  return (
    <div className='fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden bg-[#fbf6ef] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 vocab-fade-in'>
      {children}
    </div>
  )
}
