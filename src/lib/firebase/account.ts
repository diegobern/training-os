import type { User } from 'firebase/auth'
import { getFirebase, getFirebaseAuth } from './app'
import { log } from '../db/database'
import {
  SCHEMA_VERSION,
  USERNAMES,
  USERS,
  normalizeUsername,
  usernameDoc,
  validateUsername,
} from './paths'
import { makeProfile, type UserProfile } from './profile'

export class AccountError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AccountError'
  }
}

async function services() {
  const promise = getFirebase()
  if (!promise) throw new AccountError('not-configured', 'Firebase is not configured')
  return promise
}

/**
 * Auth without Firestore.
 *
 * Signing in, signing out, resending a verification email — none of these
 * touch a document, and none of them should wait for the database SDK to
 * download. Anything that reads or writes a document still calls `services()`.
 */
async function authOnly() {
  const promise = getFirebaseAuth()
  if (!promise) throw new AccountError('not-configured', 'Firebase is not configured')
  return promise
}

/* --------------------------------------------------------------- username */

/**
 * Reserves a username atomically.
 *
 * `usernames/{normalized}` is the lock. The whole thing runs inside a
 * Firestore transaction, so two people submitting the same name at the same
 * moment cannot both win: the loser's transaction sees the document appear and
 * aborts. A plain "check then create" would let both through.
 */
export async function reserveUsername(uid: string, rawUsername: string): Promise<string> {
  const problem = validateUsername(rawUsername)
  if (problem) throw new AccountError(`username-${problem}`, `Invalid username: ${problem}`)

  const { db } = await services()
  const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore')
  const normalized = normalizeUsername(rawUsername)
  const ref = doc(db, usernameDoc(normalized))

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) {
      const owner = snap.data()?.uid as string | undefined
      if (owner !== uid) throw new AccountError('username-taken', 'That username is already taken')
      return // already ours, nothing to do
    }
    tx.set(ref, { uid, createdAt: serverTimestamp() })
  })

  log('account', `username reserved: @${normalized}`)
  return normalized
}

async function releaseUsername(uid: string, normalized: string): Promise<void> {
  const { db } = await services()
  const { doc, runTransaction } = await import('firebase/firestore')
  const ref = doc(db, usernameDoc(normalized))
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists() && snap.data()?.uid === uid) tx.delete(ref)
  })
}

/** Only meaningful while signed in — the reservation index is not public. */
export async function isUsernameAvailable(rawUsername: string, forUid?: string): Promise<boolean> {
  const { db } = await services()
  const { doc, getDoc } = await import('firebase/firestore')
  const normalized = normalizeUsername(rawUsername)
  const snap = await getDoc(doc(db, usernameDoc(normalized)))
  if (!snap.exists()) return true
  return forUid !== undefined && snap.data()?.uid === forUid
}

/* ---------------------------------------------------------------- profile */

export async function readProfile(uid: string): Promise<UserProfile | null> {
  const { db } = await services()
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, `${USERS}/${uid}`))
  if (!snap.exists()) return null
  return snap.data() as UserProfile
}

export async function writeProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
  const { db } = await services()
  const { doc, setDoc } = await import('firebase/firestore')
  await setDoc(doc(db, `${USERS}/${uid}`), { ...patch, uid, updatedAt: Date.now() }, { merge: true })
}

/* ------------------------------------------------------------------- auth */

export interface SignUpInput {
  displayName: string
  username: string
  email: string
  password: string
}

/**
 * Where the verification link lands.
 *
 * Firebase's own handler applies the code and then bounces the browser to this
 * URL, so the last thing the person sees is our confirmation page rather than
 * a bare Google-hosted string. If the project is later pointed at a custom
 * action URL in the console, the same page receives `mode` and `oobCode`
 * directly and applies the code itself — it handles both arrivals.
 */
function verifyLanding() {
  return {
    url: `${window.location.origin}/auth/verificado`,
    handleCodeInApp: false,
  }
}

/**
 * Sign-up order matters: create auth user → send the verification email →
 * reserve username → create profile.
 * If the username turns out to be taken, the account already exists and the
 * user stays signed in; the UI asks for another name and calls
 * `finishUsernameSetup`. Nothing is orphaned and nothing is rolled back behind
 * the user's back.
 */
export async function signUp(input: SignUpInput): Promise<{ user: User; usernameTaken: boolean }> {
  const { auth } = await authOnly()
  const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth')

  const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password)
  const user = cred.user

  await updateProfile(user, { displayName: input.displayName.trim() })

  /*
   * The verification email goes out FIRST, before any Firestore work.
   *
   * The auth listener puts the person on the verification gate the instant the
   * account exists, so from that moment the only thing they are waiting for is
   * the email. Reserving the username and writing the profile are Firestore
   * calls that retry for a long time when the backend is slow or unreachable,
   * and sending from behind them meant the gate could be on screen with no
   * email ever sent — which is exactly what the auth-gate test caught.
   *
   * Not fatal, either. The account already exists; throwing here would show
   * "sign-up failed" next to a real account, and the retry would then hit
   * `email-already-in-use`. The gate has a Resend button, which is the right
   * place to recover from a send that did not go through.
   */
  try {
    await sendEmailVerification(user, verifyLanding())
    log('account', 'verification email sent')
  } catch (err) {
    log('account', `verification email could not be sent: ${String(err)}`, 'warn')
  }

  let usernameTaken = false
  let normalized = normalizeUsername(input.username)
  try {
    await reserveUsername(user.uid, input.username)
  } catch (err) {
    if (err instanceof AccountError && err.code === 'username-taken') {
      usernameTaken = true
      normalized = ''
    } else {
      // The account itself exists now. A network problem reserving the name
      // must not look like "sign-up failed" and leave the person stuck with an
      // account they cannot see — the app picks this up and finishes later.
      log('account', `username reservation deferred: ${String(err)}`, 'warn')
      normalized = ''
    }
  }

  try {
    await writeProfile(user.uid, {
      ...makeProfile({
        uid: user.uid,
        username: normalized ? input.username.trim() : '',
        usernameNormalized: normalized,
        displayName: input.displayName.trim(),
        email: input.email.trim(),
      }),
      schemaVersion: SCHEMA_VERSION,
    })
  } catch (err) {
    log('account', `profile creation deferred: ${String(err)}`, 'warn')
  }

  log('account', `account created for ${input.email.trim()}`)
  return { user, usernameTaken }
}

/**
 * Finishes an account whose username could not be set during sign-up — either
 * because it was taken or because the network was down at that moment. It also
 * creates the profile document if it is still missing, so an interrupted
 * sign-up always ends in a complete account rather than a half-made one.
 */
export async function finishUsernameSetup(uid: string, rawUsername: string): Promise<void> {
  const normalized = await reserveUsername(uid, rawUsername)
  const existing = await readProfile(uid)
  if (!existing) {
    const { auth } = await authOnly()
    const user = auth.currentUser
    await writeProfile(uid, {
      ...makeProfile({
        uid,
        username: rawUsername.trim(),
        usernameNormalized: normalized,
        displayName: user?.displayName ?? '',
        email: user?.email ?? '',
      }),
      schemaVersion: SCHEMA_VERSION,
    })
    return
  }
  await writeProfile(uid, { username: rawUsername.trim(), usernameNormalized: normalized })
}

export async function changeUsername(uid: string, rawUsername: string): Promise<void> {
  const profile = await readProfile(uid)
  const previous = profile?.usernameNormalized ?? ''
  const normalized = await reserveUsername(uid, rawUsername)
  await writeProfile(uid, { username: rawUsername.trim(), usernameNormalized: normalized })
  if (previous && previous !== normalized) await releaseUsername(uid, previous)
}

export async function signIn(email: string, password: string): Promise<User> {
  const { auth } = await authOnly()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  log('account', 'signed in')
  return cred.user
}

export async function signOutUser(): Promise<void> {
  const { auth } = await authOnly()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
  log('account', 'signed out')
}

/**
 * Sends the verification email again, for the message that never arrived.
 *
 * Firebase rate-limits this server-side; the screen adds its own cooldown so
 * the person is told to wait rather than being handed an opaque
 * `auth/too-many-requests`.
 */
export async function resendVerification(): Promise<void> {
  const { auth } = await authOnly()
  const { sendEmailVerification } = await import('firebase/auth')
  if (!auth.currentUser) throw new AccountError('no-user', 'Not signed in')
  await sendEmailVerification(auth.currentUser, verifyLanding())
  log('account', 'verification email resent')
}

/**
 * Asks Firebase for the real state — never trust a locally cached flag.
 *
 * `user.emailVerified` is whatever was true when this tab's token was minted.
 * The link is usually opened somewhere else entirely — another tab, a phone —
 * and nothing tells this tab about it. `reload()` re-reads the account from
 * the server and `getIdToken(true)` forces a new token, so both the property
 * and the claim inside the token agree with reality afterwards.
 */
export async function refreshVerification(): Promise<boolean> {
  const { auth } = await authOnly()
  if (!auth.currentUser) return false
  await auth.currentUser.reload()
  await auth.currentUser.getIdToken(true)
  return auth.currentUser.emailVerified
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = await authOnly()
  const { sendPasswordResetEmail } = await import('firebase/auth')
  await sendPasswordResetEmail(auth, email.trim())
  log('account', 'password reset email requested')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { auth } = await authOnly()
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth')
  const user = auth.currentUser
  if (!user?.email) throw new AccountError('no-user', 'Not signed in')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
  log('account', 'password changed')
}

export async function deleteAccount(currentPassword: string): Promise<void> {
  const { auth, db } = await services()
  const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } = await import('firebase/auth')
  const { doc, deleteDoc } = await import('firebase/firestore')
  const user = auth.currentUser
  if (!user?.email) throw new AccountError('no-user', 'Not signed in')

  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))

  const profile = await readProfile(user.uid)
  if (profile?.usernameNormalized) {
    await deleteDoc(doc(db, `${USERNAMES}/${profile.usernameNormalized}`)).catch(() => undefined)
  }
  // The profile document goes; subcollections are removed by the client before
  // this call (see `wipeRemoteData`), because Firestore has no recursive delete
  // from a browser.
  await deleteDoc(doc(db, `${USERS}/${user.uid}`)).catch(() => undefined)
  await deleteUser(user)
  log('account', 'account deleted', 'warn')
}

export async function onAuth(cb: (user: User | null) => void): Promise<() => void> {
  const { auth } = await authOnly()
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(auth, cb)
}

export async function currentUser(): Promise<User | null> {
  const promise = getFirebaseAuth()
  if (!promise) return null
  const { auth } = await promise
  return auth.currentUser
}

/** Maps Firebase error codes to i18n keys so the UI never shows raw codes. */
export function authErrorKey(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  switch (code) {
    case 'auth/email-already-in-use':
      return 'auth.error.emailInUse'
    case 'auth/invalid-email':
      return 'auth.error.invalidEmail'
    case 'auth/weak-password':
      return 'auth.error.weakPassword'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'auth.error.badCredentials'
    case 'auth/too-many-requests':
      return 'auth.error.tooManyRequests'
    case 'auth/network-request-failed':
      return 'auth.error.network'
    case 'auth/requires-recent-login':
      return 'auth.error.requiresRecentLogin'
    case 'username-taken':
      return 'auth.error.usernameTaken'
    default:
      return 'auth.error.generic'
  }
}

/**
 * Applies a verification code that arrived in the URL, for the case where the
 * project uses a custom action handler and the link comes straight here.
 *
 * `auth/invalid-action-code` also covers a code that was already used, which
 * is what happens when someone opens the mail twice or their mail client
 * pre-fetches the link. The caller treats an already-verified session as
 * success rather than an error, because for the person it is one.
 */
export async function applyVerificationCode(oobCode: string): Promise<void> {
  const { auth } = await authOnly()
  const { applyActionCode } = await import('firebase/auth')
  await applyActionCode(auth, oobCode)
  if (auth.currentUser) await auth.currentUser.reload()
}
