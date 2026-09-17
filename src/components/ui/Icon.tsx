import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function S({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: P) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
  </S>
)

export const IconRoutines = (p: P) => (
  <S {...p}>
    <path d="M6.5 8v8M17.5 8v8" />
    <path d="M3.5 10v4M20.5 10v4" />
    <path d="M6.5 12h11" />
  </S>
)

export const IconBolt = (p: P) => (
  <S {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
  </S>
)

export const IconChart = (p: P) => (
  <S {...p}>
    <path d="M3 20h18" />
    <path d="M6 20V12M11 20V6M16 20v-5M21 20V9" />
  </S>
)

export const IconGrid = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </S>
)

export const IconClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </S>
)

export const IconCalendar = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </S>
)

export const IconBody = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="5" r="2.5" />
    <path d="M12 8v6M12 14l-3 7M12 14l3 7M6.5 10.5 12 9l5.5 1.5" />
  </S>
)

export const IconSettings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
  </S>
)

export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
)

export const IconMinus = (p: P) => (
  <S {...p}>
    <path d="M5 12h14" />
  </S>
)

export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="m4.5 12.5 5 5L19.5 6.5" />
  </S>
)

export const IconX = (p: P) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </S>
)

export const IconChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </S>
)

export const IconChevronRight = (p: P) => (
  <S {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </S>
)

export const IconChevronDown = (p: P) => (
  <S {...p}>
    <path d="m5 9.5 7 7 7-7" />
  </S>
)

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </S>
)

export const IconCopy = (p: P) => (
  <S {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
  </S>
)

export const IconPencil = (p: P) => (
  <S {...p}>
    <path d="M4 20.5 4.7 17a2 2 0 0 1 .53-1L15.6 5.6a2 2 0 0 1 2.83 0l.97.97a2 2 0 0 1 0 2.83L9.03 19.77a2 2 0 0 1-1 .53Z" />
  </S>
)

export const IconStar = (p: P) => (
  <S {...p}>
    <path d="m12 3.6 2.6 5.5 5.9.8-4.3 4.2 1 6-5.2-2.9-5.2 2.9 1-6L3.5 9.9l5.9-.8Z" />
  </S>
)

export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </S>
)

export const IconFilter = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </S>
)

export const IconDrag = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </S>
)

export const IconTrophy = (p: P) => (
  <S {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 10M17 5.5h2.5A2.5 2.5 0 0 1 17 10" />
    <path d="M12 14v3M9 20h6M10 17h4" />
  </S>
)

export const IconArrowUp = (p: P) => (
  <S {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </S>
)

export const IconArrowDown = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </S>
)

export const IconArrowRight = (p: P) => (
  <S {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </S>
)

export const IconPause = (p: P) => (
  <S {...p}>
    <path d="M9 5v14M15 5v14" />
  </S>
)

export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M7 4.8v14.4l12-7.2Z" />
  </S>
)

export const IconSkip = (p: P) => (
  <S {...p}>
    <path d="M6 5.5v13l9-6.5ZM18 5v14" />
  </S>
)

export const IconRefresh = (p: P) => (
  <S {...p}>
    <path d="M20 11a8 8 0 1 0-.6 4" />
    <path d="M20 4v7h-7" />
  </S>
)

export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </S>
)

export const IconUpload = (p: P) => (
  <S {...p}>
    <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
    <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </S>
)

export const IconFlame = (p: P) => (
  <S {...p}>
    <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.6.6-2.9 1.3-3.9.4 1 1.1 1.7 1.9 1.9C10 8 12 6 12 3Z" />
  </S>
)

export const IconTimer = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4M9.5 2h5M18.5 6.5 20 5" />
  </S>
)

export const IconInfo = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </S>
)

export const IconAlert = (p: P) => (
  <S {...p}>
    <path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </S>
)

export const IconCamera = (p: P) => (
  <S {...p}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </S>
)

export const IconRuler = (p: P) => (
  <S {...p}>
    <rect x="2.5" y="8" width="19" height="8" rx="2" />
    <path d="M6.5 8v3M10 8v4M13.5 8v3M17 8v4" />
  </S>
)

export const IconList = (p: P) => (
  <S {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </S>
)

export const IconDots = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
  </S>
)

export const IconTarget = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </S>
)

export const IconOffline = (p: P) => (
  <S {...p}>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3.4-2.2M19 13a10 10 0 0 0-6.6-2.9M2 9.5a15 15 0 0 1 5-3.2M22 9.5a15 15 0 0 0-9.5-3.4" />
    <path d="M12 20h.01" />
  </S>
)

export const IconMedal = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="15" r="5" />
    <path d="M8.5 10.3 6 3h12l-2.5 7.3M12 13.2l.7 1.5 1.6.2-1.2 1.2.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.2 1.6-.2Z" />
  </S>
)
