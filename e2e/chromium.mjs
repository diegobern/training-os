/**
 * What the Playwright suites need from the machine they run on.
 *
 * They were written in a Linux environment with the browser and the scratch
 * folders at fixed paths, and those paths are still the first choice so that
 * nothing changes there. On any other machine (Windows, macOS, another CI)
 * those paths do not exist: a missing `executablePath` made a suite fail
 * before it started, and `/tmp/...` on Windows quietly became `C:\tmp\...`.
 */
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORIGINAL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'

/**
 * `CHROMIUM_EXE` if set → the original environment's browser if present →
 * `undefined`, which lets Playwright use the Chromium that
 * `npx playwright install chromium` downloads.
 */
export const CHROMIUM_EXE = process.env.CHROMIUM_EXE || (existsSync(ORIGINAL) ? ORIGINAL : undefined)

const POSIX = process.platform !== 'win32'

/** Browser profiles, deploy fixtures and other scratch files. */
export const E2E_TMP = process.env.E2E_TMP || (POSIX ? '/tmp' : join(tmpdir(), 'training-os-e2e'))

/** Screenshots the suites leave for a person to look at. */
export const SHOTS_DIR =
  process.env.SHOTS || (POSIX ? '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots' : join(E2E_TMP, 'shots'))
