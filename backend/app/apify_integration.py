import os
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
import httpx
from calculator import RawListing

# Lade .env aus dem Projekt-Hauptverzeichnis
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")

# Empfohlene Immobilien-Scraper Actors aus dem Apify Store
PORTAL_ACTORS: dict[str, str] = {
    "ImmoScout24": os.getenv("APIFY_ACTOR_IMMOSCOUT", "memo23~immobilienscout24-scraper"),
    "Kleinanzeigen": os.getenv("APIFY_ACTOR_KLEINANZEIGEN", "clearpath~kleinanzeigen-immobilien-api-pro"),
    "Immowelt": os.getenv("APIFY_ACTOR_IMMOWELT", "memo23~immowelt-scraper"),
}


async def fetch_listings_via_apify(
    portal_name: str,
    search_url: str,
    max_items: int = 10,
    max_charge_usd: float = 0.25,
) -> list[RawListing]:
    """
    Ruft echte Immobilien-Inserate über die Apify v2 API ab (sobald APIFY_TOKEN gesetzt ist).
    Beachtet die Kostenbegrenzung via maxTotalChargeUsd gemäß https://apify.com/agents.md.
    """
    if not APIFY_TOKEN or portal_name not in PORTAL_ACTORS:
        return []

    actor_id = PORTAL_ACTORS[portal_name].replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            url,
            params={
                "maxTotalChargeUsd": str(max_charge_usd),
                "maxItems": str(max_items),
            },
            headers={
                "Authorization": f"Bearer {APIFY_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "startUrls": [{"url": search_url}],
                "maxItems": max_items,
            },
        )
        if resp.status_code not in (200, 201):
            return []

        items = resp.json()
        if not isinstance(items, list):
            return []

        return [_map_apify_item_to_raw_listing(portal_name, item) for item in items]


def _map_apify_item_to_raw_listing(portal_name: str, item: dict[str, Any]) -> RawListing:
    ext_id = str(item.get("id") or item.get("exposeId") or item.get("adId") or "")
    url = str(item.get("url") or item.get("link") or "")
    title = str(item.get("title") or "Immobilien-Inserat")
    zip_code = str(item.get("zipCode") or item.get("postalCode") or "68159")
    city = str(item.get("city") or "Mannheim")
    price = float(item.get("price") or item.get("purchasePrice") or 200000.0)
    living_area = float(item.get("livingSpace") or item.get("livingArea") or 65.0)
    rooms = float(item.get("numberOfRooms") or item.get("rooms") or 2.5)
    year = item.get("constructionYear") or item.get("yearBuilt") or 1980

    return RawListing(
        portal=portal_name,
        external_id=ext_id,
        url=url,
        title=title,
        zip_code=zip_code,
        city=city,
        state_code="BW",
        price=price,
        living_area=living_area,
        rooms=rooms,
        construction_year=int(year) if str(year).isdigit() else 1980,
        has_broker_fee=bool(item.get("hasCourtage", True)),
    )
