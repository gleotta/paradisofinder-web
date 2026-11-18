/**
 * Puente del plugin MCP de Italia (18/11 — pedido de German: "utilizá la URL
 * que ya te pasé"). La URL del plugin es la del sitio:
 *
 *     https://demoitalia.paradisofinder.com/mcp
 *
 * El servidor MCP vive en P2 (`/mcp`, Streamable HTTP sin estado y con
 * respuestas JSON); esta ruta reenvía el pedido tal cual y devuelve la
 * respuesta sin tocarla. Es una route handler y no un `rewrite` de
 * `next.config.ts` porque el destino sale de `P2_BASE_URL` en tiempo de
 * EJECUCIÓN (la imagen se construye una vez y sirve para cualquier entorno).
 *
 * Sin clave: el MCP de P2 es público por diseño (solo lectura del catálogo),
 * igual que en San Juan. No registra nada acá: P2 ya asienta cada búsqueda.
 * El límite de pedidos de P2 para las herramientas sin sesión es por IP, y
 * detrás del puente todos llegan con la del sitio: alcanza para la demo.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_HEADERS = ["accept", "content-type", "mcp-session-id", "mcp-protocol-version", "last-event-id", "user-agent"];
const RESPONSE_HEADERS = ["content-type", "mcp-session-id", "mcp-protocol-version", "allow", "www-authenticate"];

/** Clientes MCP que corren en un navegador (inspectores): el puente no restringe el origen. */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function rpcError(status: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

async function bridge(req: Request): Promise<Response> {
  const base = process.env.P2_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return rpcError(503, "MCP non disponibile: il servizio di ricerca non è configurato.");

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) headers.set("x-forwarded-for", forwarded);

  const init: RequestInit = { method: req.method, headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60_000) };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/mcp`, init);
  } catch {
    return rpcError(502, "MCP non raggiungibile: il servizio di ricerca non risponde.");
  }
  const out = new Headers({ "cache-control": "no-store", ...CORS });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { bridge as GET, bridge as POST, bridge as DELETE };

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
