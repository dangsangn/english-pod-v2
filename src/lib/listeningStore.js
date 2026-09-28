// Listening history per episode, kept in localStorage: where playback stopped,
// how many times the episode was played, and when it was first finished.
// AudioPlayer writes it; sync.js pushes it and merges other devices' copies.

const STORAGE_KEY = 'englishpod_listening_v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch (error) {
    console.error('Error reading listening history:', error)
    return {}
  }
}

// episode id → { episodeId, positionSec, durationSec, playCount, completedAt,
//                firstPlayedAt, lastPlayedAt, updatedAt }
let records = load()
const localChangeListeners = new Set()

function setRecords(updater, { remote = false } = {}) {
  const next = updater(records)
  if (next === records) return
  records = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (error) {
    console.error('Error saving listening history:', error)
  }
  if (!remote) localChangeListeners.forEach((listener) => listener())
}

/** Called after every change made on this device (not after merging a sync). */
export function subscribeLocalListeningChanges(listener) {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}

// audio.duration is NaN before metadata loads and Infinity for live streams.
const seconds = (value) => (Number.isFinite(value) && value > 0 ? value : 0)

function update(episodeId, now, change) {
  setRecords((r) => {
    const record = r[episodeId] ?? {
      episodeId,
      positionSec: 0,
      durationSec: 0,
      playCount: 0,
      completedAt: null,
      firstPlayedAt: now,
      lastPlayedAt: now,
      updatedAt: now,
    }
    return { ...r, [episodeId]: { ...record, ...change(record), lastPlayedAt: now, updatedAt: now } }
  })
}

/** Playback started on a freshly loaded episode. */
export function recordPlay(episodeId, now = Date.now()) {
  update(episodeId, now, (record) => ({ playCount: record.playCount + 1 }))
}

export function recordPosition(episodeId, positionSec, durationSec, now = Date.now()) {
  update(episodeId, now, (record) => ({
    positionSec: seconds(positionSec),
    durationSec: seconds(durationSec) || record.durationSec,
  }))
}

/** Played to the end: remember the first time, and start from the top next time. */
export function recordCompleted(episodeId, durationSec, now = Date.now()) {
  update(episodeId, now, (record) => ({
    completedAt: record.completedAt ?? now,
    positionSec: 0,
    durationSec: seconds(durationSec) || record.durationSec,
  }))
}

/** Where to pick an episode back up, or 0 to start from the top. */
export function resumePosition(episodeId) {
  const record = records[episodeId]
  if (!record) return 0
  const { positionSec, durationSec } = record
  return positionSec > 5 && positionSec < durationSec - 5 ? positionSec : 0
}

// ---------------------------------------------------------------------------
// Sync

export function collectListeningChanges(since) {
  return Object.values(records).filter((record) => since === null || record.updatedAt >= since)
}

/** Same rule as the server: latest position wins, the counters never go back. */
function merge(local, remote) {
  if (!local) return remote
  const latest = remote.updatedAt > local.updatedAt ? remote : local
  const completed = [local.completedAt, remote.completedAt].filter((time) => time !== null)
  return {
    ...latest,
    playCount: Math.max(local.playCount, remote.playCount),
    completedAt: completed.length ? Math.min(...completed) : null,
    firstPlayedAt: Math.min(local.firstPlayedAt, remote.firstPlayedAt),
    lastPlayedAt: Math.max(local.lastPlayedAt, remote.lastPlayedAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}

export function applyRemoteListening(remote) {
  if (!remote.length) return
  setRecords(
    (r) => {
      const next = { ...r }
      for (const record of remote) next[record.episodeId] = merge(next[record.episodeId], record)
      return next
    },
    { remote: true },
  )
}

export function clearListening() {
  setRecords(() => ({}), { remote: true })
}
