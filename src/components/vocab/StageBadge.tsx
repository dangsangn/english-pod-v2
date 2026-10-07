import classNames from 'classnames'
import type { StageStyle } from './stages'

/** The card's garden stage as a coloured pill; "Từ mới" for a card never studied. */
export default function StageBadge({ stage, isNew }: { stage: StageStyle; isNew: boolean }) {
  const { Icon } = stage
  return (
    <span
      className={classNames(
        'self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        stage.tile,
      )}
    >
      <Icon size={14} />
      {isNew ? 'Từ mới' : stage.label}
    </span>
  )
}
