import { IconCheck, IconX } from '../ui/Icon'
import { cx } from '../ui/primitives'
import { checkPassword } from '../../lib/firebase/paths'
import { useT } from '../../store/useApp'

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cx('flex items-center gap-1.5 text-caption', ok ? 'text-up' : 'text-faint')}>
      {ok ? <IconCheck size={13} strokeWidth={2.5} /> : <IconX size={13} />}
      {label}
    </li>
  )
}

export function PasswordRules({ password, confirm }: { password: string; confirm?: string }) {
  const t = useT()
  const c = checkPassword(password)
  const bars = [0, 1, 2, 3]
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {bars.map((i) => (
          <span
            key={i}
            className={cx(
              'h-1 flex-1 rounded-full transition-colors duration-200',
              i < c.score ? (c.score >= 3 ? 'bg-up' : c.score === 2 ? 'bg-warn' : 'bg-down') : 'bg-line',
            )}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <Rule ok={c.length} label={t('auth.pwLength')} />
        <Rule ok={c.letter} label={t('auth.pwLetter')} />
        <Rule ok={c.number} label={t('auth.pwNumber')} />
        <Rule ok={c.mixedCase} label={t('auth.pwMixed')} />
        {confirm !== undefined && confirm.length > 0 && (
          <Rule ok={password === confirm} label={password === confirm ? t('auth.pwMatch') : t('auth.pwNoMatch')} />
        )}
      </ul>
    </div>
  )
}
