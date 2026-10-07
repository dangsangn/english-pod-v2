import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

// Space a short card needs under its target for 'below' to fit there.
const ROOM_BELOW = 160

interface FloatingCardProps {
  /** Viewport rectangle of what the card is about. */
  rect: DOMRect
  width: number
  /** Accessible name of the dialog. */
  label: string
  onClose: () => void
  /** Presses on this element don't close the card: it is the control that toggles it. */
  anchor?: RefObject<Element | null>
  /**
   * 'auto': below `rect` unless it sits in the lower part of the screen.
   * 'below': below whenever there is room, so `rect` itself stays readable.
   */
  placement?: 'auto' | 'below'
  children: ReactNode
}

/**
 * A small card floating next to something on screen — below it, or above when
 * it sits in the lower part of the screen. It overlays the page rather than
 * taking room in it, so opening it moves nothing.
 *
 * Closes on Escape, on a press outside, and when the page scrolls or resizes
 * (it is positioned for where the thing was).
 */
export default function FloatingCard({
  rect,
  width,
  label,
  onClose,
  anchor,
  placement = 'auto',
  children,
}: FloatingCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Capture phase + stopPropagation: Escape closes this card only, not the
    // study session listening for Escape on the window behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    // Capture phase, so it still fires when the press lands somewhere that
    // stops propagation (a flashcard, an example sentence). The press is used up by
    // closing: stopping it here keeps a flashcard underneath from also
    // flipping. Clicks still go through, so pressing another word closes this
    // card and that word's click opens its own.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || anchor?.current?.contains(target)) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose, anchor])

  const left = Math.min(
    Math.max(12, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 12,
  )
  const below =
    placement === 'below'
      ? rect.bottom + ROOM_BELOW < window.innerHeight
      : rect.bottom < window.innerHeight * 0.6
  const position = below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }

  // Portalled to <body>: the transcript card uses backdrop-filter, which makes
  // it the containing block for `position: fixed` children — rendered inside
  // it, the card would be placed relative to the card instead of the screen.
  // z-[70] keeps it above the vocabulary overlay (z-[60]) too.
  return createPortal(
    <div
      ref={ref}
      role='dialog'
      aria-label={label}
      style={{ left, width, ...position }}
      className='fixed z-[70] rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl shadow-zinc-900/15 dark:shadow-black/50 vocab-pop-in'
    >
      {children}
    </div>,
    document.body,
  )
}
