// Choosing the voice English is read in.
//
// Browsers list every installed voice, alphabetically on Apple devices, so
// "the first en-US voice" is Aaron or the novelty Albert: both robotic, while
// Samantha or a downloaded Enhanced/Premium voice sits further down. So voices
// are ranked instead. scripts/verify_speech.js checks the ranking against the
// lists real browsers report.

/** What the ranking reads from a SpeechSynthesisVoice. */
export type VoiceInfo = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>

// Apple's novelty and Eloquence voices: fun or robotic, a last resort only.
const ROBOTIC =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i

// Voices that sound natural out of the box, across Apple, Google and Microsoft,
// best first: the order breaks ties.
const NATURAL = [
  'Samantha',
  'Ava',
  'Allison',
  'Susan',
  'Tom',
  'Nathan',
  'Zoe',
  'Evan',
  'Joelle',
  'Noelle',
  'Nicky',
  'Microsoft Aria',
  'Microsoft Jenny',
  'Microsoft Guy',
  'Google US English',
]

function naturalBonus(name: string): number {
  const i = NATURAL.findIndex((n) => name === n || name.startsWith(`${n} `))
  return i === -1 ? 0 : 30 + (NATURAL.length - i) / NATURAL.length
}

function score(voice: VoiceInfo): number {
  if (!/^en[-_]/i.test(voice.lang)) return -Infinity
  if (ROBOTIC.test(voice.name)) return -100
  let s = 0
  if (/\bpremium\b/i.test(voice.name)) s += 60
  else if (/\b(enhanced|neural|natural)\b/i.test(voice.name)) s += 50
  s += naturalBonus(voice.name)
  if (/^en[-_]US$/i.test(voice.lang)) s += 20
  // A local voice starts at once; a network one (Chrome's Google voices) waits
  // for a round trip, so it only wins on quality.
  if (voice.localService) s += 5
  return s
}

/** The best English voice among `voices`, or null when there is none. */
export function pickVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  let best: V | null = null
  let bestScore = -Infinity
  for (const voice of voices) {
    const s = score(voice)
    if (s > bestScore) {
      best = voice
      bestScore = s
    }
  }
  return best
}
