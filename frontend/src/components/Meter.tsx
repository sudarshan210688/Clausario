interface Props {
  label: string;
  /** 0–`max`. */
  value: number;
  max?: number;
  digits?: number;
}

/** Horizontal bar with a label and the numeric value; colour by share of `max`. */
export function Meter({ label, value, max = 1, digits = 2 }: Props) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const tone = share >= 0.65 ? 'high' : share >= 0.35 ? 'mid' : 'low';
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <strong>{value.toFixed(digits)}</strong>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className={`meter-fill tone-${tone}`} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
