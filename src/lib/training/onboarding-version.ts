/**
 * The questionnaire's version, alone in its own module.
 *
 * It lives here rather than in `profile.ts` because the auth gate and the auth
 * store both need it to decide whether to offer onboarding — and importing it
 * from `profile.ts` dragged that whole file, with its goal tables, experience
 * tables and equipment maps, into the entry chunk. A constant should not cost
 * 20KB on the critical path.
 *
 * Bumped when the questionnaire changes shape, which is what drives the
 * top-up onboarding for accounts that answered an older one.
 */
export const ONBOARDING_VERSION = 1
