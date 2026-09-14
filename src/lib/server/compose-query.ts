import "server-only";

import { searchText } from "@/lib/p2/client";
import { VERTICAL_PHRASE, type VerticalId } from "@/lib/vertical";

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
 */
export async function composeQuery(query: string, vertical: VerticalId): Promise<string> {
  try {
    const probe = await searchText(query, 1);
    const extracted = probe.extraction?.params?.vertical;
    if (extracted && extracted !== "sale") return query;
  } catch {
    return query;
  }
  return `${query}, ${VERTICAL_PHRASE[vertical]}`;
}
