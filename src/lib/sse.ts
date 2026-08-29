/**
 * Parser SSE mínimo para el canal POST /api/chat (EventSource no soporta POST).
 * Respeta el framing estándar: bloques separados por línea en blanco, con
 * `event:` y una o más líneas `data:`.
 *
 * OJO con los saltos de línea: P2 real emite CRLF (`\r\n`), así que el
 * separador de bloques es `\r\n\r\n` — que NO contiene `\n\n`. Buscar solo
 * `\n\n` deja el stream mudo (verificado contra P2 el 29/08). Por eso se
 * normaliza el buffer completo en cada chunk: eso además repara los CRLF que
 * quedan partidos entre dos chunks.
 */

export interface SSEMessage {
  event: string;
  data: string;
}

export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onMessage: (msg: SSEMessage) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) onMessage({ event, data: data.join("\n") });
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (block.trim()) emit(block);
      }
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    if (buffer.trim()) emit(buffer);
  } finally {
    reader.releaseLock();
  }
}
