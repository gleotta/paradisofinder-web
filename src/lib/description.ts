/**
 * Formato de la descripción del aviso para la ficha (18/11).
 *
 * El texto llega como UN bloque: el pipeline junta los párrafos del aviso en
 * una sola línea (promedio 1.800 caracteres, hasta 6.000). Acá NO se cambia
 * una palabra: solo se le devuelve la forma —un titular, párrafos cortos y
 * listas— para que se pueda leer.
 *
 *  1. Saltos perdidos: una palabra que solo va con mayúscula al empezar una
 *     oración ("In una zona…", "L'immobile…", "Nel cuore…") y que aparece
 *     SIN puntuación antes marca un salto de línea del aviso original. Así
 *     se separa el titular ("AMPIO Appartamento … POSTO AUTO" | "In una
 *     zona tranquilla…").
 *  2. Listas: viñetas explícitas (• ● ▪ ✔ …) o tres o más guiones " - " con
 *     ítems cortos.
 *  3. Párrafos: las oraciones se agrupan hasta unos 320 caracteres; algunas
 *     aperturas ("L'immobile", "Completano", "La zona") abren párrafo.
 *  4. Titular: el primer tramo, si es corto y no cierra con punto.
 */

export type DescriptionBlock = { type: "p"; text: string } | { type: "list"; items: string[] };

export interface FormattedDescription {
  /** Titular del aviso (su primera línea), o null. */
  lead: string | null;
  blocks: DescriptionBlock[];
}

/** Palabras que en prosa solo llevan mayúscula al empezar una oración. */
const STARTERS = new Set([
  "Il", "Lo", "La", "Gli", "Le", "Un", "Una", "Uno", "In", "Nel", "Nella", "Nello", "Nei", "Negli", "Nelle",
  "Al", "Alla", "Allo", "Ai", "Dal", "Dalla", "Per", "Con", "Sul", "Sulla", "Si", "Ogni", "Questo", "Questa",
  "Inoltre", "Infine", "Completa", "Completano", "Proponiamo", "Situato", "Situata", "Internamente",
  "Esternamente", "Grazie", "Tutto", "Tutti", "Ottima", "Ottimo", "Ideale", "Disponibile", "Possibilità",
  "Trattasi", "Composto", "Composta", "Ubicato", "Ubicata", "Vendesi", "Affittasi", "Presso", "Siamo",
]);

/** Aperturas que empiezan un párrafo nuevo aunque el anterior sea corto. */
const PARAGRAPH_OPENERS =
  /^(?:L['’](?:immobile|appartamento|abitazione|unità|ingresso|edificio)|La (?:proprietà|casa|villa|zona|soluzione|posizione)|Il (?:contesto|quartiere|palazzo|condominio|prezzo)|Completan?o?\b|Internamente|Esternamente|Classe energetica|Per (?:informazioni|maggiori|ulteriori)|Inoltre|Infine)/;

const SENTENCE_END = /[.!?…]["»)]?$/;
const BREAK_BEFORE = /[.!?…:;,|–—\-]["»)]?$/;
const BULLETS = /\s*[•●▪■◆✓✔►➤]\s*/;
/** Abreviaturas tras las que un punto NO cierra la oración. */
const ABBREVIATION = /(?:^|\s)(?:n|nr|mq|ca|tel|int|p|pag|sig|dott|arch|ing|geom|avv|es|ecc|c\.a|s\.p\.a|s\.r\.l|\d{1,2})\.$/i;

function startsLower(word: string | undefined): boolean {
  return !!word && /^[a-zàèéìòù0-9]/.test(word);
}

/** Paso 1: devuelve el texto partido en "líneas" donde el aviso tenía un salto. */
function recoverBreaks(text: string): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = current[current.length - 1];
    const next = words[i + 1];
    const elided = /^[LlDd]['’][a-zàèéìòù]/.test(w) && /^[LD]/.test(w); // "L'eleganza", "D'altra"
    const single = (w === "A" || w === "È" || w === "E") && startsLower(next) && !!prev && /[A-ZÀ-Ý]/.test(prev[0] ?? "");
    // Tras un tramo en MAYÚSCULAS ("… PARCO DELL'ETNA Nel Comune di…") el
    // titular terminó aunque la palabra siguiente también lleve mayúscula.
    const afterCaps = !!prev && /^[A-ZÀ-Ý'’]{3,},?$/.test(prev);
    const starter = (STARTERS.has(w) && (startsLower(next) || afterCaps)) || elided || single;
    if (starter && prev && !BREAK_BEFORE.test(prev) && current.length >= 3) {
      lines.push(current.join(" "));
      current = [];
    }
    current.push(w);
  }
  if (current.length) lines.push(current.join(" "));
  return lines;
}

function splitSentences(text: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of text.split(/(?<=[.!?…]["»)]?)\s+(?=["«(]?[A-ZÀ-Ý0-9])/)) {
    current = current ? `${current} ${piece}` : piece;
    if (ABBREVIATION.test(current)) continue;
    out.push(current);
    current = "";
  }
  if (current) out.push(current);
  return out;
}

function paragraphs(line: string, max = 320): string[] {
  const out: string[] = [];
  let current = "";
  for (const s of splitSentences(line)) {
    if (current && (current.length + s.length > max || PARAGRAPH_OPENERS.test(s))) {
      out.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) out.push(current);
  return out;
}

function asList(line: string): DescriptionBlock[] | null {
  if (BULLETS.test(line)) {
    const [head, ...items] = line.split(BULLETS).map((x) => x.trim()).filter(Boolean);
    const startsWithBullet = BULLETS.test(line.slice(0, 3));
    const list = startsWithBullet ? [head, ...items] : items;
    if (list.length >= 2) {
      return [...(startsWithBullet || !head ? [] : [{ type: "p" as const, text: head }]), { type: "list", items: list }];
    }
  }
  const dashed = line.split(/\s+[-–]\s+(?=\S)/).map((x) => x.trim());
  if (dashed.length >= 4 && dashed.slice(1).every((x) => x.length <= 90)) {
    const [head, ...items] = dashed;
    return [...(head ? [{ type: "p" as const, text: head }] : []), { type: "list", items }];
  }
  return null;
}

export function formatDescription(raw: string | null | undefined): FormattedDescription | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const lines = recoverBreaks(text);
  let lead: string | null = null;
  // Titular: primera línea corta, sin punto final, seguida de más texto.
  if (lines.length > 1 && lines[0].length <= 170 && !SENTENCE_END.test(lines[0])) {
    lead = lines.shift()!.replace(/\s*[|–—-]\s*$/, "");
  }

  const blocks: DescriptionBlock[] = [];
  for (const line of lines) {
    const list = asList(line);
    if (list) blocks.push(...list);
    else for (const p of paragraphs(line)) blocks.push({ type: "p", text: p });
  }
  // Líneas muy cortas seguidas (restos de un salto mal recuperado) se unen al párrafo anterior.
  const merged: DescriptionBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (b.type === "p" && last?.type === "p" && (b.text.length < 60 || last.text.length < 60) && last.text.length + b.text.length < 380) {
      last.text = `${last.text} ${b.text}`;
    } else merged.push(b);
  }
  return { lead, blocks: merged };
}

/** Largo del texto de un bloque (para decidir dónde cortar el "leggi tutto"). */
export function blockLength(b: DescriptionBlock): number {
  return b.type === "p" ? b.text.length : b.items.reduce((n, x) => n + x.length, 0);
}
