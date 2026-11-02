"""Cobertura de indicadores de inversión por zona, medida contra P2 local
(/search/structured), sin tocar la DB. Rate limit 30/min → 2,6 s entre llamadas."""
import json, sys, time, urllib.request, statistics, collections

BASE = "http://localhost:8000/api/v1/search/structured"
PAUSE = 2.6
zones_path = sys.argv[1]

def call(body):
    req = urllib.request.Request(BASE, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    time.sleep(PAUSE)
    return out

raw = json.load(open(zones_path))
codes = []
for z in raw:
    if isinstance(z, dict):
        c = z.get("code") or z.get("id") or z.get("slug") or z.get("zone")
    else:
        c = z
    if isinstance(c, str):
        codes.append(c)
print("zonas:", codes, file=sys.stderr)

# A. todas las ventas de vivienda con rentabilidad publicada
cards = []
offset = 0
while True:
    d = call({"vertical": "sale", "filters": [{"field": "gross_yield_pct", "operator": "gte", "value": 0}],
              "order": "gross_yield_desc", "limit": 100, "offset": offset})
    cards += d["cards"]
    total_yield = d["total_matches"]
    offset += 100
    if offset >= total_yield or not d["cards"]:
        break

by_zone = collections.Counter(c.get("zone") for c in cards)
by_type = collections.Counter(c.get("property_type") for c in cards)
yields = [c["gross_yield_pct"] for c in cards if c.get("gross_yield_pct") is not None]
green = sum(1 for c in cards if c.get("deal_rating") == "green")
rent_rating = collections.Counter(c.get("rental_investment_rating") for c in cards)
resale_rating = collections.Counter(c.get("resale_investment_rating") for c in cards)
with_gap = sum(1 for c in cards if c.get("valuation_gap_pct") is not None)
with_trend = sum(1 for c in cards if (c.get("zone_ref") or {}).get("trend"))
with_cap = sum(1 for c in cards if (c.get("zone_ref") or {}).get("cap_pct") is not None)
with_price_ref = sum(1 for c in cards if c.get("price_ref"))
with_coords = sum(1 for c in cards if c.get("latitude") is not None)
# distribución de precios del set con rentabilidad
prices = [c["price_usd"] for c in cards if c.get("price_usd")]

# B. total de ventas de vivienda por zona
totals = {}
for z in codes:
    d = call({"vertical": "sale", "zones": [z], "limit": 1})
    totals[z] = d["total_matches"]

# C. totales con gap y con score (toda la provincia)
d_gap = call({"vertical": "sale", "filters": [{"field": "valuation_gap_pct", "operator": "gte", "value": -100}], "limit": 1})
d_all = call({"vertical": "sale", "limit": 1})

res = {
    "sale_total": d_all["total_matches"],
    "sale_with_gap": d_gap["total_matches"],
    "sale_with_yield": total_yield,
    "yield_median": statistics.median(yields) if yields else None,
    "yield_p90": sorted(yields)[int(len(yields) * 0.9)] if yields else None,
    "yield_max": max(yields) if yields else None,
    "yield_by_type": dict(by_type),
    "yield_green_deal": green,
    "rental_investment_rating": dict(rent_rating),
    "resale_investment_rating": dict(resale_rating),
    "yield_with_gap": with_gap,
    "yield_with_zone_trend": with_trend,
    "yield_with_cap_pct": with_cap,
    "yield_with_price_ref": with_price_ref,
    "yield_with_coords": with_coords,
    "price_usd_median_of_yield_set": statistics.median(prices) if prices else None,
    "per_zone": {z: {"sale_total": totals[z], "with_yield": by_zone.get(z, 0)} for z in codes},
    "yield_zones_not_in_catalog": {z: n for z, n in by_zone.items() if z not in codes},
}
print(json.dumps(res, ensure_ascii=False, indent=1))
