import { create } from 'zustand'

export type ToastTone = 'default' | 'success' | 'error' | 'pr'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  actionLabel?: string
  onAction?: () => void
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, tone?: ToastTone, opts?: { actionLabel?: string; onAction?: () => void; ttl?: number }) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push(message, tone = 'default', opts) {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, actionLabel: opts?.actionLabel, onAction: opts?.onAction }] }))
    const ttl = opts?.ttl ?? 3200
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

export const toast = (message: string, tone: ToastTone = 'default') => useToast.getState().push(message, tone)
