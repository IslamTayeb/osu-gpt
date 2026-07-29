"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

type NumberFieldProps = {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  /** Rendered on the label row, right-aligned — e.g. a pinned field's "auto" reset. */
  trailing?: ReactNode;
};

/** One numeric control, used by every difficulty and advanced field. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  hint,
  trailing,
}: NumberFieldProps) {
  return (
    <label className="field">
      <span className="field__label field__label--row">
        {label}
        {trailing}
      </span>
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        min={min}
        max={max}
        step={step ?? 0.1}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
      />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}
