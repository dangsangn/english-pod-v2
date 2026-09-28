// Text-to-speech for vocabulary, via the Web Speech API.
//
// iOS Safari (and every iOS browser, which all run WebKit) needs four things
// desktop browsers don't:
//
// 1. Speech must first be started from a user gesture. Until then speak() is
//    silently ignored — which is why auto-speaking a card as it appears works
//    on desktop and never on an iPhone. unlockOnFirstGesture() speaks an empty
//    utterance on the first tap, after which speech started from code works.
// 2. cancel() followed by speak() in the same tick drops the new utterance.
//    So cancel only when something is actually playing, and speak a moment
//    later in that case.
// 3. With the phone set to Vietnamese, `lang = 'en-US'` alone may not pick an
//    English voice. Choose one explicitly.
// 4. With the ring/silent switch on silent, speech is muted on the built-in
//    speaker (headphones still work), while the podcast <audio> plays fine.
//    iOS files speech under "ambient" sound, which the switch silences, and
//    media elements under "playback", which it does not. So the page's audio
//    session is moved to playback: through navigator.audioSession where
//    Safari has it (17+), and otherwise by looping a silent <audio> clip for
//    as long as a word is being spoken.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined

/** False where the browser has no speech synthesis at all (the games skip listening then). */
export const canSpeak = Boolean(synth)

const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

let englishVoice = null

function pickVoice() {
  const voices = synth?.getVoices() ?? []
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang))
  englishVoice =
    english.find((v) => /^en[-_]US$/i.test(v.lang) && v.localService) ||
    english.find((v) => /^en[-_]US$/i.test(v.lang)) ||
    english[0] ||
    null
}

if (synth) {
  pickVoice()
  // Voices load asynchronously (always on Chrome, sometimes on iOS).
  synth.addEventListener?.('voiceschanged', pickVoice)
}

// ------------------------------------------------------------ (4) silent switch

function setPlaybackSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    // Older Safari: fall back to the silent clip below.
  }
}

/** One second of 8 kHz, 8-bit mono silence as a WAV blob URL. */
function silentWavUrl() {
  const samples = 8000
  const view = new DataView(new ArrayBuffer(44 + samples))
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true) // sample rate
  view.setUint32(28, 8000, true) // byte rate
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples, true)
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128) // 8-bit silence
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }))
}

let keepAlive = null

function silentClip() {
  if (!keepAlive) {
    keepAlive = new Audio(silentWavUrl())
    keepAlive.loop = true
  }
  return keepAlive
}

/** The podcast player, if it is playing — then the session is playback already. */
function otherMediaPlaying() {
  return [...document.querySelectorAll('audio, video')].some((m) => !m.paused && !m.ended)
}

let releaseTimer = null

/**
 * Hold the playback session while `utterance` is spoken. Resolves once the
 * silent clip is playing (or straight away when it isn't needed), so speech
 * starts after the session has switched rather than being muted from the start.
 */
function holdPlaybackSession(utterance) {
  setPlaybackSession()
  if (!IS_IOS || otherMediaPlaying()) return Promise.resolve()

  const clip = silentClip()
  const release = () => {
    // Only the utterance that is current may stop the clip: a word that was
    // cut off by a newer one must not silence the newer one.
    if (current !== utterance) return
    clearTimeout(releaseTimer)
    clip.pause()
  }
  utterance.addEventListener('end', release)
  utterance.addEventListener('error', release)
  clearTimeout(releaseTimer)
  // iOS sometimes never fires `end`; don't leave the clip looping forever.
  releaseTimer = setTimeout(release, 15000)

  const started = clip.play().catch(() => {})
  // Don't hold the word back for long if play() is slow to settle.
  return Promise.race([started, new Promise((r) => setTimeout(r, 250))])
}

// ------------------------------------------------------------------- speaking

// iOS garbage-collects an utterance that nothing references, cutting it off.
let current = null

/** Read an English word or phrase aloud, slowly, for learners. */
export function speak(text) {
  if (!text || !synth) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.8
  if (englishVoice) utterance.voice = englishVoice
  current = utterance

  // A paused engine (iOS after the tab was backgrounded) ignores new speech.
  if (synth.paused) synth.resume()

  const wasBusy = synth.speaking || synth.pending
  if (wasBusy) synth.cancel()

  holdPlaybackSession(utterance).then(() => {
    if (current !== utterance) return // a newer word took over meanwhile
    if (wasBusy) {
      // See (2) above. Speech is already unlocked if something was playing, so
      // leaving the gesture's call stack here is fine.
      setTimeout(() => current === utterance && synth.speak(utterance), 60)
    } else {
      synth.speak(utterance)
    }
  })
}

let unlocked = false

/**
 * See (1) and (4) above. Install once; the first tap or key press anywhere
 * unlocks speech — and, on iOS, the silent clip — so that later calls from
 * effects (auto-speak) are allowed to play.
 */
export function unlockOnFirstGesture() {
  if (!synth || unlocked) return
  const EVENTS = ['touchend', 'click', 'keydown']
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    for (const type of EVENTS) window.removeEventListener(type, unlock, true)

    setPlaybackSession()
    if (IS_IOS) {
      // Media elements also need one play() from a gesture before code may
      // start them. Start and stop straight away.
      const clip = silentClip()
      clip.play().then(() => clip.pause(), () => {})
    }

    const silent = new SpeechSynthesisUtterance('')
    silent.volume = 0
    synth.speak(silent)
  }
  for (const type of EVENTS) window.addEventListener(type, unlock, true)
}
