import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Cloud, CloudCheck, CloudOff, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { apiEnabled } from '../lib/api'
import { useAuth } from '../lib/auth'
import { renderGoogleButton } from '../lib/googleSignIn'
import { logout, syncNow, useSyncStatus } from '../lib/sync'

/**
 * Signed out: Google's own sign-in button. Signed in: the avatar, opening a
 * menu with the sync status, "sync now" and sign-out. Renders nothing when the
 * backend is not configured. `compact` is the round icon of the mobile
 * top bar; otherwise a pill with the name, for the desktop corner.
 */
export default function AccountButton({ compact = false }) {
  const auth = useAuth()
  if (!apiEnabled) return null
  return auth ? (
    <AccountMenu user={auth.user} compact={compact} />
  ) : (
    <SignInButton compact={compact} />
  )
}

function SignInButton({ compact }) {
  const ref = useRef(null)
  const { state, error } = useSyncStatus()
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    renderGoogleButton(ref.current, { compact }).catch(() => setLoadFailed(true))
  }, [compact])

  const signingIn = state === 'signing-in'
  return (
    <div className='relative flex flex-col items-end gap-1'>
      {/* Stays mounted: Google renders into it once. */}
      <div ref={ref} className={signingIn ? 'invisible' : ''} />
      {signingIn && (
        <div className='absolute inset-0 flex items-center justify-center gap-2 text-xs text-zinc-500'>
          <Loader2 size={16} className='animate-spin text-indigo-500' />
          {!compact && 'Đang đăng nhập…'}
        </div>
      )}
      {!compact && loadFailed && (
        <span className='text-xs text-red-500'>Không tải được nút Google</span>
      )}
      {!compact && state === 'error' && error && (
        <span className='max-w-56 text-right text-xs text-red-500'>{error}</span>
      )}
    </div>
  )
}

/** Google's photo, or the first letter when there is none or it fails to load. */
function Avatar({ user, className }) {
  const [broken, setBroken] = useState(false)
  if (user.avatarUrl && !broken) {
    return (
      <img
        src={user.avatarUrl}
        alt=''
        referrerPolicy='no-referrer'
        onError={() => setBroken(true)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span
      className={`${className} shrink-0 rounded-full bg-indigo-600 text-white font-semibold flex items-center justify-center`}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function SyncStatus({ state, lastSyncedAt, error }) {
  if (state === 'syncing') {
    return (
      <>
        <Cloud size={16} className='shrink-0 text-indigo-500' />
        <span>Đang đồng bộ…</span>
      </>
    )
  }
  if (state === 'error') {
    return (
      <>
        <CloudOff size={16} className='shrink-0 text-amber-500' />
        <span className='min-w-0 truncate' title={error}>
          Chưa đồng bộ được
        </span>
      </>
    )
  }
  const time =
    lastSyncedAt &&
    new Date(lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  return (
    <>
      <CloudCheck size={16} className='shrink-0 text-emerald-500' />
      <span>{time ? `Đã đồng bộ lúc ${time}` : 'Chưa đồng bộ'}</span>
    </>
  )
}

function AccountMenu({ user, compact }) {
  const [open, setOpen] = useState(false)
  const status = useSyncStatus()
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const syncing = status.state === 'syncing'
  return (
    <div ref={rootRef} className='relative'>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup='menu'
        aria-expanded={open}
        title={user.name}
        className={
          compact
            ? 'w-9 h-9 rounded-full shadow-lg ring-2 ring-white dark:ring-zinc-800 overflow-hidden'
            : 'flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur py-1 pl-1 pr-3 shadow-sm hover:bg-white dark:hover:bg-zinc-800 transition-colors'
        }
      >
        <Avatar user={user} className={compact ? 'w-full h-full text-sm' : 'w-8 h-8 text-sm'} />
        {!compact && (
          <>
            <span className='max-w-32 truncate text-sm font-medium'>{user.name}</span>
            <ChevronDown
              size={16}
              className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      {open && (
        // Mobile: pinned to the viewport, since the avatar sits mid-row and a
        // menu anchored to it would run off the left edge. Desktop: under the pill.
        <div
          role='menu'
          className='fixed right-4 top-16 lg:absolute lg:right-0 lg:top-12 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-4 text-sm text-zinc-900 dark:text-zinc-100'
        >
          <div className='flex items-center gap-3'>
            <Avatar user={user} className='w-10 h-10 text-base' />
            <div className='min-w-0'>
              <p className='font-semibold truncate'>{user.name}</p>
              <p className='text-xs text-zinc-500 dark:text-zinc-400 truncate'>{user.email}</p>
            </div>
          </div>

          <div className='mt-4 flex items-center gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 py-1.5 pl-3 pr-1.5 text-xs text-zinc-600 dark:text-zinc-300'>
            <SyncStatus {...status} />
            <button
              onClick={() => syncNow()}
              disabled={syncing}
              title='Đồng bộ ngay'
              aria-label='Đồng bộ ngay'
              className='ml-auto shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-white disabled:opacity-50'
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            </button>
          </div>

          <button
            role='menuitem'
            onClick={() => logout()}
            className='mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  )
}
