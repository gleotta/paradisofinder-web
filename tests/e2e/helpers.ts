import { expect, type Page, type Request } from "@playwright/test";

/** Evento que el browser mandó a /api/events (sobre + payload). */
export interface SentEvent {
  event_type: string;
  payload: Record<string, unknown>;
  session_id: string | null;
  search_id: string | null;
  vertical: string | null;
  query: string | null;
}

/** Captura todo lo que la página manda a /api/events. */
export function collectEvents(page: Page): SentEvent[] {
  const out: SentEvent[] = [];
  page.on("request", (req: Request) => {
    if (req.method() !== "POST" || !req.url().includes("/api/events")) return;
    try {
      const body = req.postDataJSON() as SentEvent;
      if (body?.event_type) out.push(body);
    } catch {
      /* keepalive sin body legible */
    }
  });
  return out;
}

export function eventsOf(events: SentEvent[], type: string): SentEvent[] {
  return events.filter((e) => e.event_type === type);
}

/** Busca desde la URL y espera las primeras cards (o el estado terminal). */
export async function search(page: Page, query: string, vertical?: string): Promise<void> {
  const params = new URLSearchParams({ q: query });
  if (vertical) params.set("v", vertical);
  await page.goto(`/buscar?${params.toString()}`);
  await expect(page.getByTestId("results")).toHaveAttribute("data-state", /results|clarification|error/, { timeout: 45_000 });
}

export const cards = (page: Page) => page.getByTestId("property-card");

/** Textos que jamás pueden verse (T3). */
export const FORBIDDEN = /\b(None|null|unknown|undefined|NaN)\b/;

export async function noHorizontalScroll(page: Page): Promise<void> {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "sin scroll horizontal").toBeLessThanOrEqual(cw + 1);
}

/** Modo de P2 detrás del P1 bajo prueba ("live" | "mock" | "auto"). */
export async function p2Mode(page: Page): Promise<string> {
  const res = await page.request.get("/api/health");
  const body = (await res.json()) as { p2_mode?: string; p2_target?: string | null };
  if (body.p2_mode === "auto" && !body.p2_target) return "mock";
  return body.p2_mode ?? "auto";
}
