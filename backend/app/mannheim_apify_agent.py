import asyncio
import json
import os
import re
from datetime import datetime, timezone
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

# Mannheim Zentrum Koordinaten + 50 km Umkreis
MANNHEIM_LAT = 49.4875
MANNHEIM_LON = 8.4660
MANNHEIM_RADIUS_KM = 50

IMMOSCOUT_MANNHEIM_50KM_URL = (
    "https://www.immobilienscout24.de/Suche/radius/wohnung-kaufen"
    "?centerofsearchaddress=Mannheim;;;;;;"
    "&geocoordinates=49.4875;8.466;50.0"
    "&sorting=2"
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


class ExtendedRawListing(RawListing):
    """Erweitert RawListing um alle 14 Pflichtfelder für Mannheim."""
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
    images: list[str] = []


async def fetch_kleinanzeigen_direct_fast() -> list[ExtendedRawListing]:
    """
    Ultraschneller Direkt-Poller für Kleinanzeigen (Mannheim + 50 km, Eigentumswohnungen, neueste zuerst).
    Antwortzeit < 1.5s, 0 $ Kosten, erkennt neue Inserate sofort ohne Apify Cold-Start.
    """
    results: list[ExtendedRawListing] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=12.0) as client:
            resp = await client.get(KLEINANZEIGEN_MANNHEIM_50KM_URL)
            if resp.status_code != 200:
                return []
            soup = BeautifulSoup(resp.text, "html.parser")
            for article in soup.find_all("article", class_="aditem"):
                ad_id = str(article.get("data-adid", "")).strip()
                href = str(article.get("data-href", "")).strip()
                if not ad_id:
                    continue
                url = f"https://www.kleinanzeigen.de{href}" if href.startswith("/") else href
                title_el = article.find("a", class_="ellipsis")
                title = title_el.get_text(" ", strip=True) if title_el else f"ETW #{ad_id}"

                price_el = article.find("p", class_=lambda c: c and "aditem-main--middle--price-shipping--price" in c)
                price = _parse_german_number(price_el.get_text(" ", strip=True)) if price_el else 0.0
                if price < 25000:
                    continue

                loc_el = article.find("div", class_="aditem-main--top--left")
                loc_text = loc_el.get_text(" ", strip=True) if loc_el else "68159 Mannheim"
                m_loc = re.search(r"(\d{5})\s+(.+)", loc_text)
                zip_code = m_loc.group(1) if m_loc else "68159"
                city = m_loc.group(2).strip() if m_loc else "Mannheim"

                # Wohnfläche & Zimmer aus Tags
                living_area = 65.0
                rooms = 2.5
                tags_el = article.find("p", class_="aditem-main--middle--tags")
                tags_text = tags_el.get_text(" ", strip=True) if tags_el else ""
                m_sqm = re.search(r"(\d+(?:[.,]\d+)?)\s*m²", tags_text)
                if m_sqm:
                    living_area = float(m_sqm.group(1).replace(",", "."))
                m_rooms = re.search(r"(\d+(?:[.,]\d+)?)\s*Zi", tags_text)
                if m_rooms:
                    rooms = float(m_rooms.group(1).replace(",", "."))

                desc_el = article.find("p", class_="aditem-main--middle--description")
                desc = desc_el.get_text(" ", strip=True) if desc_el else ""

                state_code, _, lat, lon, _, _ = zip_to_state_and_coords(zip_code)
                hausgeld = extract_metric_from_text(desc, HAUSGELD_PATTERNS) or round(living_area * 3.8, 2)
                rent = extract_metric_from_text(desc, RENT_PATTERNS)

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
                    )
                )
    except Exception as exc:
        print(f"[FastPoller Kleinanzeigen] Info: {exc}")
    return results


async def run_apify_actor_delta(
    actor_slug: str,
    input_payload: dict[str, Any],
    max_charge_usd: float = 0.06,
    timeout_secs: int = 45,
) -> list[dict[str, Any]]:
    """
    Startet einen der 3 verifizierten Apify Actors synchron über die Apify v2 API
    und gibt die Dataset-Items zurück.
    """
    if not APIFY_TOKEN:
        return []

    actor_id = actor_slug.replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    params = {
        "maxTotalChargeUsd": str(max_charge_usd),
        "timeout": str(timeout_secs),
        "clean": "true",
    }
    headers = {
        "Authorization": f"Bearer {APIFY_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout_secs + 15.0) as client:
            resp = await client.post(url, params=params, headers=headers, json=input_payload)
            if resp.status_code in (200, 201):
                data = resp.json()
                if isinstance(data, list):
                    return data
    except Exception as exc:
        print(f"[Apify {actor_slug}] Fehler: {exc}")
    return []


def normalize_immoscout_item(item: dict[str, Any]) -> Optional[ExtendedRawListing]:
    norm = item.get("normalized") or {}
    if not norm and item.get("status") in ("removed", "price_changed"):
        return None
    ext_id = str(norm.get("listingId") or (item.get("header") or {}).get("id") or "")
    if not ext_id:
        return None

    ad_params = item.get("adTargetingParameters") or {}
    price = (
        clean_float((norm.get("price") or {}).get("amount"))
        or clean_float(ad_params.get("obj_purchasePrice"))
        or 0.0
    )
    if price < 20000:
        return None

    living_area = (
        clean_float((norm.get("area") or {}).get("livingSpace"))
        or clean_float(ad_params.get("obj_livingSpace"))
        or 55.0
    )
    rooms = (
        clean_float((norm.get("rooms") or {}).get("total"))
        or clean_float(ad_params.get("obj_noRooms"))
        or 2.0
    )
    addr = norm.get("address") or {}
    city = str(addr.get("city") or ad_params.get("obj_regio2") or "Mannheim")
    zip_code = str(addr.get("zip") or ad_params.get("obj_zipCode") or "68161")
    lat = clean_float(addr.get("latitude")) or MANNHEIM_LAT
    lon = clean_float(addr.get("longitude")) or MANNHEIM_LON

    desc = str(norm.get("description") or "")
    norm_fc = norm.get("financeCosts") or {}
    hausgeld = (
        clean_float(norm_fc.get("hausgeld"))
        or extract_metric_from_text(desc, HAUSGELD_PATTERNS)
        or round(living_area * 3.8, 2)
    )
    rent = extract_metric_from_text(desc, RENT_PATTERNS)
    year_built = (
        clean_float((norm.get("construction") or {}).get("yearBuilt"))
        or clean_float(ad_params.get("obj_yearConstructed"))
        or 1985
    )
    floor = (
        clean_float((norm.get("floor") or {}).get("current"))
        or clean_float(ad_params.get("obj_floor"))
        or 2
    )
    is_private = bool((item.get("basicInfo") or {}).get("isPrivate")) or ad_params.get("obj_courtage") == "n"
    state_code = "BW" if zip_code.startswith(("68", "69", "76", "75")) else "RP"
    images = [img for img in (norm.get("images") or []) if isinstance(img, str)]

    return ExtendedRawListing(
        portal="ImmoScout24",
        external_id=ext_id,
        url=str(norm.get("url") or item.get("url") or f"https://www.immobilienscout24.de/expose/{ext_id}"),
        title=str(norm.get("title") or (item.get("header") or {}).get("title") or f"ETW in {city}"),
        zip_code=zip_code,
        city=city,
        state_code=state_code,
        price=price,
        living_area=max(living_area, 15.0),
        rooms=rooms,
        construction_year=int(year_built),
        actual_rent_cold=rent,
        has_broker_fee=not is_private,
        description=desc,
        address_line=f"{zip_code} {city}",
        district=str(addr.get("region") or "Metropolregion Rhein-Neckar"),
        latitude=lat,
        longitude=lon,
        floor=int(floor),
        hausgeld=hausgeld,
        is_rented=ad_params.get("obj_rented") == "y",
        listing_date=str(norm.get("publishedAt") or datetime.now(timezone.utc).isoformat()),
        images=images[:5],
    )


def normalize_immowelt_item(item: dict[str, Any]) -> Optional[ExtendedRawListing]:
    ext_id = str(item.get("listingId") or item.get("onlineId") or "")
    if not ext_id:
        return None
    price = clean_float(item.get("price")) or 0.0
    if price < 20000:
        return None
    living_area = clean_float(item.get("livingAreaSqm")) or 55.0
    rooms = clean_float(item.get("roomsMin")) or 2.0
    city = str(item.get("city") or "Mannheim")
    zip_code = str(item.get("postalCode") or "68161")
    lat = clean_float(item.get("latitude")) or MANNHEIM_LAT
    lon = clean_float(item.get("longitude")) or MANNHEIM_LON
    desc = str(item.get("description") or "")

    hausgeld = clean_float(item.get("serviceCharge"))
    if not hausgeld:
        for pd in item.get("priceDetails") or []:
            if "hausgeld" in str(pd.get("label", "")).lower():
                hausgeld = clean_float(pd.get("value"))
                break
    if not hausgeld:
        hausgeld = extract_metric_from_text(desc, HAUSGELD_PATTERNS) or round(living_area * 3.8, 2)

    rent = clean_float(item.get("baseRent")) or extract_metric_from_text(desc, RENT_PATTERNS)
    year_built = clean_float(item.get("constructionYear")) or 1985
    floor = clean_float(item.get("floorNumber")) or 2
    state_code = "BW" if zip_code.startswith(("68", "69", "76", "75")) else "RP"
    pics = [str(p.get("url")) for p in (item.get("pictures") or []) if isinstance(p, dict) and p.get("url")]

    return ExtendedRawListing(
        portal="Immowelt",
        external_id=ext_id,
        url=str(item.get("url") or f"https://www.immowelt.de/expose/{ext_id}"),
        title=str(item.get("title") or f"ETW in {city}"),
        zip_code=zip_code,
        city=city,
        state_code=state_code,
        price=price,
        living_area=max(living_area, 15.0),
        rooms=rooms,
        construction_year=int(year_built),
        actual_rent_cold=rent,
        has_broker_fee=not bool(item.get("isCommissionFree") or item.get("isPrivateOwner")),
        description=desc,
        address_line=f"{zip_code} {city}",
        district=str(item.get("district") or "Metropolregion Rhein-Neckar"),
        latitude=lat,
        longitude=lon,
        floor=int(floor),
        hausgeld=hausgeld,
        energy_class=str(item.get("energyClass") or "C"),
        condition=str(item.get("condition") or "Gepflegt"),
        is_rented="vermietet" in desc.lower(),
        listing_date=str(item.get("firstSeenAt") or datetime.now(timezone.utc).isoformat()),
        images=pics[:5],
    )


def normalize_kleinanzeigen_item(item: dict[str, Any]) -> Optional[ExtendedRawListing]:
    ext_id = str(item.get("expose_id") or "")
    if not ext_id:
        return None
    price = clean_float(item.get("purchase_price")) or 0.0
    if price < 20000:
        return None
    living_area = clean_float(item.get("size")) or 55.0
    rooms = clean_float(item.get("rooms")) or 2.0
    city = str(item.get("city") or "Mannheim")
    zip_code = str(item.get("zip_code") or "68161")
    lat = clean_float(item.get("location_lat")) or MANNHEIM_LAT
    lon = clean_float(item.get("location_lng")) or MANNHEIM_LON
    desc = str(item.get("description") or "")

    hausgeld = (
        clean_float(item.get("maintenance_fees"))
        or extract_metric_from_text(desc, HAUSGELD_PATTERNS)
        or round(living_area * 3.8, 2)
    )
    rent = clean_float(item.get("rent_cold")) or extract_metric_from_text(desc, RENT_PATTERNS)
    year_built = clean_float(item.get("year_constructed")) or 1985
    floor = clean_float(item.get("floor")) or 2
    state_code = "BW" if zip_code.startswith(("68", "69", "76", "75")) else "RP"
    pics = [
        str(p.get("full_url") or p.get("web_url"))
        for p in (item.get("pictures") or [])
        if isinstance(p, dict) and (p.get("full_url") or p.get("web_url"))
    ]

    return ExtendedRawListing(
        portal="Kleinanzeigen",
        external_id=ext_id,
        url=str(item.get("listing_url") or f"https://www.kleinanzeigen.de/s-anzeige/{ext_id}"),
        title=str(item.get("title") or f"ETW in {city}"),
        zip_code=zip_code,
        city=city,
        state_code=state_code,
        price=price,
        living_area=max(living_area, 15.0),
        rooms=rooms,
        construction_year=int(year_built),
        actual_rent_cold=rent,
        has_broker_fee=item.get("seller_type") == "COMMERCIAL",
        description=desc,
        address_line=f"{zip_code} {city}",
        district=str(item.get("state") or "Metropolregion Rhein-Neckar"),
        latitude=lat,
        longitude=lon,
        floor=int(floor),
        hausgeld=hausgeld,
        is_rented="vermietet" in desc.lower(),
        listing_date=str(item.get("online_since") or datetime.now(timezone.utc).isoformat()),
        images=pics[:5],
    )


async def fetch_mannheim_multi_portal_apify(
    max_items_per_portal: int = 10,
    use_monitoring_mode: bool = True,
) -> list[ExtendedRawListing]:
    """
    Fragt alle 3 Gewinner-Actors für Mannheim (+50 km) parallel ab:
    1. memo23/immobilienscout24-scraper (Mobile-API, sorting=2, monitoringMode)
    2. blackfalcondata/immowelt-scraper (sort=newest, incrementalMode)
    3. clearpath/kleinanzeigen-immobilien-api-pro (sorting=newest, monitorMode)
    """
    is24_task = run_apify_actor_delta(
        "memo23/immobilienscout24-scraper",
        {
            "startUrls": [IMMOSCOUT_MANNHEIM_50KM_URL],
            "maxItems": max_items_per_portal,
            "monitoringMode": use_monitoring_mode,
            "excludeNewBuildProjects": True,
            "excludeSections": True,
            "excludeZipCodeShapes": True,
            "allowApproximateCoords": True,
            "geocodeAddresses": True,
        },
        max_charge_usd=0.05,
    )
    iw_task = run_apify_actor_delta(
        "blackfalcondata/immowelt-scraper",
        {
            "query": "Mannheim",
            "radiusKm": MANNHEIM_RADIUS_KM,
            "distributionType": "buy",
            "estateType": "apartment",
            "newBuildProjects": "exclude",
            "sort": "newest",
            "maxResults": max_items_per_portal,
            "includeDetails": True,
            "incrementalMode": use_monitoring_mode,
        },
        max_charge_usd=0.04,
    )
    ka_task = run_apify_actor_delta(
        "clearpath/kleinanzeigen-immobilien-api-pro",
        {
            "location": "Mannheim",
            "radius": MANNHEIM_RADIUS_KM,
            "categories": ["eigentumswohnungen"],
            "posterType": "ALL",
            "sorting": "newest",
            "maxResults": max_items_per_portal,
            "monitorMode": use_monitoring_mode,
        },
        max_charge_usd=0.04,
    )

    is24_raw, iw_raw, ka_raw = await asyncio.gather(is24_task, iw_task, ka_task)

    results: list[ExtendedRawListing] = []
    for item in is24_raw:
        parsed = normalize_immoscout_item(item)
        if parsed:
            results.append(parsed)
    for item in iw_raw:
        parsed = normalize_immowelt_item(item)
        if parsed:
            results.append(parsed)
    for item in ka_raw:
        parsed = normalize_kleinanzeigen_item(item)
        if parsed:
            results.append(parsed)

    return results


def persist_new_deal_to_json(ext_raw: ExtendedRawListing, deal: EnrichedDeal) -> None:
    """Speichert ein neues Inserat direkt am Anfang von src/lib/realProperties.json."""
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
            "firstListedAt": ext_raw.listing_date or now_iso,
            "lastUpdatedAt": now_iso,
            "sources": [
                {
                    "id": f"src-{prop_id}",
                    "portalName": deal.portal,
                    "externalId": deal.external_id,
                    "sourceUrl": deal.url,
                    "listedPrice": deal.price,
                    "brokerFeePercent": broker_pct,
                    "firstSeenAt": now_iso,
                    "lastSeenAt": now_iso,
                    "isActive": True,
                }
            ],
            "priceHistory": [
                {
                    "id": f"ph-{prop_id}",
                    "recordedAt": now_iso,
                    "price": deal.price,
                    "changePercent": 0.0,
                    "portalName": deal.portal,
                    "note": f"Echtzeit-Import ({deal.portal} Maximum-Response)",
                }
            ],
        }
        updated = [dto] + existing[:299]
        with open(REAL_PROPERTIES_PATH, "w", encoding="utf-8") as f:
            json.dump(updated, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        print(f"[Persist JSON] Warnung: {exc}")
