import { useEffect, useState, useSyncExternalStore } from 'react'

/** Current time, refreshed every `intervalMs` so due counts stay honest. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function subscribeHash(callback) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

/** location.hash without the leading "#", e.g. "vocab/study/12". */
export function useHashRoute() {
  return useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1))
}

export function navigate(route) {
  window.location.hash = route
}
