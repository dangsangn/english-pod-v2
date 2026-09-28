import { useEffect, useRef, useState } from 'react'
import { Loader2, LogOut, RefreshCw } from 'lucide-react'
import { apiEnabled } from '../lib/api'
import { useAuth } from '../lib/auth'
import { renderGoogleButton } from '../lib/googleSignIn'
import { logout, syncNow, useSyncStatus } from '../lib/sync'

/**
 * Signed out: Google's own sign-in button. Signed in: the avatar, opening a
 * menu with the sync status, "sync now" and sign-out. Renders nothing when the
 * backend is not configured.
 */
export default function AccountButton({ compact = false, menuAlign = 'right' }) {
  const auth = useAuth()
  if (!apiEnabled) return null
  return auth ? (
    <AccountMenu user={auth.user} menuAlign={menuAlign} />
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
    <div className='relative flex flex-col items-start gap-1'>
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
        <span className='text-xs text-red-500'>{error}</span>
      )}
    </div>
  )
}

function syncLabel({ state, lastSyncedAt, error }) {
  if (state === 'syncing') return 'Đang đồng bộ…'
  if (state === 'error') return `Chưa đồng bộ được: ${error}`
  if (!lastSyncedAt) return 'Chưa đồng bộ'
  const time = new Date(lastSyncedAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Đồng bộ lúc ${time}`
}

function AccountMenu({ user, menuAlign }) {
  const [open, setOpen] = useState(false)
  const status = useSyncStatus()
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className='relative'>
      <button
        onClick={() => setOpen(!open)}
        className='w-9 h-9 rounded-full overflow-hidden shadow-lg ring-2 ring-white dark:ring-zinc-800 bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center'
        title={user.name}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=''
            referrerPolicy='no-referrer'
            className='w-full h-full object-cover'
          />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </button>

      {open && (
        <div
          className={`absolute ${menuAlign === 'left' ? 'left-0' : 'right-0'} top-11 z-50 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-3 text-sm`}
        >
          <p className='font-semibold truncate'>{user.name}</p>
          <p className='text-xs text-zinc-500 dark:text-zinc-400 truncate'>{user.email}</p>
          <p className='mt-3 text-xs text-zinc-500 dark:text-zinc-400'>{syncLabel(status)}</p>
          <div className='mt-3 flex gap-2'>
            <button
              onClick={() => syncNow()}
              disabled={status.state === 'syncing'}
              className='flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50'
            >
              <RefreshCw size={14} className={status.state === 'syncing' ? 'animate-spin' : ''} />
              Đồng bộ
            </button>
            <button
              onClick={() => logout()}
              className='flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 px-2 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
            >
              <LogOut size={14} />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
