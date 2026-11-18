/**
 * Textos de usuario por mercado (17/11 — rama `italia`). Misma técnica que
 * P2 (`app/core/textos.py`):
 *
 *   t("Publicado hace {0} días", dias)
 *
 * El texto se escribe UNA vez, en el español de San Juan, que es la fuente y
 * la clave. En san_juan `t()` lo devuelve tal cual (el sitio de producción no
 * cambia una coma); en italia lo busca en `i18n/it.ts`. Los `{0}`, `{1}` se
 * reemplazan después, así el italiano puede reordenarlos.
 *
 * Los textos que llegan de P2/P3 (resumen, chips, motivos, narrativa) NO
 * pasan por acá: ya vienen en el idioma del mercado y se muestran tal cual.
 *
 * Una plantilla sin traducción sale en español y queda en `MISSING` (lo
 * vigilan `tests/i18n-it.spec.ts` y el control de idioma).
 */

import { IS_ITALIA } from "./market";
import { IT } from "./i18n/it";

export const MISSING = new Set<string>();

export function t(template: string, ...args: Array<string | number>): string {
  let text = template;
  if (IS_ITALIA) {
    const translated = IT[template];
    if (translated === undefined) MISSING.add(template);
    else text = translated;
  }
  if (args.length === 0) return text;
  return text.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m));
}
