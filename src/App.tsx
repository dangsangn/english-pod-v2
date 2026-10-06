import { useState } from 'react'
import { Flower2, Menu, X } from 'lucide-react'
import classNames from 'classnames'
import EpisodeList from './components/EpisodeList'
import AudioPlayer from './components/AudioPlayer'
import Transcript from './components/Transcript'
import { ThemeProvider } from './components/ThemeProvider'
import ThemeToggle from './components/ThemeToggle'
import Footer from './components/Footer'
import VocabApp from './components/vocab/VocabApp'
import EpisodeVocabButton from './components/vocab/EpisodeVocabButton'
import AccountButton from './components/AccountButton'
import { getSrsState, updateSettings, useSrs } from './lib/srsStore'
import { navigate, useHashRoute } from './lib/hooks'
import type { Episode } from './types'
import episodesJson from './data/episodes.json'

const episodesData: Episode[] = episodesJson

// Last episode opened: part of the synced settings (see src/lib/srsStore.ts).
const getLastEpisodeId = () => {
  const id = getSrsState().settings.lastEpisodeId
  return id !== null && episodesData.some((ep) => ep.id === id) ? id : episodesData[0]?.id || 0
}

function AppContent() {
  const [currentEpisodeId, setCurrentEpisodeId] = useState(() => getLastEpisodeId())
  // An episode the listener picks starts playing; one followed from another
  // device only loads.
  const [autoPlay, setAutoPlay] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  // Saved only when the listener picks an episode: the first-episode default of
  // a fresh install must not overwrite the episode another device synced.
  const openEpisode = (id: number) => {
    setAutoPlay(true)
    setCurrentEpisodeId(id)
    updateSettings({ lastEpisodeId: id })
  }

  // The last episode also changes when a sync brings in another device's
  // choice: open it here too, unless this device is in the middle of playing.
  // (Adjusted during render, React's pattern for following a changing value.)
  const syncedEpisodeId = useSrs().settings.lastEpisodeId
  const [followedEpisodeId, setFollowedEpisodeId] = useState(syncedEpisodeId)
  if (syncedEpisodeId !== followedEpisodeId) {
    setFollowedEpisodeId(syncedEpisodeId)
    const known = episodesData.some((ep) => ep.id === syncedEpisodeId)
    if (known && syncedEpisodeId !== null && syncedEpisodeId !== currentEpisodeId && !isPlaying) {
      setAutoPlay(false)
      setCurrentEpisodeId(syncedEpisodeId)
    }
  }
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const route = useHashRoute()
  const isVocabOpen = route === 'vocab' || route.startsWith('vocab/')

  // An unknown id (e.g. an episode since removed) falls back to the first one.
  const currentIndex = Math.max(
    0,
    episodesData.findIndex((ep) => ep.id === currentEpisodeId),
  )
  const currentEpisode = episodesData[currentIndex]
  const hasNext = currentIndex < episodesData.length - 1
  const hasPrev = currentIndex > 0

  const handleNextEpisode = () => {
    if (hasNext) openEpisode(episodesData[currentIndex + 1].id)
  }

  const handlePreviousEpisode = () => {
    if (hasPrev) openEpisode(episodesData[currentIndex - 1].id)
  }

  return (
    <div className='flex h-screen overflow-hidden bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300 relative selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-indigo-900 dark:selection:text-indigo-100'>
      {/* Rendered over the podcast view, which stays mounted so the player keeps its
          place; the player pauses while this is open and resumes after (see `suspended`). */}
      {isVocabOpen && (
        <VocabApp
          route={route}
          episodes={episodesData}
          onOpenEpisode={(id) => {
            openEpisode(id)
            navigate('')
          }}
        />
      )}

      {/* Light mode ambient background mesh */}
      <div className='absolute inset-0 z-0 pointer-events-none overflow-hidden dark:hidden'>
        <div className='absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-200/30 blur-[100px]' />
        <div className='absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-200/30 blur-[100px]' />
      </div>

      {/* Mobile sidebar toggle */}
      <div className='lg:hidden fixed top-4 right-4 z-50 flex gap-2'>
        <AccountButton compact />
        <button
          type='button'
          onClick={() => navigate('vocab')}
          className='p-2 bg-rose-500 rounded-full shadow-lg text-white hover:bg-rose-600 transition-colors'
          title='Vocabulary'
        >
          <Flower2 size={20} />
        </button>
        <ThemeToggle />
        <button
          type='button'
          onClick={() => setIsSidebarOpen((open) => !open)}
          aria-expanded={isSidebarOpen}
          aria-controls='episode-sidebar'
          aria-label={isSidebarOpen ? 'Close episode list' : 'Open episode list'}
          className='w-9 h-9 flex items-center justify-center p-2 bg-indigo-600 rounded-full shadow-lg text-white hover:bg-indigo-700 transition-colors'
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Sidebar: Episode List */}
      <aside
        id='episode-sidebar'
        className={classNames(
          'fixed inset-y-0 left-0 z-40 w-80 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:w-96',
          'glass-panel border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className='p-6 pb-3 border-b border-zinc-200 dark:border-zinc-800/50 flex justify-between items-start bg-white/50 dark:bg-transparent'>
          <div>
            <div className='flex items-center gap-3 mb-2'>
              <img
                src='./logo.jpg'
                alt='EnglishPod Logo'
                className='w-10 h-10 rounded-full object-cover shadow-md'
              />
              <h1 className='text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400'>
                EnglishPod
              </h1>
            </div>
            <p className='text-zinc-500 dark:text-zinc-400 text-sm mt-1'>
              Learn English through 300+ conversations at various levels.
            </p>

            <button
              type='button'
              onClick={() => navigate('vocab')}
              className='mt-2 flex items-center gap-2 px-3 py-3 text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 rounded-full hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors w-full'
            >
              <Flower2 size={20} />
              Vocabulary Garden
            </button>
          </div>
          <div className='hidden lg:block'>
            <ThemeToggle />
          </div>
        </div>

        <EpisodeList
          episodes={episodesData}
          currentId={currentEpisode.id}
          onSelect={(id) => {
            openEpisode(id)
            setIsSidebarOpen(false)
          }}
        />
      </aside>

      {/* Main Content */}
      <div className='flex-1 flex flex-col relative w-full lg:w-auto h-full overflow-hidden bg-white/30 dark:bg-transparent'>
        {/* Desktop account corner; on mobile it lives in the fixed top bar. */}
        <div className='hidden lg:block absolute top-4 right-6 z-30'>
          <AccountButton />
        </div>

        {/* Transcript Area (Scrollable) */}
        <div className='flex-1 overflow-y-auto scroll-smooth'>
          <div className='max-w-4xl mx-auto min-h-full flex flex-col px-4 lg:px-8 pb-8'>
            <div className='flex-1 space-y-6'>
              <div className='space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-16 lg:pt-8 lg:pr-56'>
                <span className='inline-block px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'>
                  {currentEpisode.level || 'General'}
                </span>
                <h2 className='text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-white tracking-tight'>
                  {currentEpisode.title}
                </h2>
                <EpisodeVocabButton episode={currentEpisode} />
              </div>

              <Transcript episode={currentEpisode} />
            </div>
          </div>
        </div>

        {/* Bottom Bar: Player + Footer */}
        <div className='flex-none z-30 glass-panel border-t border-zinc-200 dark:border-zinc-800/50 backdrop-blur-2xl bg-white/80 dark:bg-zinc-900/95 flex flex-col'>
          <div className='p-4 lg:p-6 pb-2 lg:pb-4'>
            <div className='max-w-4xl mx-auto'>
              <AudioPlayer
                episode={currentEpisode}
                suspended={isVocabOpen}
                autoPlay={autoPlay}
                onPlayingChange={setIsPlaying}
                onNext={handleNextEpisode}
                onPrev={handlePreviousEpisode}
                hasNext={hasNext}
                hasPrev={hasPrev}
              />
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
