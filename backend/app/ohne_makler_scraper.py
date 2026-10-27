import re
import httpx
from bs4 import BeautifulSoup
from calculator import RawListing

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


def zip_to_state_and_coords(zip_code: str) -> tuple[str, str, float, float, float, float]:
    """
    Leitet aus der 5-stelligen deutschen Postleitzahl das Bundesland (Kürzel + Name),
    approximative Geokoordinaten (Lat/Lon) sowie regionale Markt-Referenzwerte (€/m² Kauf & Miete) ab.
    """
    prefix2 = int(zip_code[:2]) if len(zip_code) >= 2 and zip_code[:2].isdigit() else 68

    if 1 <= prefix2 <= 4:
        return ("SN", "Sachsen", 51.20, 13.10, 2750.0, 10.50)
    if 6 <= prefix2 <= 6:
        return ("ST", "Sachsen-Anhalt", 51.50, 11.97, 2100.0, 8.50)
    if 7 <= prefix2 <= 9:
        return ("SN", "Sachsen", 50.83, 12.92, 2050.0, 8.40)
    if 10 <= prefix2 <= 14:
        return ("BE", "Berlin", 52.52, 13.40, 4950.0, 15.80)
    if 15 <= prefix2 <= 16:
        return ("BB", "Brandenburg", 52.40, 13.06, 3100.0, 11.20)
    if 17 <= prefix2 <= 19:
        return ("MV", "Mecklenburg-Vorpommern", 53.85, 12.10, 2850.0, 10.40)
    if 20 <= prefix2 <= 22:
        return ("HH", "Hamburg", 53.55, 10.00, 5600.0, 16.20)
    if 23 <= prefix2 <= 25:
        return ("SH", "Schleswig-Holstein", 54.15, 10.15, 3300.0, 11.50)
    if 26 <= prefix2 <= 27 or 29 <= prefix2 <= 31 or 37 <= prefix2 <= 38 or 49 == prefix2:
        return ("NI", "Niedersachsen", 52.55, 9.75, 2900.0, 10.60)
    if prefix2 == 28:
        return ("HB", "Bremen", 53.08, 8.80, 3100.0, 11.40)
    if 32 <= prefix2 <= 33 or 40 <= prefix2 <= 48 or 50 <= prefix2 <= 53 or 57 <= prefix2 <= 59:
        return ("NW", "Nordrhein-Westfalen", 51.25, 7.15, 3450.0, 12.10)
    if 34 <= prefix2 <= 36 or 60 <= prefix2 <= 65:
        return ("HE", "Hessen", 50.15, 8.70, 4150.0, 13.80)
    if prefix2 == 39:
        return ("ST", "Sachsen-Anhalt", 52.13, 11.62, 2150.0, 8.60)
    if 54 <= prefix2 <= 56 or prefix2 == 67:
        return ("RP", "Rheinland-Pfalz", 49.90, 7.60, 2850.0, 10.50)
    if prefix2 == 66:
        return ("SL", "Saarland", 49.24, 7.00, 2250.0, 9.20)
    if 68 <= prefix2 <= 79:
        return ("BW", "Baden-Württemberg", 48.78, 9.18, 3950.0, 13.40)
    if 80 <= prefix2 <= 97:
        return ("BY", "Bayern", 48.35, 11.55, 4550.0, 14.50)
    if 98 <= prefix2 <= 99:
        return ("TH", "Thüringen", 50.98, 11.03, 2450.0, 9.60)

    return ("BW", "Baden-Württemberg", 49.00, 8.50, 3400.0, 12.00)


def _parse_german_number(raw: str) -> float:
    cleaned = re.sub(r"[^\d,\.]", "", raw or "")
    if not cleaned:
        return 0.0
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    else:
        # Tausenderpunkt wie "449.000" -> 449000
        parts = cleaned.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            cleaned = "".join(parts)
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_ohne_makler_html(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []
    seen_ids: set[str] = set()

    for card in soup.find_all("a", attrs={"data-om-id": True}):
        om_id = str(card.get("data-om-id", "")).strip()
        href = str(card.get("href", "")).strip()
        if not om_id or om_id in seen_ids or "/immobilie/" not in href:
            continue

        # 1. Kaufpreis
        price_span = card.find("span", class_=lambda c: c and "text-primary-500" in c)
        price_val = _parse_german_number(price_span.get_text(strip=True)) if price_span else 0.0
        if price_val < 15000:
            continue

        # 2. Titel
        h4 = card.find("h4")
        title = h4.get_text(" ", strip=True) if h4 else f"Eigentumswohnung #{om_id}"

        # 3. PLZ + Ort (+ ggf. Stadtteil in Klammern)
        zip_code = "68159"
        city = "Deutschland"
        district = "Zentrum"
        loc_text = ""
        for span in card.find_all("span"):
            txt = span.get_text(" ", strip=True)
            m = re.search(r"\b(\d{5})\s+([^\(\n\r]+?)(?:\s*\(([^\)]+)\))?$", txt)
            if m:
                zip_code = m.group(1).strip()
                city = m.group(2).strip()
                district = (m.group(3) or "Provisionsfrei").strip()
                loc_text = txt
                break

        # 4. Zimmer & Wohnfläche
        rooms_div = card.find("div", attrs={"title": "Zimmer"})
        rooms = 2.5
        if rooms_div:
            r_val = _parse_german_number(rooms_div.get_text(strip=True))
            if 0.5 <= r_val <= 30:
                rooms = r_val

        area_div = card.find("div", attrs={"title": re.compile(r"Wohnfl", re.I)})
        living_area = 0.0
        if area_div:
            a_val = _parse_german_number(area_div.get_text(strip=True))
            if 10.0 <= a_val <= 1500.0:
                living_area = a_val

        if living_area <= 0:
            continue

        # 5. Energieeffizienzklasse
        energy_span = card.find("span", class_="energy-class-arrow")
        energy_class = energy_span.get_text(strip=True) if energy_span else "C"

        # 6. Bild
        img_tag = card.find("img")
        image_url = img_tag.get("src", "") if img_tag else ""

        state_code, state_name, base_lat, base_lon, ref_sqm_price, ref_sqm_rent = (
            zip_to_state_and_coords(zip_code)
        )

        # Deterministischer kleiner Offset anhand der ID für Karten-Pins in derselben Region
        seed_num = sum(ord(ch) * (i + 1) for i, ch in enumerate(om_id))
        lat_offset = ((seed_num % 100) - 50) * 0.004
        lon_offset = (((seed_num // 7) % 100) - 50) * 0.005

        full_url = (
            href if href.startswith("http") else f"https://www.ohne-makler.net{href}"
        )

        seen_ids.add(om_id)
        results.append(
            {
                "portal": "Ohne-Makler",
                "external_id": om_id,
                "url": full_url,
                "title": title,
                "zip_code": zip_code,
                "city": city,
                "district": district,
                "state_code": state_code,
                "federal_state": state_name,
                "latitude": round(base_lat + lat_offset, 5),
                "longitude": round(base_lon + lon_offset, 5),
                "price": price_val,
                "living_area": living_area,
                "rooms": rooms,
                "energy_class": energy_class or "C",
                "ref_sqm_price": ref_sqm_price,
                "ref_sqm_rent": ref_sqm_rent,
                "image_url": image_url,
                "has_broker_fee": False,
            }
        )

    return results


async def fetch_real_ohne_makler_listings(pages: int = 2) -> list[dict]:
    all_items: list[dict] = []
    seen: set[str] = set()
    async with httpx.AsyncClient(
        headers=HEADERS, follow_redirects=True, timeout=20.0
    ) as client:
        for page in range(1, pages + 1):
            url = (
                "https://www.ohne-makler.net/immobilien/wohnung-kaufen/"
                if page == 1
                else f"https://www.ohne-makler.net/immobilien/wohnung-kaufen/?page={page}"
            )
            resp = await client.get(url)
            if resp.status_code != 200:
                continue
            parsed = parse_ohne_makler_html(resp.text)
            for item in parsed:
                if item["external_id"] not in seen:
                    seen.add(item["external_id"])
                    all_items.append(item)
    return all_items
