import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/** Render modals on document.body so fixed positioning is not clipped by page scroll containers. */
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
