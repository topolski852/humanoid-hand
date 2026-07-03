import HandGlyph from './HandGlyph'

export default function AslSignCard({ sign, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={sign.description}
      className={`card text-left p-4 flex flex-col gap-3 transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'border-accent ring-1 ring-accent' : 'hover:border-accent/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl font-semibold text-white leading-none">{sign.letter}</span>
        {sign.approximate && (
          <span className="text-[9px] font-medium uppercase tracking-wider text-warn border border-warn/40 rounded px-1 py-0.5">
            approx
          </span>
        )}
      </div>
      <HandGlyph extended={sign.extended} />
      <p className="text-[10px] text-gray-500 leading-tight line-clamp-2 min-h-[24px]">
        {sign.description}
      </p>
    </button>
  )
}
