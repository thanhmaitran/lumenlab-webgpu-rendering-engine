import { useEffect, useState, type ReactNode } from "react";
import { displayNumber, parseNumber } from "../state/format";

export function Section(props: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header className="section__head">
        <h3>{props.title}</h3>
        {props.aside}
      </header>
      <div className="section__body">{props.children}</div>
    </section>
  );
}

export function Row(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="row" title={props.hint}>
      <span className="row__label">{props.label}</span>
      <span className="row__control">{props.children}</span>
    </label>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  digits?: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const { value, digits = 2 } = props;
  return (
    <Row label={props.label} hint={props.hint}>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={value}
        aria-label={props.label}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output className="mono">
        {value.toFixed(digits)}
        {props.unit ?? ""}
      </output>
    </Row>
  );
}

export function Toggle(props: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Row label={props.label} hint={props.hint}>
      <input
        type="checkbox"
        className="toggle"
        checked={props.checked}
        aria-label={props.label}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </Row>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? "is-active" : ""}
          title={o.title}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Numeric input that keeps its own text while typing and commits valid numbers immediately. */
export function NumberField(props: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(displayNumber(props.value)));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(displayNumber(props.value)));
  }, [props.value, focused]);
  return (
    <input
      className="number mono"
      type="number"
      inputMode="decimal"
      step={props.step ?? 0.1}
      min={props.min}
      max={props.max}
      value={text}
      aria-label={props.ariaLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n === null) return;
        const lo = props.min ?? -Infinity;
        const hi = props.max ?? Infinity;
        props.onChange(Math.min(hi, Math.max(lo, n)));
      }}
    />
  );
}

export function Vec3Field(props: {
  label: string;
  value: readonly [number, number, number];
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: [number, number, number]) => void;
}) {
  const axes = ["X", "Y", "Z"] as const;
  return (
    <div className="vec3">
      <span className="row__label">{props.label}</span>
      <div className="vec3__fields">
        {axes.map((axis, i) => (
          <NumberField
            key={axis}
            ariaLabel={`${props.label} ${axis}`}
            value={props.value[i]}
            step={props.step}
            min={props.min}
            max={props.max}
            onChange={(n) => {
              const next: [number, number, number] = [
                props.value[0],
                props.value[1],
                props.value[2],
              ];
              next[i] = n;
              props.onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Stat(props: { label: string; value: string; unit?: string; title?: string }) {
  return (
    <div className="stat" title={props.title}>
      <span className="stat__label">{props.label}</span>
      <span className="stat__value mono">
        {props.value}
        {props.unit && props.value !== "—" ? <small>{props.unit}</small> : null}
      </span>
    </div>
  );
}
