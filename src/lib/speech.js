// Text-to-speech for vocabulary, via the Web Speech API.
//
// iOS Safari (and every iOS browser, which all run WebKit) needs three things
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

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined

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

  if (synth.speaking || synth.pending) {
    synth.cancel()
    // See (2) above. Speech is already unlocked if something was playing, so
    // leaving the gesture's call stack here is fine.
    setTimeout(() => current === utterance && synth.speak(utterance), 60)
  } else {
    synth.speak(utterance)
  }
}

let unlocked = false

/**
 * See (1) above. Install once; the first tap or key press anywhere unlocks
 * speech so that later calls from effects (auto-speak) are allowed.
 */
export function unlockOnFirstGesture() {
  if (!synth || unlocked) return
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    const silent = new SpeechSynthesisUtterance('')
    silent.volume = 0
    synth.speak(silent)
    for (const type of EVENTS) window.removeEventListener(type, unlock, true)
  }
  const EVENTS = ['touchend', 'click', 'keydown']
  for (const type of EVENTS) window.addEventListener(type, unlock, true)
}
