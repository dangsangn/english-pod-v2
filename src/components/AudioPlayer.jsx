import { useState, useRef, useEffect } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  ArrowRightCircle,
  FastForward,
  Rewind,
  Loader2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react'
import { getAudioSources } from '../lib/audioSources'
import {
  recordCompleted,
  recordPlay,
  recordPosition,
  resumePosition,
} from '../lib/listeningStore'

// While playing, the position is saved this often (and on pause, episode
// change, and when the page is hidden).
const SAVE_EVERY_MS = 15_000

function savePosition(loaded) {
  if (loaded) recordPosition(loaded.episodeId, loaded.time, loaded.duration)
}

const AudioPlayer = ({ episode, onNext, onPrev, hasNext, hasPrev }) => {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // Feature States
  const [autoPlayNext, setAutoPlayNext] = useState(true)
  const [isLooping, setIsLooping] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  // Source failover: no single host is reliable, so we walk an ordered list and
  // move to the next one whenever the current URL errors out.
  const sources = getAudioSources(episode)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [renderedEpisodeId, setRenderedEpisodeId] = useState(episode.id)
  // Where to pick playback back up: the saved position when an episode opens,
  // or the current one after swapping sources mid-listen.
  const resumeRef = useRef({ time: resumePosition(episode.id), wasPlaying: false })
  // The episode whose source has loaded, with its latest position. Only set
  // after loadedmetadata, so the 0:00 of a source being swapped in is never
  // saved over where the listener actually was.
  const loadedRef = useRef(null) // { episodeId, src, time, duration }
  const lastSavedAtRef = useRef(0)
  const countedPlayRef = useRef(null) // episode id whose play is already counted

  // Reset the chain when the episode changes. Done during render rather than in
  // an effect so <audio> never briefly points at the previous episode's
  // fallback URL and kicks off a wasted request.
  if (renderedEpisodeId !== episode.id) {
    setRenderedEpisodeId(episode.id)
    setSourceIndex(0)
    setLoadFailed(false)
    setProgress(0)
    setCurrentTime(0)
    setDuration(0)
    resumeRef.current = { time: resumePosition(episode.id), wasPlaying: false }
  }

  const currentSrc = sources[sourceIndex]

  // (Re)load whenever the active URL changes — new episode, failover, or retry.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentSrc) return

    // Moving to another episode: keep where the previous one stopped.
    if (loadedRef.current?.episodeId !== episode.id) savePosition(loadedRef.current)
    loadedRef.current = null

    audio.volume = isMuted ? 0 : volume
    audio.playbackRate = playbackRate
    audio.load()

    const { time, wasPlaying } = resumeRef.current
    // On a fresh episode we always attempt autoplay (usually blocked on the
    // very first load, allowed after navigation). On a failover we only resume
    // if the listener was actually playing when the source died.
    const shouldPlay = sourceIndex === 0 || wasPlaying

    const onLoadedMetadata = () => {
      if (time > 0) audio.currentTime = time
      loadedRef.current = {
        episodeId: episode.id,
        src: currentSrc,
        time: audio.currentTime,
        duration: audio.duration,
      }
      if (!shouldPlay) return
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    return () =>
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSrc, reloadNonce])

  const handleError = () => {
    // Read the position from state, not from the element: a failed load has
    // already reset audio.currentTime to 0 by the time this fires.
    resumeRef.current = { time: currentTime, wasPlaying: isPlaying }

    if (sourceIndex < sources.length - 1) {
      setSourceIndex(sourceIndex + 1)
      return
    }

    // Out of sources. Stop the spinner — without this it spins forever, which
    // is exactly what users saw when archive.org was unreachable.
    setIsBuffering(false)
    setIsPlaying(false)
    setLoadFailed(true)
  }

  const handleRetry = () => {
    resumeRef.current = { time: currentTime, wasPlaying: true }
    setLoadFailed(false)
    setSourceIndex(0)
    // Forces the load effect to re-run even when sourceIndex is already 0.
    setReloadNonce((n) => n + 1)
  }

  // Volume & Mute effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Playback Speed effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // Closing the tab or backgrounding the app (iOS rarely fires pagehide).
  useEffect(() => {
    const flush = () => savePosition(loadedRef.current)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const saveProgress = () => {
    lastSavedAtRef.current = Date.now()
    savePosition(loadedRef.current)
  }

  const handlePlay = () => {
    if (countedPlayRef.current === episode.id) return
    countedPlayRef.current = episode.id
    recordPlay(episode.id)
  }

  const togglePlay = () => {
    if (audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error(e))
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const current = audioRef.current.currentTime
    const dur = audioRef.current.duration
    setCurrentTime(current)
    setDuration(dur)
    if (dur) setProgress((current / dur) * 100)

    const loaded = loadedRef.current
    if (loaded?.src !== currentSrc) return
    loaded.time = current
    loaded.duration = dur
    if (!audioRef.current.paused && Date.now() - lastSavedAtRef.current >= SAVE_EVERY_MS) {
      saveProgress()
    }
  }

  const handleSeek = (e) => {
    if (!audioRef.current) return
    const width = e.currentTarget.clientWidth
    const clickX = e.nativeEvent.offsetX
    const duration = audioRef.current.duration
    const newTime = (clickX / width) * duration
    audioRef.current.currentTime = newTime
    setProgress((newTime / duration) * 100)
  }

  const handleEnded = () => {
    recordCompleted(episode.id, audioRef.current.duration)
    if (loadedRef.current) loadedRef.current.time = 0
    // Playing it again (loop or by hand) counts as another listen.
    countedPlayRef.current = null
    setIsPlaying(false)
    if (isLooping) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
    } else if (autoPlayNext && hasNext) {
      onNext()
    }
  }

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '0:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className='flex flex-col gap-4'>
      <audio
        ref={audioRef}
        src={currentSrc}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={saveProgress}
        onEnded={handleEnded}
        onError={handleError}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onLoadStart={() => setIsBuffering(true)}
      />

      {loadFailed && (
        <div className='flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/30'>
          <div className='flex items-center gap-2 text-sm text-red-700 dark:text-red-300'>
            <AlertTriangle size={16} className='shrink-0' />
            <span>Couldn&apos;t load this episode from any source.</span>
          </div>
          <button
            onClick={handleRetry}
            className='flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500'
          >
            <RotateCw size={14} />
            Retry
          </button>
        </div>
      )}

      {/* Progress Bar */}
      <div
        className='w-full group cursor-pointer'
        role='slider'
        tabIndex={0}
        aria-label='Audio progress'
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        onClick={handleSeek}
        onKeyDown={(e) => {
          if (!audioRef.current || !audioRef.current.duration) return
          const dur = audioRef.current.duration
          if (e.key === 'ArrowRight')
            audioRef.current.currentTime = Math.min(
              dur,
              audioRef.current.currentTime + 5,
            )
          else if (e.key === 'ArrowLeft')
            audioRef.current.currentTime = Math.max(
              0,
              audioRef.current.currentTime - 5,
            )
        }}
      >
        <div className='h-1.5 bg-zinc-200 dark:bg-zinc-700/50 rounded-full overflow-hidden relative'>
          <div
            className='h-full bg-indigo-500 from-indigo-500 to-cyan-400 group-hover:from-indigo-400 group-hover:to-cyan-300 transition-all duration-100 absolute top-0 left-0'
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className='flex flex-col md:flex-row items-center justify-between gap-4'>
        {/* Time Display (Left on desktop) */}
        <div className='text-xs text-zinc-500 dark:text-zinc-400 font-mono hidden md:block w-24 md:w-1/3'>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Main Controls */}
        <div className='flex items-center gap-4 lg:gap-6 md:w-1/3'>
          {/* Skip Buttons */}
          <button
            className='text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-colors p-2'
            onClick={() => {
              audioRef.current.currentTime -= 10
            }}
            title='-10s'
          >
            <Rewind size={20} />
          </button>

          {/* Prev Episode */}
          <button
            className={`text-zinc-400 transition-colors p-2 ${hasPrev ? 'hover:text-indigo-600 dark:hover:text-white' : 'opacity-30 cursor-not-allowed'}`}
            onClick={onPrev}
            disabled={!hasPrev}
            title='Previous Episode'
          >
            <SkipBack size={24} />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className='p-4 bg-indigo-600 dark:bg-white text-white dark:text-zinc-900 rounded-full hover:scale-105 transition-transform shadow-lg shadow-indigo-500/30 dark:shadow-white/10'
          >
            {isBuffering ? (
              <Loader2 size={20} className='animate-spin' />
            ) : isPlaying ? (
              <Pause size={20} fill='currentColor' className='' />
            ) : (
              <Play size={20} fill='currentColor' className='ml-1' />
            )}
          </button>

          {/* Next Episode */}
          <button
            className={`text-zinc-400 transition-colors p-2 ${hasNext ? 'hover:text-indigo-600 dark:hover:text-white' : 'opacity-30 cursor-not-allowed'}`}
            onClick={onNext}
            disabled={!hasNext}
            title='Next Episode'
          >
            <SkipForward size={24} />
          </button>

          {/* Skip Forward */}
          <button
            className='text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-colors p-2'
            onClick={() => {
              audioRef.current.currentTime += 10
            }}
            title='+10s'
          >
            <FastForward size={20} />
          </button>
        </div>

        {/* Right Side: Volume & Modes */}
        <div className='flex items-center justify-end gap-4 md:w-1/3'>
          {/* Loop Toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-2 rounded-lg transition-colors ${isLooping ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title='Loop Episode'
          >
            <Repeat size={18} />
          </button>

          {/* Autoplay Toggle */}
          <button
            onClick={() => setAutoPlayNext(!autoPlayNext)}
            className={`p-2 rounded-lg transition-colors ${autoPlayNext ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
            title='Autoplay Next'
          >
            <ArrowRightCircle
              size={18}
              className={autoPlayNext ? '' : 'opacity-50'}
            />
          </button>

          {/* Playback Speed */}
          <button
            onClick={() => {
              const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]
              const idx = speeds.indexOf(playbackRate)
              setPlaybackRate(speeds[(idx + 1) % speeds.length])
            }}
            className='w-12 text-xs font-bold text-zinc-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-white transition-colors border border-zinc-200 dark:border-zinc-700/50 rounded px-1 py-0.5 hover:border-indigo-500 dark:hover:border-indigo-400'
            title='Playback Speed'
          >
            {playbackRate}x
          </button>

          {/* Volume Control */}
          <div className='hidden md:flex items-center gap-2 group'>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className='text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={20} />
              ) : (
                <Volume2 size={20} />
              )}
            </button>
            <div className='w-0 overflow-hidden group-hover:w-20 transition-all duration-300 ease-in-out'>
              <input
                type='range'
                min='0'
                max='1'
                step='0.05'
                value={volume}
                onChange={(e) => {
                  setVolume(parseFloat(e.target.value))
                  setIsMuted(false)
                }}
                className='w-20 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400'
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Time Display (Visible only on small screens) */}
      <div className='md:hidden flex justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono px-1'>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}

export default AudioPlayer
