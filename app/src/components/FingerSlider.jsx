export default function FingerSlider({ label, value, min, max, inverted, onChange, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-gray-400 flex-shrink-0">
        {label}
        {inverted && <span className="text-gray-600" title="servo is mechanically inverted"> ⇄</span>}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-10 text-right data-value text-xs">{value}°</span>
    </div>
  )
}
