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
import { useWorkout } from './store/useWorkout'
import { setBeforeLocalReset } from './lib/sync/engine'
import { forceStopNative } from './lib/native/workoutNotification'
import { log } from './lib/db/database'

installSessionGuards()
readFlagOverridesFromUrl()

// Antes de vaciar la copia local (cambio de dueño, cerrar sesión, borrar la
// cuenta, «Borrar todo»), sincrónicamente y sin esperar: fuera el
// entrenamiento en memoria — y con él su autoguardado pendiente y su
// descanso — y fuera el aviso nativo. El motor no puede importar los
// almacenes ni el plugin; la conexión se hace aquí. Ver docs/NATIVE-CONTRACT.md.
setBeforeLocalReset(() => {
  void useWorkout
    .getState()
    .reset()
    .catch((err: unknown) => log('workout', `reset before local reset failed: ${String(err)}`, 'warn'))
  void forceStopNative()
})

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
