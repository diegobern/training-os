import { useEffect, useState } from 'react'
import { StepShell } from '../../components/onboarding/StepShell'
import { Step1, Step2, Step3, Step4, Step5, Step6 } from './onboarding/steps'
import { Summary } from './onboarding/Summary'
import { useApp, useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { useOnboarding, STEPS, TOTAL_STEPS } from '../../store/useOnboarding'
import { ONBOARDING_VERSION } from '../../lib/training/profile'
import { settingsPatchFor } from '../../lib/training/personalize'
import { addBodyweight } from '../../lib/db/repo.body'
import { log } from '../../lib/db/database'

/**
 * The seven-step questionnaire.
 *
 * Three properties that are easy to lose and expensive to get wrong:
 *
 *   · It resumes. Every answer is written to IndexedDB before the next screen
 *     appears, so closing the app on step 4 costs nothing.
 *   · It never blocks on the network. The remote copy of the draft is pushed
 *     after each step and never awaited; only the final apply waits, and even
 *     that continues if the server is unreachable.
 *   · `onboardingCompleted` is written once, at the end. An interrupted
 *     questionnaire must not look like a finished one.
 */
export default function Onboarding() {
  const t = useT()
  const profile = useAuth((s) => s.profile)
  const complete = useAuth((s) => s.completeOnboarding)
  const setPhase = useAuth((s) => s.setPhase)
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.update)

  const { ready, step, answers, resumed, resumedAt, offline, load, set, next, back, clear } = useOnboarding()
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    // Seeded with what the account already knows, so an existing user doing
    // the top-up questionnaire does not re-answer what they already told us.
    void load({
      units: settings.units,
      mainGoal: (profile?.goal as never) ?? undefined,
      daysPerWeek: profile?.trainingDaysPerWeek ?? undefined,
    })
    // Deliberately once, on mount. Re-running it when settings change would
    // overwrite an answer the user is in the middle of giving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) return <div className="min-h-dvh bg-bg" />

  const meta = STEPS[step - 1]

  async function finish() {
    setApplying(true)
    const finished = { ...answers, onboardingVersion: ONBOARDING_VERSION, completedAt: Date.now() }

    // Local first, and awaited. This single write is what actually completes
    // the onboarding: it holds the answers, the version, and the personalized
    // settings, and it works with no network and no account. Everything after
    // it is a mirror.
    try {
      await updateSettings({
        ...settingsPatchFor(finished),
        trainingProfile: finished as unknown as Record<string, unknown>,
        onboardingVersion: ONBOARDING_VERSION,
      })
    } catch (err) {
      log('onboarding', `settings could not be applied: ${String(err)}`, 'warn')
    }

    if (finished.bodyweightKg) {
      try {
        // The weight they just typed becomes the first point of their chart,
        // rather than a number stored and never shown.
        await addBodyweight(finished.bodyweightKg)
      } catch (err) {
        log('onboarding', `first bodyweight entry failed: ${String(err)}`, 'warn')
      }
    }

    try {
      await clear()
    } catch {
      /* the draft is version-gated on load, so a stale one is harmless */
    }

    // The account copy. Best effort: the questionnaire is already complete
    // locally, so a server that cannot be reached must not trap someone on
    // step 7 of a form they have finished. `pushSettings` will carry it up
    // with the next successful sync.
    try {
      await complete({
        goal: finished.mainGoal as never,
        trainingDaysPerWeek: finished.daysPerWeek,
        trainingProfile: finished,
        onboardingVersion: ONBOARDING_VERSION,
      })
    } catch (err) {
      log('onboarding', `profile could not be written remotely: ${String(err)}`, 'warn')
      // Local state says onboarding is done, so let the app open.
      setPhase('ready')
    }
  }

  const body = (() => {
    switch (step) {
      case 1:
        return <Step1 answers={answers} set={set} />
      case 2:
        return <Step2 answers={answers} set={set} />
      case 3:
        return <Step3 answers={answers} set={set} />
      case 4:
        return <Step4 answers={answers} set={set} />
      case 5:
        return <Step5 answers={answers} set={set} />
      case 6:
        return <Step6 answers={answers} set={set} />
      default:
        return <Summary answers={answers} />
    }
  })()

  // The resume note belongs to the screen you came back to, not to every
  // screen after it — left up, it reads as a permanent banner rather than an
  // answer to "where was I?".
  const notes = [
    resumed && step === resumedAt ? t('ob.resume') : null,
    offline ? t('ob.offlineNote') : null,
  ].filter(Boolean)

  return (
    <StepShell
      step={step}
      title={t(`${meta.key}.title`)}
      subtitle={t(`${meta.key}.sub`)}
      onBack={step > 1 ? back : undefined}
      onSkip={meta.skippable ? () => void next() : undefined}
      onNext={step === TOTAL_STEPS ? () => void finish() : () => void next()}
      nextLabel={step === TOTAL_STEPS ? t('ob.finish') : undefined}
      busy={applying}
      note={applying ? t('ob.s7.applying') : (notes[0] ?? undefined)}
    >
      {body}
    </StepShell>
  )
}
