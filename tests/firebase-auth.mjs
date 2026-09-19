/**
 * Real Firebase Authentication test against the local Auth emulator.
 * Nothing here is mocked: these are the same SDK calls the app makes.
 *
 *   npx firebase emulators:start --only auth --project demo-training-os
 *   node tests/firebase-auth.mjs
 */
import { initializeApp, deleteApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  onAuthStateChanged,
  connectAuthEmulator,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth'

const HOST = process.env.EMU_HOST ?? '127.0.0.1'
const PROJECT = 'demo-training-os'
let pass = 0
let fail = 0
const out = []
const ok = (m) => {
  pass++
  out.push('PASS  ' + m)
}
const no = (m, e) => {
  fail++
  out.push('FAIL  ' + m + (e ? ` — ${e}` : ''))
}

const app = initializeApp({
  apiKey: 'fake-api-key-for-emulator',
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  appId: '1:000000000000:web:0000000000000000000000',
})
const auth = initializeAuth(app, { persistence: inMemoryPersistence })
connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true })

const stamp = Date.now()
const email = `diego.${stamp}@example.com`
const password = 'TrainingOs2026'
const newPassword = 'TrainingOs2026x'

try {
  /* ------------------------------------------------------------ sign up */
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  cred.user.uid ? ok('sign up creates a Firebase Auth user') : no('sign up creates a Firebase Auth user')
  out.push(`INFO  uid: ${cred.user.uid}`)

  await updateProfile(cred.user, { displayName: 'Diego' })
  await cred.user.reload()
  auth.currentUser.displayName === 'Diego'
    ? ok('display name is stored on the auth user')
    : no('display name is stored on the auth user')

  // Training OS does not verify email addresses: the account works the moment
  // it exists. What must stay true is that nothing sends one behind the
  // scenes — asserted below against the emulator's own list of issued codes.

  /* ----------------------------------------------- duplicate email guard */
  try {
    await createUserWithEmailAndPassword(auth, email, 'AnotherPass1')
    no('a second account with the same email is rejected')
  } catch (err) {
    err.code === 'auth/email-already-in-use'
      ? ok('a second account with the same email is rejected')
      : no('a second account with the same email is rejected', err.code)
  }

  /* -------------------------------------------------- sign out / sign in */
  await signOut(auth)
  auth.currentUser === null ? ok('sign out clears the current user') : no('sign out clears the current user')

  try {
    await signInWithEmailAndPassword(auth, email, 'WrongPassword1')
    no('a wrong password is rejected')
  } catch (err) {
    ['auth/invalid-credential', 'auth/wrong-password'].includes(err.code)
      ? ok('a wrong password is rejected')
      : no('a wrong password is rejected', err.code)
  }

  const again = await signInWithEmailAndPassword(auth, email, password)
  again.user.uid === cred.user.uid ? ok('sign in returns the same uid') : no('sign in returns the same uid')

  /* ------------------------------------------------------ session token */
  const token = await auth.currentUser.getIdToken()
  typeof token === 'string' && token.length > 20
    ? ok('a session token is issued')
    : no('a session token is issued')

  /* ------------------------------------------------- auth state listener */
  const seen = await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub()
      resolve(u)
    })
  })
  seen?.uid === cred.user.uid
    ? ok('onAuthStateChanged reports the signed-in user')
    : no('onAuthStateChanged reports the signed-in user')

  /* -------------------------------------------------------- reset email */
  await sendPasswordResetEmail(auth, email)
  ok('password reset email requested without error')

  const res = await fetch(`http://${HOST}:9099/emulator/v1/projects/${PROJECT}/oobCodes`)
  const { oobCodes = [] } = await res.json()
  const kinds = oobCodes.map((c) => c.requestType)
  kinds.includes('PASSWORD_RESET')
    ? ok('the reset email actually reached the auth service')
    : no('the reset email actually reached the auth service')
  kinds.includes('VERIFY_EMAIL')
    ? no('no verification email is ever issued', 'the auth service issued a VERIFY_EMAIL code')
    : ok('no verification email is ever issued')

  /* ------------------------------------------------------ password change */
  await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password))
  await updatePassword(auth.currentUser, newPassword)
  await signOut(auth)
  await signInWithEmailAndPassword(auth, email, newPassword)
  ok('password change takes effect on the next sign in')

  try {
    await signOut(auth)
    await signInWithEmailAndPassword(auth, email, password)
    no('the old password stops working')
  } catch {
    ok('the old password stops working')
  }

  /* ---------------------------------------------------------- deletion */
  await signInWithEmailAndPassword(auth, email, newPassword)
  await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, newPassword))
  await deleteUser(auth.currentUser)
  try {
    await signInWithEmailAndPassword(auth, email, newPassword)
    no('a deleted account can no longer sign in')
  } catch {
    ok('a deleted account can no longer sign in')
  }
} catch (err) {
  no('unexpected failure', err?.message ?? String(err))
}

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
await deleteApp(app)
process.exit(fail > 0 ? 1 : 0)
