import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconDrag } from './Icon'
import { cx } from './primitives'
import { haptic } from '../../lib/feedback'

/**
 * Drag to reorder. On touch the drag only starts after a short hold, so
 * scrolling the list and tapping a row both still work normally.
 */
export function SortableList({
  ids,
  onReorder,
  children,
}: {
  ids: string[]
  onReorder: (from: number, to: number) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    haptic('tick')
    onReorder(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export function SortableRow({
  id,
  children,
  className,
  handleLabel = 'Reorder',
}: {
  id: string
  children: ReactNode
  className?: string
  handleLabel?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('flex items-stretch gap-1', isDragging && 'relative z-10 opacity-90 shadow-lift', className)}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={handleLabel}
        className="press flex w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-faint active:cursor-grabbing"
      >
        <IconDrag size={18} />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
