import type { ReactNode } from 'react'
import { Sheet, cx } from '../ui/primitives'
import {
  IconBody,
  IconChevronRight,
  IconDownload,
  IconInfo,
  IconList,
  IconSettings,
  IconTimer,
} from '../ui/Icon'
import { useT } from '../../store/useApp'

export interface MenuTarget {
  id: string
  labelKey: string
  icon: ReactNode
}

export const SETTINGS_SECTIONS: MenuTarget[] = [
  { id: 'account', labelKey: 'settings.sectionAccount', icon: <IconBody size={18} /> },
  { id: 'appearance', labelKey: 'settings.sectionAppearance', icon: <IconSettings size={18} /> },
  { id: 'training', labelKey: 'settings.sectionTraining', icon: <IconTimer size={18} /> },
  { id: 'units', labelKey: 'settings.sectionUnits', icon: <IconList size={18} /> },
  { id: 'feedback', labelKey: 'settings.sectionFeedback', icon: <IconTimer size={18} /> },
  { id: 'data', labelKey: 'settings.sectionData', icon: <IconDownload size={18} /> },
  { id: 'about', labelKey: 'settings.sectionAbout', icon: <IconInfo size={18} /> },
]

/**
 * The quick-jump menu. Settings used to show a small "MORE" label in this
 * position that looked tappable and did nothing — it was a section heading with
 * no section behind it. This is a real control in its place.
 */
export function SettingsMenu({
  open,
  onClose,
  onJump,
  extra,
}: {
  open: boolean
  onClose: () => void
  onJump: (id: string) => void
  extra?: { labelKey: string; icon: ReactNode; onSelect: () => void }[]
}) {
  const t = useT()
  const items = [
    ...SETTINGS_SECTIONS.map((s) => ({ key: s.id, labelKey: s.labelKey, icon: s.icon, onSelect: () => onJump(s.id) })),
    ...(extra ?? []).map((e, i) => ({ key: `extra-${i}`, ...e })),
  ]
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.quickMenu')}>
      <div className="flex flex-col">
        {items.map((item, i) => (
          <button
            key={item.key}
            onClick={() => {
              item.onSelect()
              onClose()
            }}
            className={cx(
              'press flex items-center gap-3 rounded-xl px-2 py-3.5 text-left hover:bg-elevated',
              i > 0 && 'border-t border-line',
            )}
          >
            <span className="shrink-0 text-muted">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate text-body text-ink">{t(item.labelKey)}</span>
            <IconChevronRight size={17} className="shrink-0 text-faint" />
          </button>
        ))}
      </div>
    </Sheet>
  )
}
