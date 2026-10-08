// Shapes of the static data the app ships with.

/** One entry of src/data/episodes.json. */
export interface Episode {
  id: number
  original_title: string
  title: string
  level: string
  mp3: string
  audio_path?: string
  audio_kind?: string
  poster: string
  transcript_id: string
  transcript_url: string
}

/** A common phrase built on a word: "make sure" — "đảm bảo". */
export interface Collocation {
  en: string
  vi: string
}

/**
 * One entry of public/vocab/englishpod_XXXX.json (scripts/build_vocab.js) or of
 * public/core/core_NN.json (scripts/build_core.js).
 */
export interface VocabEntry {
  word: string
  ipa?: string
  type?: string
  def?: string
  vi?: string
  viDef?: string
  /** Example sentence (one sentence, from the dialogue or written for it). */
  ex?: string
  /** `ex`'s text for the word itself, exactly as it occurs there ("grabbed" for "grab"). */
  exHit?: string
  /** Vietnamese translation of `ex`. */
  exVi?: string
  /** Synonyms for this sense (Top 1000 only). */
  syn?: string[]
  /** Common phrases built on the word, with their Vietnamese (Top 1000 only). */
  col?: Collocation[]
  /** The episode `ex` comes from (Top 1000 only; an episode's own examples are from itself). */
  exEp?: number
}
