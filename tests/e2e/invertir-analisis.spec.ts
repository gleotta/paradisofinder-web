import { expect, test, type Page } from "@playwright/test";
import { cards, collectEvents, eventsOf, FORBIDDEN, noHorizontalScroll, p2Mode, search } from "./helpers";

/**
 * Análisis de inversión (02/11 — `docs/DECISION_2026-11-02_analisis-inversion.md`,
 * handoff de P2 `docs/HANDOFF_P2_INVEST_2026-11-01.md`). Contra P2 REAL
 * (German, 03/10: prohibido probar con mocks): el Docker local del 8000 con el
 * endpoint desplegado. Con P2 sin el endpoint (204) o el canal apagado, las
 * pruebas que necesitan panel se saltan y se dice por qué.
 *
 * Cada análisis con `plan` paga ~US$ 0,05 (Opus) y el cupo de P2 es 6/min por
 * visitante: las pruebas espacian las corridas y reutilizan la caché de P1
 * (misma pregunta → `X-Invest-Cache: hit`, sin volver a pagar).
 */

const SIMPLE = "departamentos para invertir en Capital";
// El presupuesto cambia por corrida: la primera pasada de la comparación es un
// miss de la caché de P1 (se ve la espera real hasta `plan`) y el test de caché
// la repite tal cual (hit).
const BUDGET = 70 + (Date.now() % 25);
const COMPARACION = `Tengo ${BUDGET} mil dólares para invertir en San Juan y quiero comprar algo para alquilar. ¿Me conviene un departamento en Capital o una casa en Rivadavia? Priorizá la rentabilidad y que esté por debajo del precio de similares`;

const panel = (page: Page) => page.getByTestId("invest-panel");

/** ¿Hay análisis en este P1? (interruptor + P2 con el endpoint). */
async function investAvailable(page: Page): Promise<boolean> {
  const health = (await (await page.request.get("/api/health")).json()) as { invest_analysis?: boolean };
  if (health.invest_analysis === false) return false;
  const res = await page.request.post("/api/invest/analysis", { data: { query: SIMPLE, visitor_id: "e2e-probe" } });
  return res.status() === 200;
}

test.describe("Invertir · análisis de inversión", () => {
  test.describe.configure({ mode: "serial" });

  test("pregunta simple en Invertir: cartel de espera, skip y el panel se va; otras verticales no lo piden", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    const events = collectEvents(page);
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/invest/analysis")) requests.push(r.url());
    });
    // goto a mano: `search()` espera los resultados, y en una pregunta simple el
    // `skip` (~1,4 s; ~30 ms si P1 la tiene en caché) llega antes que las cards
    // de Invertir (~2 s). Para observar el cartel sin depender del reloj, la
    // respuesta real de P2 se demora 1,5 s en el browser (no es un mock).
    await page.route("**/api/invest/analysis", async (route) => {
      const res = await route.fetch();
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ response: res });
    });
    await page.goto(`/buscar?${new URLSearchParams({ q: SIMPLE, v: "invertir" })}`);
    // Desde el envío, el cartel de espera (German, 02/11): el panel en fase `waiting`.
    await expect(panel(page)).toHaveAttribute("data-phase", "waiting", { timeout: 10_000 });
    await expect(panel(page).getByTestId("invest-waiting")).toContainText("Estoy leyendo el mercado");
    await expect(page.locator(".invest-status")).toContainText("Analizando");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    // El canal se pidió una vez y P2 contestó skip (o el entorno no lo tiene): el panel se va.
    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
    await expect
      .poll(() => eventsOf(events, "invest_analysis_skipped").length + eventsOf(events, "invest_analysis_started").length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(eventsOf(events, "invest_analysis_started").length, "una pregunta simple no abre panel").toBe(0);
    await expect(panel(page)).toHaveCount(0, { timeout: 10_000 });
    expect(eventsOf(events, "invest_analysis_requested")[0]?.vertical).toBe("invertir");
    await page.unroute("**/api/invest/analysis");

    // La misma pregunta en Comprar: el canal ni se pide.
    const before = requests.length;
    await search(page, SIMPLE, "comprar");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    expect(requests.length).toBe(before);
    await expect(panel(page)).toHaveCount(0);
  });

  test("pregunta de comparación: panel con pasos, tabla, prosa, selección con 'Por qué' y aviso de estimación", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    test.skip(!(await investAvailable(page)), "este P1 no tiene análisis de inversión (apagado o P2 sin /search/invest)");
    const events = collectEvents(page);
    await page.goto(`/buscar?${new URLSearchParams({ q: COMPARACION, v: "invertir" })}`);
    // Primero el cartel de espera; con `plan` lo reemplazan los pasos.
    const p = panel(page);
    await expect(p).toHaveAttribute("data-phase", "waiting", { timeout: 10_000 });
    await expect(p.getByTestId("invest-waiting")).toBeVisible();
    await expect(p.getByTestId("invest-step")).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });

    // El panel sigue arriba del listado y con `plan` muestra los pasos (el cartel se va).
    await expect(p.getByTestId("invest-step").first()).toBeVisible({ timeout: 30_000 });
    await expect(p.getByTestId("invest-waiting")).toHaveCount(0);
    await expect(p.locator(".invest-title")).toHaveText("Lectura de FINDER · inversión");
    const panelBox = await p.boundingBox();
    const firstCardBox = await cards(page).first().boundingBox();
    expect(panelBox!.y, "el panel va arriba del listado").toBeLessThan(firstCardBox!.y);

    // Hasta `done`, como mucho 60 s (el tope del cliente).
    await expect(p).toHaveAttribute("data-phase", /done|timeout|error/, { timeout: 65_000 });
    expect(await p.getAttribute("data-phase"), "el análisis terminó").toBe("done");

    const steps = p.getByTestId("invest-step");
    expect(await steps.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await steps.count()); i++) {
      await expect(steps.nth(i)).toHaveAttribute("data-status", /done|failed/);
    }
    // Cada paso terminado dice cuántos avisos encontró.
    await expect(steps.first()).toContainText(/\d+ avisos?/);

    // Picks: de 1 a 6 cards completas, layout Invertir, con el motivo de P2 y origen propio.
    const picks = p.getByTestId("invest-picks").getByTestId("property-card");
    const n = await picks.count();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    for (let i = 0; i < n; i++) {
      const card = picks.nth(i);
      await expect(card).toHaveAttribute("data-vertical", "invertir");
      await expect(card.getByTestId("pick-reason")).toBeVisible();
      expect((await card.getByTestId("pick-reason").innerText()).length, "el motivo de P2 tiene texto").toBeGreaterThan(20);
      expect(await card.locator(".pcard-title a").getAttribute("href")).toMatch(/from=invest_pick/);
      expect(await card.locator(".pcard-title a").getAttribute("href")).toMatch(/[?&]r=\d+/);
      await expect(card.getByTestId("estimate-notice")).toBeVisible();
    }

    // Prosa y aviso de estimación al pie (lo pone P1, siempre).
    expect((await p.getByTestId("invest-answer").innerText()).length, "la prosa llegó").toBeGreaterThan(60);
    await expect(p.locator(".invest-body > .estimate-notice")).toHaveText(
      "Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.",
    );
    // Comparación: con dos opciones llega la tabla, con una fila por opción.
    const table = p.getByTestId("invest-comparison");
    if (await table.count()) {
      expect(await table.locator("tbody tr").count()).toBeGreaterThanOrEqual(2);
      await expect(table.locator("thead th").first()).toHaveText("Opción");
    }

    // Vocabulario: nada interno ni "None"/"null"; ni jerga en lo que arma P2.
    const text = await p.innerText();
    expect(text).not.toMatch(FORBIDDEN);
    expect(text.toLowerCase()).not.toMatch(/\b(yield|gap|percentil|opportunity score|semáforo|comparables|mediana)\b/);

    // Eventos: requested → started (analysis_id, pasos) → answered (usage, costo, latencias).
    await expect.poll(() => eventsOf(events, "invest_analysis_answered").length, { timeout: 10_000 }).toBe(1);
    const started = eventsOf(events, "invest_analysis_started")[0];
    expect(started.payload.analysis_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Array.isArray(started.payload.steps)).toBe(true);
    const answered = eventsOf(events, "invest_analysis_answered")[0];
    expect(answered.payload.analysis_id).toBe(started.payload.analysis_id);
    expect(typeof answered.payload.t_done).toBe("number");
    // El análisis arranca en el mismo tick que la búsqueda, antes de que exista la
    // sesión: el sobre la lleva salvo que la respuesta haya salido de la caché de P1
    // (todo llega en milisegundos, antes del POST /sessions).
    if ((answered.payload.t_done as number) > 1500) {
      expect(answered.session_id, "el sobre lleva la sesión de la búsqueda").toMatch(/^[0-9a-f-]{36}$/);
      expect(answered.search_id).toMatch(/\.\d+$/);
    }
    expect(answered.payload.picks).toBe(n);
    expect(answered.vertical).toBe("invertir");
    expect(eventsOf(events, "invest_analysis_step").length).toBeGreaterThanOrEqual(2);

    // Plegable, con estado recordado.
    await p.getByTestId("invest-toggle").click();
    await expect(p.getByTestId("invest-answer")).toHaveCount(0);
    await expect.poll(() => eventsOf(events, "invest_panel_toggled").length).toBe(1);
    await page.reload();
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });
    await expect(panel(page).getByTestId("invest-answer")).toHaveCount(0);
    await panel(page).getByTestId("invest-toggle").click();
    await expect(panel(page).getByTestId("invest-steps")).toBeVisible();

    await noHorizontalScroll(page);
  });

  test("la misma pregunta recargada sale de la caché de P1 (no vuelve a pagar)", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    test.skip(!(await investAvailable(page)), "este P1 no tiene análisis de inversión");
    const res = await page.request.post("/api/invest/analysis", {
      data: { query: COMPARACION, visitor_id: "e2e-probe" },
      headers: { Accept: "text/event-stream" },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["x-invest-cache"], "la corrida anterior quedó en caché").toBe("hit");
    const text = (await res.text()).replace(/\r\n/g, "\n");
    expect(text).toMatch(/^event: plan/m);
    expect(text).toMatch(/^event: done/m);
  });

  test("buscar otra cosa con el análisis en curso lo cancela y saca el panel", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    test.skip(!(await investAvailable(page)), "este P1 no tiene análisis de inversión");
    const events = collectEvents(page);
    // Pregunta distinta a la cacheada (misma forma): paga un plan y se corta antes de la redacción.
    await search(page, "Tengo 60 mil dólares: ¿me conviene un departamento en Capital o una casa en Rawson para alquilar?", "invertir");
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => eventsOf(events, "invest_analysis_started").length, { timeout: 10_000 }).toBe(1);
    const id = eventsOf(events, "invest_analysis_started")[0].payload.analysis_id as string;
    // Búsqueda nueva desde la barra sticky (in-app, como en el producto; un `goto`
    // recarga la página y el browser tira el evento junto con el SSE).
    const input = page.getByLabel("Buscar propiedades");
    await input.fill("casa en rawson");
    await input.press("Enter");
    await expect(panel(page)).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => eventsOf(events, "invest_analysis_cancelled").length, { timeout: 10_000 }).toBe(1);
    expect(eventsOf(events, "invest_analysis_cancelled")[0].payload.analysis_id).toBe(id);
    expect(eventsOf(events, "invest_analysis_answered").filter((e) => e.payload.analysis_id === id).length).toBe(0);
    // La búsqueda nueva, simple y en Invertir, no abre panel.
    await page.waitForTimeout(3000);
    await expect(panel(page)).toHaveCount(0);
  });

  test("elegir Invertir con resultados en pantalla pide el análisis de la pregunta tipeada", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    test.skip(!(await investAvailable(page)), "este P1 no tiene análisis de inversión");
    const events = collectEvents(page);
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/invest/analysis")) requests.push(r.postData() ?? "");
    });
    // Texto neutro (desde el 02/11 el texto nunca lleva a Invertir: es la vertical
    // de inversión y se elige con el selector).
    const text = "departamento en Capital hasta 80 mil dólares";
    await search(page, text, "comprar");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    expect(requests.length).toBe(0);
    await page.locator(".vseg--bar").getByRole("button", { name: "Invertir" }).click();
    await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
    expect(JSON.parse(requests[0]).query, "va el texto crudo, no la frase canónica").toBe(text);
    // Es una pregunta simple: P2 contesta skip y el panel (que mostró la espera) se va.
    await expect.poll(() => eventsOf(events, "invest_analysis_skipped").length, { timeout: 20_000 }).toBe(1);
    await expect(panel(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(".vseg--bar").getByRole("button", { name: "Invertir" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("MCP · link del detalle", () => {
  test("/dettaglio/<id> redirige (permanente, 308) a /propiedad/<id> conservando la query", async ({ page }) => {
    const res = await page.request.get("/dettaglio/abc-123?utm_source=mcp", { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers().location).toMatch(/\/propiedad\/abc-123\?utm_source=mcp$/);
  });
});
