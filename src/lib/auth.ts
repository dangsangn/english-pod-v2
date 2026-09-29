// Who is signed in: { user: { id, email, name, avatarUrl } } or null.
//
// The session itself is an HttpOnly cookie this code cannot see; this is only
// what the UI shows, kept in localStorage so a reload stays signed in. A 401
// from the server is the real answer, and sync.ts clears this when it gets one.

import { useSyncExternalStore } from 'react'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export interface Auth {
  user: User
}

const STORAGE_KEY = 'englishpod_auth_v1'

function load(): Auth | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') || null
  } catch {
    return null
  }
}

let auth = load()
const listeners = new Set<() => void>()

export function setAuth(next: Auth | null) {
  auth = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Error saving sign-in:', error)
  }
  listeners.forEach((listener) => listener())
}

export const getAuth = () => auth
export const clearAuth = () => setAuth(null)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAuth() {
  return useSyncExternalStore(subscribe, () => auth)
}
