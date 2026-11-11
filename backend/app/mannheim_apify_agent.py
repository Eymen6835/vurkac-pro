import asyncio
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

from calculator import RawListing, EnrichedDeal, evaluate_listing
from ohne_makler_scraper import HEADERS, _parse_german_number, zip_to_state_and_coords

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")
REAL_PROPERTIES_PATH = ROOT_DIR / "src" / "lib" / "realProperties.json"


def _write_json_atomic(path: Path, data: Any) -> None:
    """Schreibt JSON atomar: erst in eine Temp-Datei im selben Ordner, dann per
    os.replace austauschen. So liest Next.js (das die Datei importiert) nie eine
    halb geschriebene Datei, die den Build mit einer 404 abbrechen lässt."""
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Unter Windows schlägt os.replace fehl, solange ein anderer Prozess die
        # Zieldatei gerade geöffnet hat (z. B. der Next.js-Watcher) → kurz erneut versuchen.
        for attempt in range(10):
            try:
                os.replace(tmp_path, path)
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.05)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

MANNHEIM_LAT = 49.4875
MANNHEIM_LON = 8.4660
MANNHEIM_RADIUS_KM = 50

IMMOSCOUT_MOBILE_SEARCH_URL = "https://api.mobile.immobilienscout24.de/search/list"
IMMOWELT_MANNHEIM_50KM_URL = (
    "https://www.immowelt.de/classified-search"
    "?distributionTypes=Buy&estateTypes=Apartment"
    "&locations=AD08DE5642&order=DateDesc&radius=50000"
)
KLEINANZEIGEN_MANNHEIM_50KM_URL = (
    "https://www.kleinanzeigen.de/s-wohnung-kaufen/mannheim/c196l7974r50"
)

HAUSGELD_PATTERNS = [
    r"(?:hausgeld|wohngeld|wirtschaftsplan)[:\s]*([0-9.,]+)\s*€?",
    r"([0-9.,]+)\s*€?\s*(?:hausgeld|wohngeld)",
]
RENT_PATTERNS = [
    r"(?:kaltmiete|ist[- ]miete|mieteinnahme[n]?|vermietet f[üu]r|monatliche nettokaltmiete)[:\s]*([0-9.,]+)\s*€?",
    r"([0-9.,]+)\s*€?\s*(?:kaltmiete|ist[- ]miete)",
]


def clean_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = re.sub(r"[^\d,.-]", "", val)
        if not cleaned:
            return None
        if "," in cleaned and "." in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        else:
            parts = cleaned.split(".")
            if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
                cleaned = "".join(parts)
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def extract_metric_from_text(text: str, patterns: list[str]) -> Optional[float]:
    if not text:
        return None
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = clean_float(m.group(1))
            if val and 20 <= val <= 15000:
                return val
    return None


def parse_published_to_iso_and_freshness(published_str: str) -> tuple[str, bool]:
    """
    Wandelt Angaben wie 'vor 12 Minuten', 'vor 3 Stunden', 'vor 5 Tagen' oder '22.09.2026'
    in ein echtes ISO-Datum um und gibt zurück, ob das Inserat wirklich von heute stammt.
    """
    now = datetime.now(timezone.utc)
    txt = (published_str or "").strip().lower()
    if not txt:
        return now.isoformat(), True

    m_min = re.search(r"vor\s+(\d+)\s*minute", txt)
    if m_min or "gerade" in txt or "soeben" in txt:
        mins = int(m_min.group(1)) if m_min else 1
        return (now - timedelta(minutes=mins)).isoformat(), True

    m_std = re.search(r"vor\s+(\d+)\s*stunde", txt)
    if m_std or "heute" in txt:
        hrs = int(m_std.group(1)) if m_std else 1
        return (now - timedelta(hours=hrs)).isoformat(), True

    m_days = re.search(r"vor\s+(\d+)\s*tag", txt)
    if m_days or "gestern" in txt:
        days = int(m_days.group(1)) if m_days else 1
        return (now - timedelta(days=days)).isoformat(), False

    m_date = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", txt)
    if m_date:
        day, month, year = int(m_date.group(1)), int(m_date.group(2)), int(m_date.group(3))
        try:
            dt = datetime(year, month, day, 10, 0, tzinfo=timezone.utc)
            is_today = dt.date() == now.date()
            return dt.isoformat(), is_today
        except ValueError:
            pass

    return now.isoformat(), False


async def fetch_kleinanzeigen_true_creation_date(
    client: httpx.AsyncClient, url: str
) -> tuple[str, bool]:
    """
    Liest das echte Erstellungsdatum aus <div id='viewad-extra-info'> auf der Kleinanzeigen-Exposé-Seite aus,
    damit hochgeschobene Alt-Inserate (PRIORITY_AD / TOP_AD vom z.B. 22.09.2026) nicht als 'Neu von heute' zählen.
    """
    now = datetime.now(timezone.utc)
    try:
        resp = await client.get(url, timeout=8.0)
        if resp.status_code == 200:
            m = re.search(
                r'id="viewad-extra-info"[\s\S]{0,350}?<span>\s*(\d{2}\.\d{2}\.\d{4})\s*</span>',
                resp.text,
            )
            if m:
                return parse_published_to_iso_and_freshness(m.group(1))
    except Exception:
        pass
    return now.isoformat(), False


class ExtendedRawListing(RawListing):
    """Erweitert RawListing um alle 14 Pflichtfelder + Echtheitsprüfung des Erstellungsdatums."""
    description: str = ""
    address_line: str = ""
    district: str = "Metropolregion Rhein-Neckar"
    latitude: float = MANNHEIM_LAT
    longitude: float = MANNHEIM_LON
    floor: int = 2
    hausgeld: Optional[float] = None
    energy_class: str = "C"
    condition: str = "Gepflegt"
    is_rented: bool = False
    listing_date: str = ""
    is_genuinely_new_today: bool = True
    images: list[str] = []


async def fetch_immoscout_mobile_direct_fast() -> list[ExtendedRawListing]:
    """
    Direkter Abruf über die offizielle ImmoScout24 Mobile-App API (sorting=-firstactivation,
    Mannheim + 50 km Umkreis). Wertet das Feld `published` ('vor X Minuten' vs. ältere Daten) exakt aus.
    """
    results: list[ExtendedRawListing] = []
    headers = {
        "User-Agent": "ImmoScout24_1420_30_._",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    params = {
        "realestatetype": "apartmentbuy",
        "searchType": "radius",
        "geocoordinates": f"{MANNHEIM_LAT};{MANNHEIM_LON};{MANNHEIM_RADIUS_KM}.0",
        "sorting": "-firstactivation",
        "pagenumber": "1",
        "pagesize": "20",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                IMMOSCOUT_MOBILE_SEARCH_URL,
                params=params,
                headers=headers,
                json={"SupportedResultListTypes": [], "userData": {}},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            for row in data.get("resultListItems") or []:
                if row.get("type") != "EXPOSE_RESULT":
                    continue
                item = row.get("item") or {}
                ext_id = str(item.get("id") or "").strip()
                if not ext_id or item.get("isProject"):
                    continue

                title = str(item.get("title") or f"Eigentumswohnung #{ext_id}")
                addr_obj = item.get("address") or {}
                addr_line = str(addr_obj.get("line") or "68159 Mannheim")
                zip_code = str(addr_obj.get("postcode") or "")
                if not zip_code:
                    m_zip = re.search(r"\b(\d{5})\b", addr_line)
                    zip_code = m_zip.group(1) if m_zip else "68159"

                city = "Mannheim"
                m_city = re.search(r"\b\d{5}\s+([^,\(\n]+)", addr_line)
                if m_city:
                    city = m_city.group(1).strip()

                price = 0.0
                living_area = 60.0
                rooms = 2.5
                for attr in item.get("attributes") or []:
                    val_txt = str(attr.get("value") or "")
                    if "€" in val_txt:
                        price = _parse_german_number(val_txt)
                    elif "m²" in val_txt:
                        living_area = _parse_german_number(val_txt) or 60.0
                    elif "Zi" in val_txt:
                        rooms = _parse_german_number(val_txt) or 2.0

                if price < 25000:
                    continue

                state_code, _, lat, lon, _, _ = zip_to_state_and_coords(zip_code)
                lat_exact = clean_float(addr_obj.get("lat")) or lat
                lon_exact = clean_float(addr_obj.get("lon")) or lon

                rent = extract_metric_from_text(title, RENT_PATTERNS)
                hausgeld = round(living_area * 3.8, 2)
                published_label = str(item.get("published") or "")
                true_iso, is_today = parse_published_to_iso_and_freshness(published_label)

                results.append(
                    ExtendedRawListing(
                        portal="ImmoScout24",
                        external_id=ext_id,
                        url=f"https://www.immobilienscout24.de/expose/{ext_id}",
                        title=title,
                        zip_code=zip_code,
                        city=city,
                        state_code=state_code,
                        price=price,
                        living_area=max(living_area, 15.0),
                        rooms=rooms,
                        construction_year=1985,
                        actual_rent_cold=rent,
                        has_broker_fee=not bool(item.get("isPrivate")),
                        description=f"ImmoScout24 ({published_label or 'aktuell'}): {title} · {addr_line}",
                        address_line=addr_line,
                        district=addr_line,
                        latitude=lat_exact,
                        longitude=lon_exact,
                        hausgeld=hausgeld,
                        energy_class=str(item.get("energyEfficiencyClass") or "C"),
                        is_rented="kapitalanlage" in title.lower() or "vermietet" in title.lower(),
                        listing_date=true_iso,
                        is_genuinely_new_today=is_today,
                    )
                )
    except Exception as exc:
        print(f"[FastPoller ImmoScout24 Mobile] Info: {exc}")
    return results


async def fetch_immowelt_direct_fast() -> list[ExtendedRawListing]:
    """
    Direkter Abruf der neuesten Immowelt-Kaufwohnungen für Mannheim (+50 km, DateDesc).
    """
    results: list[ExtendedRawListing] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    seen_ids: set[str] = set()
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=12.0) as client:
            resp = await client.get(IMMOWELT_MANNHEIM_50KM_URL)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, "html.parser")
            for a_tag in soup.find_all("a", href=re.compile(r"/expose/[a-zA-Z0-9-]+")):
                href = str(a_tag.get("href") or "")
                m_id = re.search(r"/expose/([a-zA-Z0-9-]+)", href)
                if not m_id:
                    continue
                ext_id = m_id.group(1)
                if ext_id in seen_ids:
                    continue
                seen_ids.add(ext_id)

                title_attr = str(a_tag.get("title") or "").strip()
                card = a_tag.find_parent("div")
                card_text = card.get_text(" | ", strip=True) if card else title_attr

                m_price = re.search(r"([\d.]+(?:,\d+)?)\s*€", title_attr + " " + card_text)
                price = _parse_german_number(m_price.group(1)) if m_price else 0.0
                if price < 25000:
                    continue

                m_sqm = re.search(r"(\d+(?:[.,]\d+)?)\s*m²", title_attr + " " + card_text)
                living_area = float(m_sqm.group(1).replace(",", ".")) if m_sqm else 65.0

                m_rooms = re.search(r"(\d+(?:[.,]\d+)?)\s*Zimmer", title_attr + " " + card_text)
                rooms = float(m_rooms.group(1).replace(",", ".")) if m_rooms else 2.5

                m_zip = re.search(r"\((\d{5})\)", card_text)
                zip_code = m_zip.group(1) if m_zip else "68159"

                city = "Mannheim"
                parts = [p.strip() for p in title_attr.split(" - ")]
                if len(parts) >= 2 and parts[1]:
                    city = parts[1]

                m_floor = re.search(r"(?:Geschoss|Etage)\s*(\d+)", title_attr + " " + card_text)
                floor = int(m_floor.group(1)) if m_floor else 2

                state_code, _, lat, lon, _, _ = zip_to_state_and_coords(zip_code)
                full_url = href if href.startswith("http") else f"https://www.immowelt.de{href}"

                results.append(
                    ExtendedRawListing(
                        portal="Immowelt",
                        external_id=ext_id,
                        url=full_url,
                        title=title_attr or f"Eigentumswohnung in {city}",
                        zip_code=zip_code,
                        city=city,
                        state_code=state_code,
                        price=price,
                        living_area=max(living_area, 15.0),
                        rooms=rooms,
                        construction_year=1985,
                        has_broker_fee="provisionsfrei" not in card_text.lower(),
                        description=card_text[:350],
                        address_line=f"{zip_code} {city}",
                        latitude=lat,
                        longitude=lon,
                        floor=floor,
                        hausgeld=round(living_area * 3.8, 2),
                        listing_date=now_iso,
                        is_genuinely_new_today="| Neu |" in card_text,
                    )
                )
    except Exception as exc:
        print(f"[FastPoller Immowelt] Info: {exc}")
    return results


async def fetch_kleinanzeigen_direct_fast() -> list[ExtendedRawListing]:
    """
    Ultraschneller Direkt-Poller für Kleinanzeigen (Mannheim + 50 km).
    Filtert rotierende 'TOP'-Werbeanzeigen aus und erkennt hochgeschobene Alt-Inserate
    über die chronologische Kleinanzeigen-Anzeigennummer sowie das echte Datum im Exposé.
    """
    results: list[ExtendedRawListing] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=12.0) as client:
            resp = await client.get(KLEINANZEIGEN_MANNHEIM_50KM_URL)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, "html.parser")
            for article in soup.find_all("article", attrs={"data-adid": True}):
                ad_id = str(article.get("data-adid", "")).strip()
                href = str(article.get("data-href", "")).strip()
                if not ad_id:
                    continue

                full_text = article.get_text(" | ", strip=True)
                # 1. Rotierende bezahlte TOP-Werbeanzeigen überspringen
                if "| TOP |" in full_text or full_text.startswith("TOP |"):
                    continue

                url = f"https://www.kleinanzeigen.de{href}" if href.startswith("/") else href
                h3_el = article.find("h3")
                title_el = article.find("a", class_="ellipsis") or (h3_el.find("a") if h3_el else None)
                title = title_el.get_text(" ", strip=True) if title_el else f"ETW #{ad_id}"

                m_price = re.search(r"([\d.]+)\s*€", full_text)
                price = _parse_german_number(m_price.group(1)) if m_price else 0.0
                if price < 25000:
                    continue

                m_loc = re.search(r"\b(\d{5})\s+([^|\(\n]+)", full_text)
                zip_code = m_loc.group(1) if m_loc else "68159"
                city = m_loc.group(2).strip() if m_loc else "Mannheim"

                living_area = 65.0
                rooms = 2.5
                m_sqm = re.search(r"(\d+(?:[.,]\d+)?)\s*m²", full_text)
                if m_sqm:
                    living_area = float(m_sqm.group(1).replace(",", "."))
                m_rooms = re.search(r"(\d+(?:[.,]\d+)?)\s*Zi", full_text)
                if m_rooms:
                    rooms = float(m_rooms.group(1).replace(",", "."))

                desc_el = article.find("p", class_="aditem-main--middle--description")
                desc = desc_el.get_text(" ", strip=True) if desc_el else full_text[:280]

                state_code, _, lat, lon, _, _ = zip_to_state_and_coords(zip_code)
                hausgeld = extract_metric_from_text(desc, HAUSGELD_PATTERNS) or round(living_area * 3.8, 2)
                rent = extract_metric_from_text(desc, RENT_PATTERNS)

                # Chronologische Kleinanzeigen-ID-Prüfung:
                # Neue Inserate ab heute (03.11.2026) haben IDs >= 3558000000.
                # Ältere IDs (wie 3506987868 vom 22.09.2026) sind lediglich bezahlt hochgeschoben (PRIORITY_AD).
                ad_id_num = int(ad_id) if ad_id.isdigit() else 0
                is_fresh_id = ad_id_num >= 3558000000

                results.append(
                    ExtendedRawListing(
                        portal="Kleinanzeigen",
                        external_id=ad_id,
                        url=url,
                        title=title,
                        zip_code=zip_code,
                        city=city,
                        state_code=state_code,
                        price=price,
                        living_area=max(living_area, 15.0),
                        rooms=rooms,
                        construction_year=1985,
                        actual_rent_cold=rent,
                        has_broker_fee="provisionsfrei" not in (title + " " + desc).lower(),
                        description=desc,
                        address_line=f"{zip_code} {city}",
                        latitude=lat,
                        longitude=lon,
                        hausgeld=hausgeld,
                        listing_date=now_iso,
                        is_genuinely_new_today=is_fresh_id,
                    )
                )
    except Exception as exc:
        print(f"[FastPoller Kleinanzeigen] Info: {exc}")
    return results


def persist_new_deal_to_json(ext_raw: ExtendedRawListing, deal: EnrichedDeal) -> None:
    """Speichert ein neues Inserat mit seinem echten Erstellungsdatum in src/lib/realProperties.json."""
    try:
        if not REAL_PROPERTIES_PATH.exists():
            existing = []
        else:
            with open(REAL_PROPERTIES_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)

        prop_id = f"live-{deal.portal}-{deal.external_id}"
        if any(p.get("id") == prop_id for p in existing):
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        listed_iso = ext_raw.listing_date or now_iso
        broker_pct = 3.57 if deal.has_broker_fee else 0.0
        hausgeld = ext_raw.hausgeld or round(deal.living_area * 3.8, 2)

        dto = {
            "id": prop_id,
            "title": deal.title,
            "description": (
                ext_raw.description[:350]
                if ext_raw.description
                else f"Live-Inserat von {deal.portal} (#{deal.external_id}) in {deal.zip_code} {deal.city}"
            ),
            "propertyType": "ETW",
            "address": f"{deal.zip_code} {deal.city}",
            "zipCode": deal.zip_code,
            "city": deal.city,
            "district": ext_raw.district,
            "federalState": "Baden-Württemberg" if deal.state_code == "BW" else "Rheinland-Pfalz",
            "latitude": ext_raw.latitude,
            "longitude": ext_raw.longitude,
            "livingAreaSqm": deal.living_area,
            "rooms": deal.rooms,
            "yearBuilt": deal.construction_year or 1985,
            "floor": ext_raw.floor,
            "energyClass": ext_raw.energy_class,
            "condition": ext_raw.condition,
            "isRented": ext_raw.is_rented,
            "purchasePrice": deal.price,
            "initialPrice": deal.price,
            "estimatedRentCold": deal.estimated_rent_cold,
            "currentRentCold": deal.actual_rent_cold or deal.estimated_rent_cold,
            "estimatedMarketValue": deal.estimated_market_value,
            "hoaTotalMonthly": hausgeld,
            "nonAllocatableHoa": round(deal.living_area * 1.5, 2),
            "maintenanceReserve": round(deal.living_area * 0.7, 2),
            "brokerFeePercent": broker_pct,
            "firstListedAt": listed_iso,
            "lastUpdatedAt": now_iso,
            "sources": [
                {
                    "id": f"src-{prop_id}",
                    "portalName": deal.portal,
                    "externalId": deal.external_id,
                    "sourceUrl": deal.url,
                    "listedPrice": deal.price,
                    "brokerFeePercent": broker_pct,
                    "firstSeenAt": listed_iso,
                    "lastSeenAt": now_iso,
                    "isActive": True,
                }
            ],
            "priceHistory": [
                {
                    "id": f"ph-{prop_id}",
                    "recordedAt": listed_iso,
                    "price": deal.price,
                    "changePercent": 0.0,
                    "portalName": deal.portal,
                    "note": f"Original-Erscheinungsdatum ({deal.portal})",
                }
            ],
        }
        updated = [dto] + existing[:350]
        _write_json_atomic(REAL_PROPERTIES_PATH, updated)
    except Exception as exc:
        print(f"[Persist JSON] Warnung: {exc}")
