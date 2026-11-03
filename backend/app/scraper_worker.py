import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import httpx
import redis.asyncio as redis
from calculator import RawListing, EnrichedDeal, evaluate_listing
from ohne_makler_scraper import HEADERS, fetch_real_ohne_makler_listings, zip_to_state_and_coords
from mannheim_apify_agent import (
    ExtendedRawListing,
    REAL_PROPERTIES_PATH,
    fetch_immoscout_mobile_direct_fast,
    fetch_immowelt_direct_fast,
    fetch_kleinanzeigen_direct_fast,
    fetch_kleinanzeigen_true_creation_date,
    persist_new_deal_to_json,
)

REDIS_URL = "redis://localhost:6379"

FAST_DIRECT_POLL_INTERVAL_SECONDS = 15
APIFY_DELTA_POLL_INTERVAL_SECONDS = 15


class DeltaScraperEngine:
    def __init__(self):
        self.redis = redis.from_url(REDIS_URL, decode_responses=True)
        self.last_fast_scan_at: str | None = None
        self.last_apify_scan_at: str | None = None
        self.total_scans: int = 0
        self.new_deals_found: int = 0
        self._seeded: bool = False

    async def seed_seen_ids_from_disk(self) -> None:
        """Lädt bereits bekannte Inserats-IDs aus realProperties.json in Redis."""
        if self._seeded:
            return
        self._seeded = True
        try:
            if not REAL_PROPERTIES_PATH.exists():
                return
            with open(REAL_PROPERTIES_PATH, "r", encoding="utf-8") as f:
                items = json.load(f)
            for prop in items:
                for src in prop.get("sources") or []:
                    portal = src.get("portalName")
                    ext_id = str(src.get("externalId") or "")
                    if portal and ext_id:
                        await self.redis.sadd(f"seen_ids:{portal}", ext_id)
        except Exception as exc:
            print(f"[Seed Redis] Warnung: {exc}")

    async def is_new_portal_id(self, portal: str, external_id: str) -> bool:
        key = f"seen_ids:{portal}"
        is_new = await self.redis.sadd(key, external_id)
        return bool(is_new)

    async def check_cross_portal_duplicate(
        self, fingerprint: str, portal: str, url: str
    ) -> bool:
        fp_key = f"fingerprint:{fingerprint}"
        already_exists = await self.redis.exists(fp_key)
        await self.redis.hset(fp_key, portal, url)
        await self.redis.expire(fp_key, 60 * 60 * 24 * 30)
        return bool(already_exists)

    async def fetch_newest_from_ohne_makler(self) -> list[ExtendedRawListing]:
        items = await fetch_real_ohne_makler_listings(pages=1)
        results: list[ExtendedRawListing] = []
        for item in items:
            results.append(
                ExtendedRawListing(
                    portal="Ohne-Makler",
                    external_id=item["external_id"],
                    url=item["url"],
                    title=item["title"],
                    zip_code=item["zip_code"],
                    city=item["city"],
                    state_code=item["state_code"],
                    price=item["price"],
                    living_area=item["living_area"],
                    rooms=item["rooms"],
                    construction_year=1995,
                    has_broker_fee=False,
                    district=item.get("district", "Provisionsfrei"),
                    latitude=item.get("latitude", 49.4875),
                    longitude=item.get("longitude", 8.4660),
                    is_genuinely_new_today=True,
                )
            )
        return results

    async def process_incoming_listings(
        self, listings: list[ExtendedRawListing]
    ) -> list[EnrichedDeal]:
        await self.seed_seen_ids_from_disk()
        newly_published: list[EnrichedDeal] = []

        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=10.0) as client:
            for ext_raw in reversed(listings):
                if not await self.is_new_portal_id(ext_raw.portal, ext_raw.external_id):
                    continue

                # Bei Kleinanzeigen das echte Erstellungsdatum (#viewad-extra-info) vom Exposé prüfen,
                # damit hochgeschobene Alt-Inserate (z. B. vom 22.09.2026) nicht als Neuerscheinung zählen!
                if ext_raw.portal == "Kleinanzeigen" and ext_raw.url:
                    true_iso, is_today = await fetch_kleinanzeigen_true_creation_date(
                        client, ext_raw.url
                    )
                    ext_raw.listing_date = true_iso
                    ext_raw.is_genuinely_new_today = is_today and ext_raw.is_genuinely_new_today

                _, _, _, _, ref_sqm_price, ref_sqm_rent = zip_to_state_and_coords(ext_raw.zip_code)
                raw = RawListing(
                    portal=ext_raw.portal,
                    external_id=ext_raw.external_id,
                    url=ext_raw.url,
                    title=ext_raw.title,
                    zip_code=ext_raw.zip_code,
                    city=ext_raw.city,
                    state_code=ext_raw.state_code,
                    price=ext_raw.price,
                    living_area=ext_raw.living_area,
                    rooms=ext_raw.rooms,
                    construction_year=ext_raw.construction_year,
                    actual_rent_cold=ext_raw.actual_rent_cold,
                    has_broker_fee=ext_raw.has_broker_fee,
                    first_listed_at=ext_raw.listing_date,
                )
                deal = evaluate_listing(
                    raw,
                    avg_sqm_price_zip=ref_sqm_price,
                    avg_sqm_rent_zip=ref_sqm_rent,
                )
                if await self.check_cross_portal_duplicate(
                    deal.fingerprint, deal.portal, deal.url
                ):
                    continue

                persist_new_deal_to_json(ext_raw, deal)

                # Nur echte Neuerscheinungen von heute als Live-Deal pushen & alarmieren!
                if ext_raw.is_genuinely_new_today:
                    deal_json = deal.model_dump_json()
                    await self.redis.lpush("recent_deals", deal_json)
                    await self.redis.ltrim("recent_deals", 0, 199)
                    await self.redis.publish("live_deals_stream", deal_json)
                    newly_published.append(deal)
                    self.new_deals_found += 1

        return newly_published

    async def scan_all_portals_now(
        self, include_apify: bool = True, max_items_per_portal: int = 20
    ) -> dict[str, Any]:
        self.total_scans += 1
        now_iso = datetime.now(timezone.utc).isoformat()
        self.last_fast_scan_at = now_iso
        self.last_apify_scan_at = now_iso

        batches = await asyncio.gather(
            fetch_immoscout_mobile_direct_fast(),
            fetch_immowelt_direct_fast(),
            fetch_kleinanzeigen_direct_fast(),
            self.fetch_newest_from_ohne_makler(),
            return_exceptions=True,
        )
        combined: list[ExtendedRawListing] = []
        for batch in batches:
            if isinstance(batch, list):
                combined.extend(batch)

        new_deals = await self.process_incoming_listings(combined)
        return {
            "scanned_at": now_iso,
            "fetched_count": len(combined),
            "new_deals_count": len(new_deals),
            "new_deals": [d.model_dump() for d in new_deals],
        }

    async def poll_loop(self):
        await self.seed_seen_ids_from_disk()
        while True:
            try:
                await self.scan_all_portals_now(include_apify=True)
            except Exception as exc:
                print(f"[Maximum-Response Loop] Fehler: {exc}")
            await asyncio.sleep(FAST_DIRECT_POLL_INTERVAL_SECONDS)
