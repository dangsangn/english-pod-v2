/** Read an English word or phrase aloud, slowly, for learners. */
export function speak(text) {
  if (!text || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.8
  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
}
