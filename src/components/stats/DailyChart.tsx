"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface DailyPoint {
  /** Etiqueta corta del día ya formateada ("18 nov"). */
  label: string;
  /** Etiqueta larga para el tooltip ("mercoledì 18 novembre"). */
  title: string;
  value: number;
  /** Valor ya formateado ("1.284"). */
  display: string;
}

const H = 232; // incluye la banda del eje X
const PAD = { top: 16, right: 56, bottom: 30, left: 44 };

/** Tope "redondo" del eje Y y sus marcas (0 incluida). */
function yTicks(max: number): number[] {
  const rough = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(Math.max(1, max) / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/**
 * Serie diaria (una sola serie: sin leyenda, el título de la tarjeta la
 * nombra). Línea de 2 px con relleno al 10 %, grilla de líneas finas, valor
 * directo solo en el último punto y, al pasar el puntero o con las flechas
 * del teclado, una guía vertical que se pega al día más cercano con su
 * valor. Los mismos datos están en la tabla que la página pone debajo.
 */
export default function DailyChart({ points, unit }: { points: DailyPoint[]; unit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const ticks = yTicks(Math.max(...points.map((p) => p.value), 1));
    const top = ticks[ticks.length - 1];
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
    // Marcas del eje X: unas 6 como mucho, siempre la primera y la última.
    const every = Math.max(1, Math.ceil(points.length / (width < 480 ? 4 : 7)));
    // La última marca regular se omite si queda pegada a la del último día (las etiquetas se pisaban).
    const xt = points.map((_, i) => i).filter((i) => i % every === 0 && points.length - 1 - i >= every * 0.8);
    if (points.length > 1) xt.push(points.length - 1);
    return { ticks, x, y, line, area, xt, innerW };
  }, [points, width]);

  if (!points.length) return null;
  const last = points.length - 1;
  const nf = new Intl.NumberFormat("it-IT", { useGrouping: "always" });

  const pick = (clientX: number) => {
    const el = box.current;
    if (!el) return;
    const rel = clientX - el.getBoundingClientRect().left - PAD.left;
    const i = Math.round((rel / Math.max(1, geo.innerW)) * last);
    setActive(Math.max(0, Math.min(last, i)));
  };

  const a = active != null ? points[active] : null;
  const ax = active != null ? geo.x(active) : 0;
  const tipLeft = Math.max(4, Math.min(width - 164, ax + (ax > width - 190 ? -172 : 12)));

  return (
    <div
      ref={box}
      className="st-chart"
      tabIndex={0}
      role="group"
      aria-label={`${unit}: grafico per giorno. Usa le frecce per leggere i valori.`}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const step = e.key === "ArrowRight" ? 1 : -1;
          setActive((cur) => Math.max(0, Math.min(last, (cur ?? (step > 0 ? -1 : last + 1)) + step)));
        } else if (e.key === "Escape") setActive(null);
      }}
    >
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
        {geo.ticks.map((t) => (
          <g key={t}>
            <line className="st-gridline" x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} />
            <text className="st-tick" x={PAD.left - 8} y={geo.y(t) + 4} textAnchor="end">
              {nf.format(t)}
            </text>
          </g>
        ))}
        {geo.xt.map((i) => (
          <text className="st-tick" key={i} x={geo.x(i)} y={H - 8} textAnchor={i === last ? "end" : i === 0 ? "start" : "middle"}>
            {points[i].label}
          </text>
        ))}
        <path className="st-area" d={geo.area} />
        <path className="st-line" d={geo.line} />
        {a && <line className="st-cross" x1={ax} x2={ax} y1={PAD.top} y2={geo.y(0)} />}
        <circle className="st-dot" cx={geo.x(last)} cy={geo.y(points[last].value)} r={4} />
        {active !== last && (
          <text className="st-endlabel" x={geo.x(last) + 9} y={geo.y(points[last].value) + 4}>
            {points[last].display}
          </text>
        )}
        {a && active !== last && <circle className="st-dot" cx={ax} cy={geo.y(a.value)} r={4} />}
      </svg>
      {a && (
        <div className="st-tip" style={{ left: tipLeft }} role="status">
          <strong>{a.display}</strong>
          <span>{unit.toLowerCase()}</span>
          <em>{a.title}</em>
        </div>
      )}
    </div>
  );
}
