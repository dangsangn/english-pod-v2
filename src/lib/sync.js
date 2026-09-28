// Background sync between this device's localStorage and the backend.
//
// Signed in means the server set an HttpOnly session cookie (see api.js); this
// module only keeps the user for the UI (auth.js) and drops it on a 401.
//
// The local vocabulary store (srsStore) stays what the UI reads and writes. Once signed in, this module sends POST /sync with whatever changed
// since the last successful push, plus a cursor; the server merges (last write
// wins) and answers with everything other devices changed after that cursor.
//
// Synced: vocabulary study (cards, decks, review logs, daily counts) and the
// settings, which include the episode currently open.
//
// When: right after sign-in, on start, 2 s after a local change, when the tab
// comes back, and when the network does. Failures retry with backoff.

import { useSyncExternalStore } from 'react'
import { api, ApiError, apiEnabled } from './api'
import { clearAuth, getAuth, setAuth } from './auth'
import { setCredentialHandler } from './googleSignIn'
import {
  applySyncResult,
  clearLocalProgress,
  collectSrsChanges,
  getSrsState,
  setReviewLogging,
  subscribeLocalChanges,
} from './srsStore'
import { uuid } from './uuid'

const META_KEY = 'englishpod_sync_v1'
const CHANGE_DELAY_MS = 2_000
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000]

// ownerId: the account this device's progress belongs to (null: made signed out).
// legacyDays: daily counts from before sign-in, sent once with the first sync.
const EMPTY_META = { ownerId: null, cursor: null, lastPushAt: null, lastSyncedAt: null, legacyDays: null }

function loadMeta() {
  try {
    return { ...EMPTY_META, ...JSON.parse(localStorage.getItem(META_KEY)) }
  } catch {
    return EMPTY_META
  }
}

let meta = loadMeta()

function saveMeta(patch) {
  meta = { ...meta, ...patch }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch (error) {
    console.error('Error saving sync state:', error)
  }
}

// ---------------------------------------------------------------------------
// Status for the UI: state is 'idle' | 'signing-in' | 'syncing' | 'error'.

let status = { state: 'idle', lastSyncedAt: meta.lastSyncedAt, error: null }
const listeners = new Set()

function setStatus(patch) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => status)
}

// ---------------------------------------------------------------------------
// Scheduling

let timer = null
let timerDue = Infinity
let inFlight = null
let retries = 0

function cancelScheduled() {
  clearTimeout(timer)
  timer = null
  timerDue = Infinity
}

/** Sync in `delay` ms, unless one is already due sooner. */
function scheduleSync(delay) {
  if (!getAuth()) return
  const due = Date.now() + delay
  if (timer && timerDue <= due) return
  cancelScheduled()
  timerDue = due
  timer = setTimeout(() => {
    timer = null
    timerDue = Infinity
    syncNow()
  }, delay)
}

/** Sync now, or join the sync already running. Resolves to whether it succeeded. */
export function syncNow() {
  inFlight ??= runSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runSync() {
  if (!getAuth()) return false
  cancelScheduled()
  setStatus({ state: 'syncing', error: null })

  const since = meta.cursor === null ? null : meta.lastPushAt
  const srs = collectSrsChanges(since)
  const pushStartedAt = Date.now()

  try {
    const response = await api('/sync', {
      method: 'POST',
      body: { cursor: meta.cursor, changes: { ...srs, legacyDays: meta.legacyDays } },
    })
    applySyncResult(srs, response)
    saveMeta({
      cursor: response.cursor,
      lastPushAt: pushStartedAt,
      lastSyncedAt: Date.now(),
      legacyDays: null,
    })
    retries = 0
    setStatus({ state: 'idle', lastSyncedAt: meta.lastSyncedAt })
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Session expired or revoked. The progress and ownerId stay, so signing
      // back in to the same account just carries on.
      clearAuth()
      setStatus({ state: 'idle', error: null })
      return false
    }
    console.error('Sync failed:', error)
    setStatus({ state: 'error', error: error.message })
    const retryable =
      error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500)
    if (retryable) scheduleSync(RETRY_DELAYS_MS[Math.min(retries++, RETRY_DELAYS_MS.length - 1)])
    return false
  }
}

// ---------------------------------------------------------------------------
// Signing in and out


/** After the backend accepted a sign-in: decide what happens to local data, then sync. */
async function completeSignIn(result) {
  if (meta.ownerId !== result.user.id) {
    if (meta.ownerId !== null) {
      // Progress of a different account: never merge it into this one.
      clearLocalProgress()
      saveMeta({ ...EMPTY_META, ownerId: result.user.id })
    } else {
      // Made before signing in: it joins this account on the first sync.
      const { days } = getSrsState()
      saveMeta({
        ...EMPTY_META,
        ownerId: result.user.id,
        legacyDays: Object.keys(days).length ? { importId: uuid(), days } : null,
      })
    }
  }
  setAuth(result)
  setReviewLogging(true)
  await syncNow()
}

async function loginWithGoogle(credential) {
  setStatus({ state: 'signing-in', error: null })
  let result
  try {
    result = await api('/auth/google', { method: 'POST', body: { credential } })
  } catch (error) {
    console.error('Sign-in failed:', error)
    setStatus({ state: 'error', error: `Đăng nhập thất bại (${error.code}), thử lại sau.` })
    return
  }
  await completeSignIn(result)
}

export async function logout() {
  if (inFlight) await inFlight
  const synced = await syncNow()
  if (!synced && !window.confirm('Còn thay đổi chưa đồng bộ lên server. Vẫn đăng xuất?')) return

  // Clears the cookie too; if it fails the session just expires server-side.
  api('/auth/logout', { method: 'POST' }).catch(() => {})
  cancelScheduled()
  clearAuth()
  setReviewLogging(false)
  clearLocalProgress()
  saveMeta(EMPTY_META)
  setStatus({ state: 'idle', lastSyncedAt: null, error: null })
}

// ---------------------------------------------------------------------------

let started = false

/** Hook everything up once, at app start. A no-op when the backend is not configured. */
export function startSync() {
  if (!apiEnabled || started) return
  started = true

  setCredentialHandler(loginWithGoogle)
  setReviewLogging(meta.ownerId !== null)
  subscribeLocalChanges(() => scheduleSync(CHANGE_DELAY_MS))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  window.addEventListener('online', () => scheduleSync(0))
  scheduleSync(0)

  // `npm run session` in server/ prints a __devSignIn(...) call for this.
  if (import.meta.env.DEV) window.__devSignIn = completeSignIn
}
