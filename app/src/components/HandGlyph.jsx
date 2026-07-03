// A tiny 5-finger glyph: filled bars for extended fingers, stubs for curled.
// `extended` is [thumb, index, middle, ring, pinky] booleans.
const LABELS = ['T', 'I', 'M', 'R', 'P']

export default function HandGlyph({ extended = [], className = '' }) {
  return (
    <div className={`flex items-end gap-1 ${className}`}>
      {LABELS.map((label, i) => {
        const up = extended[i]
        return (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-1.5 rounded-full transition-all ${up ? 'bg-accent' : 'bg-surface-3'}`}
              style={{ height: up ? 18 : 7 }}
            />
            <span className="text-[8px] text-gray-600 leading-none">{label}</span>
          </div>
        )
      })}
    </div>
  )
}
