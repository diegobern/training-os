import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/index.css'
import { App } from './App'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { installSessionGuards } from './store/useWorkout'
import { armBootMarkFallback } from './lib/bootmark'
import { readFlagOverridesFromUrl } from './lib/flags'
import { setOnboardingPusher } from './store/useOnboarding'
import { useAuth } from './store/useAuth'

installSessionGuards()
readFlagOverridesFromUrl()

// The questionnaire pushes each step to the account, but it must not import
// the auth store directly: that would pull Firebase into the onboarding chunk
// and undo the lazy loading. The dependency is injected here instead.
setOnboardingPusher((answers, step) => useAuth.getState().pushOnboardingDraft(answers, step))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)

armBootMarkFallback()
