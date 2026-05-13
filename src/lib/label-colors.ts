export const LABEL_COLORS: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  blue:   { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500",   ring: "ring-blue-300" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500", ring: "ring-purple-300" },
  green:  { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500",  ring: "ring-green-300" },
  amber:  { bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-500",  ring: "ring-amber-300" },
  red:    { bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500",    ring: "ring-red-300" },
  pink:   { bg: "bg-pink-100",   text: "text-pink-700",   dot: "bg-pink-500",   ring: "ring-pink-300" },
  indigo: { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500", ring: "ring-indigo-300" },
  teal:   { bg: "bg-teal-100",   text: "text-teal-700",   dot: "bg-teal-500",   ring: "ring-teal-300" },
}

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS)

export function labelColors(color: string) {
  return LABEL_COLORS[color] ?? LABEL_COLORS.blue
}
