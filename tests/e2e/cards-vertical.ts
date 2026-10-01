import { expect, test, type Locator, type Page } from "@playwright/test";
import { cards, collectEvents, eventsOf, noHorizontalScroll, p2Mode, search } from "./helpers";

/**
 * Batería común de las cards por vertical (29/09 —
 * `docs/GUIA_P1_2026-09-29_cards-por-vertical.md` §2.6). Cada spec
 * (`cards-alquilar`, `cards-comprar`, `cards-lotes`, `cards-invertir`) la
 * corre con su vertical.
 *
 * Dos modos, según el P2 que tenga detrás el P1 bajo prueba:
 *  - mocks: además de las reglas generales se afirman los CASOS FIJOS — las
 *    tres primeras cards de cada vertical son los avisos del mockup aprobado
 *    (`FIXTURES` en `src/lib/p2/mocks.ts`, ids `sj-mk<k>0..2`);
 *  - contrato (`P2_MODE=live`): solo las reglas generales sobre lo que P2
 *    mande; un bloque cuyo campo todavía no llega simplemente no está.
 */

export type VerticalId = "alquilar" | "comprar" | "invertir" | "lotes";

export interface VerticalCase {
  id: VerticalId;
  query: string;
  /** Letra del id de los mocks (`sj-mk<k><n>`). */
  kind: "r" | "s" | "i" | "l";
  /** ¿La vertical lleva bloque Zona? (Alquilar no). */
  zone: boolean;
  /** Chips del caso fijo 1, en el orden de la vertical: 3 visibles + "+1". */
  chips: string[];
  /** Caso fijo con "margen para negociar" y caso fijo sin él. */
  negotiate: { yes: number; no: number };
  /**
   * Conjunto de similares del caso fijo 0 (P2 30/09-01/10): `count` en el
   * conjunto, `listed` a la vista en el detalle. En alquiler el conjunto por
   * dormitorios no tiene tope y casi la mitad no se muestra (tier 0).
   */
  comparables: { count: number; listed: number };
}

/** Avisos similares a la vista en el detalle antes de "Mostrar los N restantes" (P1 recorta; P2 ya no). */
const COMPARABLES_VISIBLE = 30;

export const NOTICE = "Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.";

/** Lo que la card no puede decir: jerga interna, score, semáforos de inversión y "no informado" crudo. */
const FORBIDDEN = /\b(Score|Reventa|Datos completos|P1|P2|P3|cap|gap|None|null|unknown|undefined|NaN)\b|Renta est\.|Excelente estado|Buen estado/;

const GREEN_BG = "rgb(226, 242, 234)";
const NEUTRAL_BG = "rgb(244, 237, 247)";

/**
 * Rate limit de búsqueda de P2: 30/min por IP, y cada búsqueda con vertical
 * son dos llamadas (la sonda de la extracción y el turno). Contra P2 real se
 * espacian; contra los mocks no hace falta.
 */
export async function pace(page: Page, live: boolean): Promise<void> {
  if (live) await page.waitForTimeout(5000);
}

const bg = (el: Locator) => el.evaluate((node) => getComputedStyle(node).backgroundColor);

async function open(page: Page, c: VerticalCase): Promise<{ live: boolean; n: number }> {
  const live = (await p2Mode(page)) === "live";
  await pace(page, live);
  await search(page, c.query, c.id);
  await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
  return { live, n: Math.min(await cards(page).count(), 20) };
}

const fixed = (page: Page, c: VerticalCase, n: number) => page.locator(`[data-testid="property-card"][data-id="sj-mk${c.kind}${n}"]`);

export function verticalBattery(c: VerticalCase): void {
  test.describe(`cards · ${c.id}`, () => {
    test("sin score, semáforos ni jerga; aviso de estimación en toda card", async ({ page }) => {
      const { n } = await open(page, c);
      for (let i = 0; i < n; i++) {
        const card = cards(page).nth(i);
        await expect(card, `card #${i + 1}`).toHaveAttribute("data-vertical", c.id);
        const text = await card.innerText();
        expect(text.match(FORBIDDEN)?.[0], `card #${i + 1}: texto prohibido`).toBeUndefined();
        await expect(card.getByTestId("estimate-notice")).toHaveText(NOTICE);
        await expect(card.locator("details.score, details.rating, .signal, .market-context")).toHaveCount(0);
      }
    });

    test("posición: solo verde, barra sin texto en el medio y 'ver similares'", async ({ page }) => {
      const { live, n } = await open(page, c);
      let seen = 0;
      for (let i = 0; i < n; i++) {
        const card = cards(page).nth(i);
        const block = card.getByTestId("position");
        if ((await block.count()) === 0) continue;
        seen++;
        const pct = (await block.locator(".posblock-pct").innerText()).trim();
        expect(pct).toMatch(/^\d{1,2}\s%\+?$/);
        const head = await block.locator(".posblock-text").innerText();
        expect(head).toMatch(/por debajo|por encima|en línea con la zona|verificar el aviso/);
        // "verificar el aviso" es `deal_rating: verify_data`, siempre acotado; pero un acotado
        // no siempre es a verificar: el alquiler caro (P2 30/09) es "35 %+ por encima", en neutro.
        if (head.includes("verificar el aviso")) expect(pct.endsWith("+"), `"${pct}" con "${head}"`).toBe(true);
        if (pct.endsWith("+")) expect(head).toMatch(/verificar el aviso|por encima|por debajo/);

        // Solo verde o neutro: ningún color de alarma.
        const tone = await block.getAttribute("data-tone");
        expect(await bg(block)).toBe(tone === "green" ? GREEN_BG : NEUTRAL_BG);
        await expect(block).toHaveClass(tone === "green" ? /posblock--green/ : /^posblock$/);

        const bar = block.getByTestId("position-bar");
        if (await bar.count()) {
          expect((await bar.locator(".posbar-track").innerText()).trim()).toBe("");
          await expect(bar.locator(".posbar-ends span")).toHaveText(["más barato", "más caro"]);
        }
        const id = await card.getAttribute("data-id");
        const href = await block.getByTestId("similars-link").getAttribute("href");
        expect(href).toMatch(new RegExp(`^/propiedad/${encodeURIComponent(id!)}(\\?[^#]*)?#comparables$`));
      }
      if (live) return;
      expect(seen).toBeGreaterThan(0);
      // Casos fijos: green → verde · yellow → neutro · verify_data acotado → neutro y "verificar el aviso".
      await expect(fixed(page, c, 0).getByTestId("position")).toHaveAttribute("data-tone", "green");
      await expect(fixed(page, c, 0).getByTestId("position")).toContainText("de similares");
      await expect(fixed(page, c, 1).getByTestId("position")).toHaveAttribute("data-tone", "neutral");
      await expect(fixed(page, c, 1).getByTestId("position")).toContainText("en línea con la zona");
      const capped = fixed(page, c, 2).getByTestId("position");
      await expect(capped).toHaveAttribute("data-tone", "neutral");
      await expect(capped.locator(".posblock-pct")).toHaveText(/^35\s%\+$/);
      await expect(capped).toContainText("verificar el aviso");
      // Sin gap no hay bloque (la card 10 de los mocks no tiene comparables suficientes).
      await expect(fixed(page, c, 9)).toBeVisible();
      await expect(fixed(page, c, 9).getByTestId("position")).toHaveCount(0);
    });

    test("tendencia: 'En baja' con el precio anterior en la moneda del aviso, 'En alta' sin 'antes'", async ({ page }) => {
      const { live, n } = await open(page, c);
      for (let i = 0; i < n; i++) {
        const card = cards(page).nth(i);
        const pill = card.getByTestId("price-trend");
        if ((await pill.count()) === 0) continue;
        const text = (await pill.innerText()).trim();
        if ((await pill.getAttribute("data-trend")) === "down") {
          expect(text).toMatch(/^En baja( \d+\s%)?( · antes (US\$|\$|€) [\d.]+)?$/);
          const before = text.match(/antes (US\$|\$|€)/)?.[1];
          const price = (await card.locator(".pcard-price").innerText()).trim();
          if (before) expect(price.startsWith(`${before} `), `moneda del aviso en "${text}" (${price})`).toBe(true);
        } else {
          expect(text).toMatch(/^En alta( \d+\s%)?$/);
        }
      }
      if (live) return;
      const [down, up, none] = c.id === "lotes" ? [0, 2, 1] : [0, 1, 2];
      await expect(fixed(page, c, down).getByTestId("price-trend")).toHaveAttribute("data-trend", "down");
      await expect(fixed(page, c, down).getByTestId("price-trend")).toContainText("antes");
      await expect(fixed(page, c, up).getByTestId("price-trend")).toHaveAttribute("data-trend", "up");
      await expect(fixed(page, c, up).getByTestId("price-trend")).not.toContainText("antes");
      await expect(fixed(page, c, none).getByTestId("price-trend")).toHaveCount(0);
    });

    test(c.zone ? "zona: referencia sin porcentaje, verde solo si sube" : "zona: no va en esta vertical", async ({ page }) => {
      const { live, n } = await open(page, c);
      if (!c.zone) {
        await expect(page.getByTestId("zone-ref")).toHaveCount(0);
        return;
      }
      for (let i = 0; i < n; i++) {
        const block = cards(page).nth(i).getByTestId("zone-ref");
        if ((await block.count()) === 0) continue;
        await expect(block.locator(".block-kicker")).toHaveText(/^Zona · \S/i);
        const value = block.locator(".zoneblock-value");
        if (await value.count()) await expect(value).toHaveText(/^(m²|ha) US\$ [\d.,]+( \(zona ampliada\))?$/);
        // Referencia, no comparación: el único porcentaje posible es el de la tendencia de la zona.
        expect(await block.locator(".zoneblock-main").innerText()).not.toMatch(/por debajo|por encima/);
        const up = (await block.locator('.zoneblock-trend[data-trend="up"]').count()) > 0;
        await expect(block).toHaveAttribute("data-tone", up ? "green" : "neutral");
        expect(await bg(block)).toBe(up ? GREEN_BG : NEUTRAL_BG);
      }
      if (live) return;
      const [flat, rising, widened] = [0, 1, 2].map((k) => fixed(page, c, k).getByTestId("zone-ref"));
      await expect(flat.locator(".zoneblock-trend")).toHaveText("Estable");
      await expect(flat).toHaveAttribute("data-tone", "neutral");
      await expect(rising.locator(".zoneblock-trend")).toHaveText(/^En suba \d+(,\d)?\s%$/);
      await expect(rising).toHaveAttribute("data-tone", "green");
      await expect(widened).toContainText("(zona ampliada)");
      // Sin `zone_ref` la ranura queda vacía; en lotes queda la celda que el
      // contrato del 13/09 ya manda (`zone_stats_ref`), sin tendencia.
      await expect(fixed(page, c, 4)).toBeVisible();
      if (c.id === "lotes") {
        await expect(fixed(page, c, 4).getByTestId("zone-ref").locator(".zoneblock-value")).toHaveText(/^(m²|ha) US\$ [\d.,]+/);
        await expect(fixed(page, c, 4).getByTestId("zone-ref")).toHaveAttribute("data-tone", "neutral");
        await expect(fixed(page, c, 4).getByTestId("zone-ref").locator(".zoneblock-trend")).toHaveCount(0);
      } else {
        await expect(fixed(page, c, 4).getByTestId("zone-ref")).toHaveCount(0);
      }
      if (c.id === "lotes") {
        await expect(flat.locator(".zoneblock-value")).toHaveText(/^m² US\$/);
        await expect(widened.locator(".zoneblock-value")).toHaveText(/^ha US\$/);
      }
    });

    test("fechas: 'margen para negociar' solo pasado el corte de la vertical", async ({ page }) => {
      const { live, n } = await open(page, c);
      for (let i = 0; i < n; i++) {
        const dates = cards(page).nth(i).locator(".pcard-dates");
        if ((await dates.count()) === 0) continue;
        const text = (await dates.innerText()).trim();
        expect(text).toMatch(/^(Actualizado|Publicado) (hoy|ayer|hace )/);
        expect(text.includes("margen para negociar")).toBe(/publicado hace .+ · margen para negociar$/i.test(text));
      }
      if (live) return;
      await expect(fixed(page, c, c.negotiate.yes).locator(".pcard-dates")).toContainText("margen para negociar");
      await expect(fixed(page, c, c.negotiate.no).locator(".pcard-dates")).toHaveText(/^Actualizado [^·]+$/);
    });

    test("chips: orden fijo, máximo 3 + '+N', sin 'Excelente estado', un solo tag", async ({ page }) => {
      const { live, n } = await open(page, c);
      for (let i = 0; i < n; i++) {
        const card = cards(page).nth(i);
        const shown = card.locator(".attr:not(.attr--more)");
        expect(await shown.count(), `card #${i + 1}: chips visibles`).toBeLessThanOrEqual(3);
        const soft = await card.locator(".attr--soft").count();
        expect(soft).toBeLessThanOrEqual(1);
        // El tag del LLM solo entra si no hay ningún chip duro.
        if (soft === 1) expect(await shown.count()).toBe(1);
        // Etiquetas PROPIAS de P1; un tag de P3 se muestra tal cual, diga lo que diga.
        expect((await card.locator(".attr:not(.attr--more):not(.attr--soft)").allInnerTexts()).join(" | ")).not.toMatch(
          /sin servicios|Excelente estado|Buen estado/i,
        );
      }
      if (live) return;
      const card = fixed(page, c, 1);
      await expect(card.locator(".attr:not(.attr--more)")).toHaveText(c.chips.slice(0, 3));
      await expect(card.locator(".attr--more")).toHaveText(`+${c.chips.length - 3}`);
      await card.locator(".attr--more").click();
      await expect(card.locator(".attr:not(.attr--more)")).toHaveText(c.chips);
    });

    test("detalle: #comparables, score explicado y semáforos; sin indicadores secundarios", async ({ page, context }) => {
      const events = collectEvents(page);
      const { live } = await open(page, c);
      const card = live ? cards(page).first() : fixed(page, c, 0);
      const link = card.getByTestId("similars-link");
      let detail: Page;
      if (await link.count()) {
        // "ver similares" abre el detalle en pestaña nueva, parado en sus comparables, y se mide.
        [detail] = await Promise.all([context.waitForEvent("page"), link.click()]);
        await expect
          .poll(() => eventsOf(events, "card_opened").some((e) => e.payload.target === "similars"))
          .toBe(true);
      } else {
        detail = await context.newPage();
        await detail.goto(`${await card.locator(".pcard-title a").getAttribute("href")}#comparables`);
      }
      await expect(detail).toHaveURL(/#comparables$/);
      await expect(detail.locator("h1")).toBeVisible();
      const section = detail.locator("section#comparables");
      await expect(section).toBeVisible();
      await expect(section).toBeInViewport();
      const main = await detail.locator("main").innerText();
      expect(main).not.toMatch(/Datos completos|\b(None|null|unknown|NaN)\b/);
      // Vocabulario propio del detalle sin jerga (deuda de P1 cerrada el 01/10).
      expect(main).not.toMatch(/Percentil|Opportunity Score|Comparables considerados|Renta bruta|Comparables en la zona/);
      await expect(detail.getByTestId("estimate-notice")).toHaveText(NOTICE);
      // La tabla de "indicadores secundarios" se fue: queda, como mucho, la del score.
      expect(await detail.locator(".comp-table").count()).toBeLessThanOrEqual(1);
      // Avisos similares (P2 30/09-01/10): el conjunto entero con su cabecera; a la vista
      // como mucho 30, el resto detrás de "Mostrar los N restantes".
      await expect(section.locator("h2")).toHaveText("Avisos similares");
      const minis = section.locator(".minicard");
      const shown = await minis.count();
      expect(shown).toBeLessThanOrEqual(COMPARABLES_VISIBLE);
      const pool = section.getByTestId("comparables-pool");
      if (await pool.count()) {
        expect(await pool.innerText()).toMatch(/^Comparado con \d+ .*similares.* en \S/);
      }
      for (let i = 0; i < Math.min(shown, 5); i++) {
        expect(await minis.nth(i).innerText()).not.toMatch(/\b0 m²|\b(None|null|NaN)\b/);
      }
      if (!live) {
        await expect(detail.locator(".score-num")).toBeVisible();
        await expect(detail.locator(".comp-table tr").first()).toBeVisible();
        await expect(detail.locator(".rating-block").first()).toBeVisible();
        const { count, listed } = c.comparables;
        await expect(pool).toContainText(`Comparado con ${count} `);
        await expect(minis).toHaveCount(Math.min(listed, COMPARABLES_VISIBLE));
        const more = section.getByTestId("comparables-more");
        if (listed > COMPARABLES_VISIBLE) {
          await expect(more).toHaveText(`Mostrar los ${listed - COMPARABLES_VISIBLE} restantes`);
          await more.click();
          await expect(minis).toHaveCount(listed);
          await expect(more).toHaveCount(0);
        } else {
          await expect(more).toHaveCount(0);
        }
        if (count > listed) await expect(pool).toContainText(`${listed} a la vista · los otros ${count - listed} no se muestran`);
        else await expect(pool).not.toContainText("a la vista");
        if (c.zone) await expect(detail.getByTestId("zone-ref")).toBeVisible();
        if (c.id === "invertir") await expect(detail.getByTestId("estimate")).toBeVisible();
        else await expect(detail.getByTestId("estimate")).toHaveCount(0);
      }
      await detail.close();
    });

    test("layout: sin scroll horizontal, aire a los costados y cards parejas por fila", async ({ page }) => {
      const { n } = await open(page, c);
      await noHorizontalScroll(page);
      const width = page.viewportSize()!.width;
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      for (let i = 0; i < Math.min(n, 10); i++) {
        const card = cards(page).nth(i);
        await card.scrollIntoViewIfNeeded();
        const box = (await card.boundingBox())!;
        expect(box.x, `card #${i + 1}: aire a la izquierda`).toBeGreaterThanOrEqual(12);
        expect(width - (box.x + box.width), `card #${i + 1}: aire a la derecha`).toBeGreaterThanOrEqual(12);
        // Nada de la card se sale de ella (pastillas, barra, chips).
        const overflow = await card.evaluate((el) => {
          const limit = el.getBoundingClientRect();
          return [...el.querySelectorAll<HTMLElement>(".trend-pill, .pbadge, .pflag, .posblock, .zoneblock, .estblock, .attr, .pcard-actions")].filter(
            (child) => {
              const r = child.getBoundingClientRect();
              return r.left < limit.left - 0.5 || r.right > limit.right + 0.5;
            },
          ).length;
        });
        expect(overflow, `card #${i + 1}: elementos fuera de la card`).toBe(0);
        boxes.push({ x: box.x, y: box.y + (await page.evaluate(() => window.scrollY)), w: box.width, h: box.height });
      }
      const rows = new Map<number, number[]>();
      for (const b of boxes) rows.set(Math.round(b.y), [...(rows.get(Math.round(b.y)) ?? []), b.h]);
      for (const [y, heights] of rows) {
        if (heights.length < 2) continue;
        expect(Math.max(...heights) - Math.min(...heights), `fila en y=${y}`).toBeLessThanOrEqual(1);
      }
    });
  });
}
