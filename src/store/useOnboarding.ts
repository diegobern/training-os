import { create } from 'zustand'
import { getMeta, setMeta, log } from '../lib/db/database'
import {
  ONBOARDING_VERSION,
  emptyTrainingProfile,
  mergeTrainingProfile,
  type TrainingProfile,
} from '../lib/training/profile'

/**
 * Onboarding progress, saved after every step.
 *
 * Two storage layers, deliberately:
 *
 *   · IndexedDB, under a `meta` key, written synchronously with each answer.
 *     This is what makes the questionnaire resumable. It needs no account, no
 *     network and no permission, so closing the app on step 4 — or losing
 *     signal, or the browser reclaiming the tab — costs nothing.
 *   · Firestore, pushed after each step but never awaited. A questionnaire
 *     that pauses on a slow connection between "Get stronger" and the next
 *     screen feels broken, and the answer is already safe locally by then.
 *
 * `onboardingCompleted` is written exactly once, when the last step is
 * actually reached. A draft is not a completed profile, and an interrupted
 * questionnaire must not look like a finished one.
 */

const DRAFT_KEY = 'onboarding:draft'

export const TOTAL_STEPS = 7

export interface OnboardingDraft {
  /** 1-based, so it matches the "3 / 7" the user is reading. */
  step: number
  answers: Partial<TrainingProfile>
  /** Which questionnaire this draft belongs to. A draft from an older one is discarded. */
  version: number
  updatedAt: number
}

interface OnboardingState {
  ready: boolean
  step: number
  answers: TrainingProfile
  /** True when the draft came off disk rather than starting fresh. */
  resumed: boolean
  /** Which step the draft resumed on, so the note is shown only there. */
  resumedAt: number
  saving: boolean
  /** Set when a step could not reach the server. Purely informational. */
  offline: boolean

  load: (initial?: Partial<TrainingProfile>) => Promise<void>
  set: (patch: Partial<TrainingProfile>) => void
  next: () => Promise<void>
  back: () => void
  goTo: (step: number) => void
  /** Clears the draft. Called after a successful finish, and on logout. */
  clear: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function persist(answers: TrainingProfile, step: number): Promise<void> {
  const draft: OnboardingDraft = { step, answers, version: ONBOARDING_VERSION, updatedAt: Date.now() }
  await setMeta(DRAFT_KEY, draft)
}

/** Pushes the draft to the account. Never awaited by the UI. */
let pushDraft: ((answers: Partial<TrainingProfile>, step: number) => Promise<void>) | null = null

export function setOnboardingPusher(fn: typeof pushDraft): void {
  pushDraft = fn
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  ready: false,
  step: 1,
  answers: emptyTrainingProfile(),
  resumed: false,
  resumedAt: 0,
  saving: false,
  offline: false,

  async load(initial) {
    const stored = await getMeta<OnboardingDraft | null>(DRAFT_KEY, null)

    // A draft written by an older questionnaire is not resumable: the steps it
    // refers to may no longer exist. Its answers are still merged in, so
    // nothing the person typed is thrown away — only their position is reset.
    const usable = stored && stored.version === ONBOARDING_VERSION

    const answers = mergeTrainingProfile(
      { ...initial, ...(stored?.answers ?? {}) },
      initial?.units ?? 'kg',
    )

    set({
      ready: true,
      step: usable ? Math.min(TOTAL_STEPS, Math.max(1, stored.step)) : 1,
      answers,
      resumed: Boolean(usable && stored.step > 1),
      resumedAt: usable ? stored.step : 0,
    })
  },

  set(patch) {
    const answers = { ...get().answers, ...patch }
    set({ answers })
    // Saved on every answer, not only when the step advances. Advancing was
    // the obvious place and it is not enough: someone who picks "3 days" and
    // then closes the app has answered, and finding that answer gone when
    // they come back is the app losing their work.
    //
    // Debounced because typing a height fires this on every keystroke, and a
    // write per character is pointless churn on a phone.
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persist(answers, get().step)
    }, 400)
  },

  async next() {
    const { step, answers } = get()
    const nextStep = Math.min(TOTAL_STEPS, step + 1)
    set({ step: nextStep, saving: true })

    // A debounced write from the last answer may still be pending; it would
    // land after this one with a stale step number.
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    try {
      // Local first, and awaited: this is the write that makes the
      // questionnaire resumable, and it is fast.
      await persist(answers, nextStep)
    } catch (err) {
      log('onboarding', `draft could not be saved locally: ${String(err)}`, 'warn')
    } finally {
      set({ saving: false })
    }

    // Remote second, and NOT awaited. A slow connection must not sit between
    // two questions.
    void pushDraft?.(answers, nextStep)
      .then(() => set({ offline: false }))
      .catch(() => set({ offline: true }))
  },

  back() {
    const step = Math.max(1, get().step - 1)
    set({ step })
    void persist(get().answers, step)
  },

  goTo(step) {
    set({ step: Math.min(TOTAL_STEPS, Math.max(1, step)) })
  },

  async clear() {
    try {
      await setMeta(DRAFT_KEY, null)
    } catch {
      /* best effort — a stale draft is discarded on load by its version anyway */
    }
    set({ step: 1, answers: emptyTrainingProfile(), resumed: false, resumedAt: 0, offline: false })
  },
}))

/* --------------------------------------------------------------- steps */

/**
 * Which step is which, and whether it can be skipped.
 *
 * A step is skippable only when every question on it is optional. Steps 1 to 5
 * each carry at least one answer that something in the app depends on — units,
 * goal, experience, availability, environment — and skipping them would leave
 * the personalization engine guessing. Steps 6 and 7 carry none.
 */
export const STEPS: { id: number; key: string; skippable: boolean }[] = [
  { id: 1, key: 'ob.s1', skippable: false },
  { id: 2, key: 'ob.s2', skippable: false },
  { id: 3, key: 'ob.s3', skippable: false },
  { id: 4, key: 'ob.s4', skippable: false },
  { id: 5, key: 'ob.s5', skippable: false },
  { id: 6, key: 'ob.s6', skippable: true },
  { id: 7, key: 'ob.s7', skippable: false },
]
