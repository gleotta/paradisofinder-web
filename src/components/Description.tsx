"use client";

import { useState } from "react";
import { blockLength, type FormattedDescription } from "@/lib/description";

/** Texto visible antes del "Leggi tutta la descrizione" (el aviso medio tiene 1.800 caracteres). */
const VISIBLE_CHARS = 750;

/**
 * Descripción del aviso en la ficha de italia (18/11): titular, párrafos y
 * listas (`formatDescription`), con el resto detrás de un botón cuando es
 * larga. Las palabras son las del aviso, tal cual.
 */
export default function Description({ content }: { content: FormattedDescription }) {
  const [open, setOpen] = useState(false);
  let cut = content.blocks.length;
  let acc = 0;
  for (let i = 0; i < content.blocks.length; i++) {
    acc += blockLength(content.blocks[i]);
    if (acc >= VISIBLE_CHARS) {
      cut = i + 1;
      break;
    }
  }
  // Esconder un solo párrafo no vale un botón.
  const collapsible = content.blocks.length - cut >= 2;
  const shown = open || !collapsible ? content.blocks : content.blocks.slice(0, cut);

  return (
    <div className="it-desc" data-testid="description">
      {content.lead && <p className="it-desc-lead">{content.lead}</p>}
      {shown.map((b, i) =>
        b.type === "p" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
      {collapsible && (
        <button type="button" className="it-desc-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Mostra meno" : "Leggi tutta la descrizione"}
        </button>
      )}
    </div>
  );
}
