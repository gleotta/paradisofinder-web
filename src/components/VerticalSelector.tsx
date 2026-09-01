"use client";

import { VERTICALS, type VerticalId } from "@/lib/vertical";

/**
 * Segmentado Alquilar · Comprar · Invertir (opción A de la propuesta del
 * 01/09). Click en el activo lo apaga: "sin selección" es un estado válido
 * (P2 infiere del texto, como antes del selector). El estado vive en el
 * padre; acá solo se dibuja y se togglea.
 */
export default function VerticalSelector({
  value,
  onChange,
  disabled,
  className,
}: {
  value: VerticalId | null;
  onChange: (v: VerticalId | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`vseg${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Qué querés hacer"
    >
      {VERTICALS.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={value === v.id}
          disabled={disabled}
          onClick={() => onChange(value === v.id ? null : v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
