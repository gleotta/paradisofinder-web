import Link from "next/link";
import { searchHref } from "@/lib/market";
import SearchHeroItalia from "./SearchHeroItalia";

/**
 * Home del mercado italia (17/11 — propuesta aprobada por German:
 * https://claude.ai/artifact/GddBdQEqidT7DpNrY61ib4). El buscador en
 * lenguaje natural es el protagonista; debajo, las ciudades con más avisos
 * y cómo funciona. Solo Compra y Affitta.
 */
const CITTA = ["Roma", "Milano", "Pomezia", "Catania", "Trapani"];

const PASSI = [
  {
    n: "01",
    titolo: "Scrivi quello che cerchi",
    testo: "Città, quartiere, budget, camere, ascensore, giardino: tutto in una frase, come lo diresti a un agente.",
  },
  {
    n: "02",
    titolo: "Affina parlando",
    testo: "«Anche a Pomezia», «togli il box», «i più economici prima». La ricerca ricorda quello che hai già detto.",
  },
  {
    n: "03",
    titolo: "Confronta il prezzo con la zona",
    testo:
      "Nella scheda trovi il prezzo al m² della zona e, quando ci sono abbastanza annunci simili, quello degli immobili entro 1 km.",
  },
];

export default function HomeItalia() {
  return (
    <main className="it-home">
      <section className="it-hero">
        <div className="container">
          <p className="it-eyebrow">Immobili in vendita e in affitto in tutta Italia</p>
          <h1>Scrivi la casa che cerchi. Al resto pensiamo noi.</h1>
          <p className="it-hero-sub">
            Niente filtri da compilare: descrivila con parole tue. Nella scheda di ogni immobile trovi anche il prezzo
            al m² della zona, per confrontare.
          </p>
          <SearchHeroItalia />
        </div>
      </section>

      <section className="container it-section" aria-labelledby="it-dove">
        <div className="it-section-head">
          <h2 id="it-dove">Dove cercare</h2>
          <p>Le città con più annunci</p>
        </div>
        <div className="it-cities">
          {CITTA.map((c) => (
            <Link key={c} className="it-city" href={searchHref(new URLSearchParams({ q: `immobili a ${c}` }))}>
              <span className="it-city-name">{c}</span>
              <span className="it-city-go">
                Vedi gli annunci
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container it-section" aria-labelledby="it-come">
        <div className="it-section-head">
          <h2 id="it-come">Come funziona</h2>
        </div>
        <div className="it-steps">
          {PASSI.map((p) => (
            <div className="it-step" key={p.n}>
              <span className="it-step-n">{p.n}</span>
              <h3>{p.titolo}</h3>
              <p>{p.testo}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
