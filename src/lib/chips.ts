/**
 * Chips de oportunidad de la home (prompt-inicial §Pantalla 1).
 * Cada chip inyecta su intención en la consulta con una FRASE CANÓNICA que P2
 * entiende (el portal recibe solo texto; no existe param `vertical` en /search/text).
 * Máximo uno activo; combinable con lo que escribe el usuario — y lo que escribe
 * el usuario predomina siempre.
 *
 * Desde el 01/09 (decisión de German) los chips acompañan al selector de
 * vertical: con un vertical elegido se muestran solo los que le corresponden
 * (`verticals`); sin selección, los seis. Frases validadas contra P2 real.
 */

import type { VerticalId } from "./vertical";

export interface OpportunityChip {
  id: string;
  label: string;
  /** Frase canónica que se suma a la query del usuario. */
  phrase: string;
  /** Descripción corta (title/aria). */
  hint: string;
  /** Verticales del selector donde el chip aplica (sin selección van todos). */
  verticals: VerticalId[];
}

export const OPPORTUNITY_CHIPS: OpportunityChip[] = [
  {
    id: "temporarios",
    label: "Temporarios",
    phrase: "alquiler temporario",
    hint: "Alquiler temporario y habitaciones",
    verticals: ["alquilar"],
  },
  {
    id: "baratos",
    label: "Los más baratos",
    phrase: "las más baratas primero",
    hint: "Menor precio absoluto primero",
    verticals: ["alquilar", "comprar"],
  },
  {
    id: "gangas",
    label: "Gangas de la zona",
    phrase: "las que están más por debajo del precio de su zona",
    hint: "Bajo comparables de su zona",
    verticals: ["comprar", "invertir"],
  },
  {
    id: "renta",
    label: "Para renta",
    phrase: "para invertir y alquilar, ordenadas por renta",
    hint: "Comprar para alquilar",
    verticals: ["invertir"],
  },
  {
    id: "revalorizar",
    label: "Para revalorizar",
    phrase: "para invertir y revender, con mayor descuento sobre su zona",
    hint: "Comprar para vender después",
    verticals: ["invertir"],
  },
  {
    id: "bajo-precio-zona",
    label: "Bajo precio de zona",
    phrase: "las más baratas respecto de su zona",
    hint: "Percentil de precio bajo en su zona",
    verticals: ["comprar"],
  },
];

/** Los chips visibles según el vertical elegido; sin selección, todos. */
export function chipsForVertical(v: VerticalId | null): OpportunityChip[] {
  if (!v) return OPPORTUNITY_CHIPS;
  return OPPORTUNITY_CHIPS.filter((c) => c.verticals.includes(v));
}

/** La query efectiva: el texto del usuario predomina; el chip complementa. */
export function composeQuery(userText: string, chip: OpportunityChip | null): string {
  const text = userText.trim();
  if (!chip) return text;
  if (!text) return chip.phrase;
  return `${text}, ${chip.phrase}`;
}
