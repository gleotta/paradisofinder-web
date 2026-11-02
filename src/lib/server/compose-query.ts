import "server-only";

import { searchSync, searchText } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { VERTICAL_OVERRIDE, VERTICAL_PHRASE, type VerticalId } from "@/lib/vertical";

/** Lo que va a P2 en el turno: la query (compuesta o cruda) O el override de inversión. */
export type TurnPlan = Pick<StreamRequest, "query" | "vertical_override">;

/**
 * "Lo que escribe el usuario predomina" (regla de producto 2): antes de
 * componer se sondea la extracción determinística del texto crudo (mismo
 * extractor `fast` del turno, ~2 ms de extracción). Si el texto ya fija
 * alquiler, temporario o lotes, va crudo y el botón se re-sincroniza en el
 * cliente. Con `sale` no se distingue "lo dijo" de "lo asumió" (verificado:
 * el meta no lo trae), pero anexar es igual seguro: el extractor prioriza
 * compra sobre alquiler sin importar la posición, así que un texto con
 * comprar/venta nunca pierde contra la frase anexada. Ante cualquier fallo de
 * la sonda, crudo. Lo usan el canal SSE y el fallback sync (14/09).
 *
 * Invertir (German, 02/11: Invertir ES la vertical de inversión de P2): no hay
 * frase que llegue a `investment` y con `query` en sesión NUEVA el override pisa
 * el texto (sondeado 01/09 y 02/11: 2.426 avisos sin filtros). Entonces el
 * server SIEMBRA el criterio del texto con `POST /search` sync (sin narrativa,
 * ~190 ms, mismo extractor) y devuelve el override para que el turno real sea
 * `{session_id, vertical_override: "investment"}`: cards a ~10 ms + narrativa,
 * con zona/tipo/presupuesto intactos (verificado 02/11). Si la sonda pide
 * aclaración (otra ciudad) o la siembra devuelve una aclaración terminal, va el
 * texto crudo y la aclaración viaja por el stream como siempre.
 */
export async function prepareTurn(sessionId: string, query: string, vertical: VerticalId): Promise<TurnPlan> {
  let extracted: string | undefined;
  let needsClarification = false;
  try {
    const probe = await searchText(query, 1);
    extracted = probe.extraction?.params?.vertical;
    needsClarification = probe.clarification_needed === true;
  } catch {
    return { query };
  }
  if (extracted && extracted !== "sale") return { query };
  if (vertical !== "invertir") return { query: `${query}, ${VERTICAL_PHRASE[vertical]}` };
  if (needsClarification) return { query };
  try {
    const seed = await searchSync({ session_id: sessionId, query, limit: 20, offset: 0 });
    if (seed.nivel1_required || (seed.clarification && seed.clarification.reason !== "few_results")) return { query };
  } catch {
    return { query };
  }
  return { vertical_override: VERTICAL_OVERRIDE.invertir };
}
