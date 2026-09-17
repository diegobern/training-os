/**
 * Security-rule tests. These exercise `firestore.rules` and `storage.rules`
 * against the real rules engine in the emulator — the point is to prove that
 * isolation holds in the *rules*, not in the app's own checks.
 *
 *   npx firebase emulators:start --only firestore,storage --project demo-training-os
 *   node tests/firestore-rules.mjs
 *
 * Or in one step:  npm run test:rules
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { readFileSync } from 'node:fs'

const HOST = process.env.EMU_HOST ?? '127.0.0.1'
let pass = 0
let fail = 0
const out = []
const run = async (name, fn) => {
  try {
    await fn()
    pass++
    out.push('PASS  ' + name)
  } catch (err) {
    fail++
    out.push('FAIL  ' + name + ' — ' + (err?.message ?? String(err)))
  }
}

const env = await initializeTestEnvironment({
  projectId: 'demo-training-os',
  firestore: {
    host: HOST,
    port: 8080,
    rules: readFileSync('firestore.rules', 'utf8'),
  },
})

const alice = env.authenticatedContext('alice').firestore()
const bob = env.authenticatedContext('bob').firestore()
const stranger = env.unauthenticatedContext().firestore()

/* ------------------------------------------------------------- profiles */

await run('a user can create their own profile', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice'), { uid: 'alice', displayName: 'Alice' })),
)

await run('a user can read their own profile', () => assertSucceeds(getDoc(doc(alice, 'users/alice'))))

await run('a user cannot read another user profile', () => assertFails(getDoc(doc(bob, 'users/alice'))))

await run('a user cannot write another user profile', () =>
  assertFails(setDoc(doc(bob, 'users/alice'), { displayName: 'hacked' })),
)

await run('a profile cannot claim a different uid', () =>
  assertFails(setDoc(doc(alice, 'users/alice'), { uid: 'bob' })),
)

await run('a signed-out visitor cannot read a profile', () =>
  assertFails(getDoc(doc(stranger, 'users/alice'))),
)

/* --------------------------------------------------------- training data */

await run('a user can write their own workouts', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/sessions/s1'), { id: 's1', dayName: 'PUSH' })),
)

await run('a user cannot read another user workouts', () =>
  assertFails(getDoc(doc(bob, 'users/alice/sessions/s1'))),
)

await run('a user cannot list another user workouts', () =>
  assertFails(getDocs(collection(bob, 'users/alice/sessions'))),
)

await run('a user cannot write into another user subtree', () =>
  assertFails(setDoc(doc(bob, 'users/alice/sessions/s2'), { id: 's2' })),
)

await run('a signed-out visitor cannot read workouts', () =>
  assertFails(getDoc(doc(stranger, 'users/alice/sessions/s1'))),
)

await run('a user can read their own records back', () =>
  assertSucceeds(getDocs(collection(alice, 'users/alice/sessions'))),
)

await run('tombstones follow the same rule', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users/alice/tombstones/sessions_s1'), { store: 'sessions', docId: 's1' }))
  await assertFails(getDoc(doc(bob, 'users/alice/tombstones/sessions_s1')))
})

/* ------------------------------------------------------------- usernames */

await run('a signed-in user can claim a free username', () =>
  assertSucceeds(setDoc(doc(alice, 'usernames/alice'), { uid: 'alice', createdAt: Date.now() })),
)

await run('a signed-out visitor cannot claim a username', () =>
  assertFails(setDoc(doc(stranger, 'usernames/someone'), { uid: 'x', createdAt: Date.now() })),
)

await run('a username cannot be claimed for somebody else', () =>
  assertFails(setDoc(doc(bob, 'usernames/bob'), { uid: 'alice', createdAt: Date.now() })),
)

await run('a taken username cannot be overwritten', () =>
  assertFails(setDoc(doc(bob, 'usernames/alice'), { uid: 'bob', createdAt: Date.now() })),
)

await run('a username reservation cannot be deleted by somebody else', () =>
  assertFails(deleteDoc(doc(bob, 'usernames/alice'))),
)

await run('the owner can release their own username', () =>
  assertSucceeds(deleteDoc(doc(alice, 'usernames/alice'))),
)

await run('a signed-out visitor cannot look up a username', () =>
  assertFails(getDoc(doc(stranger, 'usernames/alice'))),
)

await run('nobody can enumerate the username index', () =>
  assertFails(getDocs(collection(alice, 'usernames'))),
)

/* ------------------------------------------------------- anything else */

await run('an unknown top-level collection is denied', () =>
  assertFails(setDoc(doc(alice, 'random/thing'), { a: 1 })),
)

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
await env.cleanup()
process.exit(fail > 0 ? 1 : 0)
