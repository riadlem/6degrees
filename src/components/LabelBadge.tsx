import { labelColors } from "@/lib/label-colors"
import { cn } from "@/lib/utils"

type Label = { id: string; name: string; color: string }

interface Props {
  label: Label
  onRemove?: () => void
  className?: string
}

export default function LabelBadge({ label, onRemove, className }: Props) {
  const c = labelColors(label.color)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
        c.bg, c.text, className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} />
      {label.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
        >
          ×
        </button>
      )}
    </span>
  )
}
