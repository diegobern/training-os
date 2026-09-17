import { Component, type ErrorInfo, type ReactNode } from 'react'
import { dismissBootMark } from '../../lib/bootmark'

/**
 * The last line of defence.
 *
 * Without it, an exception thrown during render unmounts the whole tree and
 * leaves an empty document — or, worse, leaves the boot splash on screen
 * looking exactly like loading. A crash the user can see and retry is always
 * better than one that impersonates a slow connection.
 *
 * It is intentionally not translated. The i18n layer is one of the things that
 * could have thrown, and a fallback that depends on the thing that failed is
 * not a fallback. The text is short and duplicated in both languages instead.
 */
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The splash must come down: a crash hidden behind a logo is the exact
    // failure mode this whole screen exists to end.
    dismissBootMark()
    // eslint-disable-next-line no-console
    console.error('[training-os] render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error.message || String(this.state.error)

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-7 text-center">
        <div className="w-full max-w-sm">
          <h1 className="text-page text-ink">Algo ha salido mal</h1>
          <p className="mt-1 text-page-sub text-muted">Something went wrong</p>
          <p className="mt-md text-secondary text-muted">
            Tus datos están a salvo. · Your data is safe.
          </p>

          <div className="mt-xl space-y-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="press w-full rounded-2xl bg-brand px-5 py-4 text-card font-bold text-brand-ink"
            >
              Reintentar · Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="press w-full rounded-2xl border border-line px-5 py-3.5 text-card text-muted"
            >
              Recargar · Reload
            </button>
          </div>

          <p className="mt-lg select-all break-words text-caption text-faint">{message.slice(0, 200)}</p>
        </div>
      </div>
    )
  }
}
