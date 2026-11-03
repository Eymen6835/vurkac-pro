import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import redis.asyncio as redis
from calculator import RawListing, EnrichedDeal, evaluate_listing
from ohne_makler_scraper import fetch_real_ohne_makler_listings, zip_to_state_and_coords
from mannheim_apify_agent import (
    ExtendedRawListing,
    REAL_PROPERTIES_PATH,
    fetch_kleinanzeigen_direct_fast,
    fetch_mannheim_multi_portal_apify,
    persist_new_deal_to_json,
)

REDIS_URL = "redis://localhost:6379"

# Intervalle für Maximum-Response
FAST_DIRECT_POLL_INTERVAL_SECONDS = 20
APIFY_DELTA_POLL_INTERVAL_SECONDS = 180


class DeltaScraperEngine:
    def __init__(self):
        self.redis = redis.from_url(REDIS_URL, decode_responses=True)
        self.last_fast_scan_at: str | None = None
        self.last_apify_scan_at: str | None = None
        self.total_scans: int = 0
        self.new_deals_found: int = 0
        self._seeded: bool = False

    async def seed_seen_ids_from_disk(self) -> None:
        """Lädt bereits bekannte Inserats-IDs aus realProperties.json in Redis, damit nur echte Neuerscheinungen alarmieren."""
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
                # Falls recent_deals in Redis noch leer ist, mit den neuesten 40 Deals vorbefüllen
            curr_len = await self.redis.llen("recent_deals")
            if curr_len == 0 and items:
                for prop in reversed(items[:40]):
                    srcs = prop.get("sources") or [{}]
                    portal = srcs[0].get("portalName") or "ImmoScout24"
                    ext_id = str(srcs[0].get("externalId") or prop.get("id") or "")
                    url = str(srcs[0].get("sourceUrl") or "")
                    raw = RawListing(
                        portal=portal,
                        external_id=ext_id,
                        url=url,
                        title=str(prop.get("title") or "Eigentumswohnung"),
                        zip_code=str(prop.get("zipCode") or "68159"),
                        city=str(prop.get("city") or "Mannheim"),
                        state_code="BW" if "Baden" in str(prop.get("federalState", "BW")) else "RP",
                        price=float(prop.get("purchasePrice") or 200000),
                        living_area=float(prop.get("livingAreaSqm") or 65),
                        rooms=float(prop.get("rooms") or 2.5),
                        construction_year=int(prop.get("yearBuilt") or 1985),
                        actual_rent_cold=float(prop.get("currentRentCold") or 0) or None,
                        has_broker_fee=float(prop.get("brokerFeePercent") or 0) > 0,
                    )
                    deal = evaluate_listing(raw)
                    await self.redis.lpush("recent_deals", deal.model_dump_json())
                await self.redis.ltrim("recent_deals", 0, 199)
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
                )
            )
        return results

    async def process_incoming_listings(
        self, listings: list[ExtendedRawListing]
    ) -> list[EnrichedDeal]:
        await self.seed_seen_ids_from_disk()
        newly_published: list[EnrichedDeal] = []

        for ext_raw in reversed(listings):
            if not await self.is_new_portal_id(ext_raw.portal, ext_raw.external_id):
                continue

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

            deal_json = deal.model_dump_json()
            await self.redis.lpush("recent_deals", deal_json)
            await self.redis.ltrim("recent_deals", 0, 199)
            await self.redis.publish("live_deals_stream", deal_json)
            persist_new_deal_to_json(ext_raw, deal)
            newly_published.append(deal)
            self.new_deals_found += 1

        return newly_published

    async def scan_all_portals_now(
        self, include_apify: bool = True, max_items_per_portal: int = 10
    ) -> dict[str, Any]:
        """
        Führt sofort einen parallelen Maximum-Response-Scan über alle Portale aus:
        - Ohne-Makler (Direkt)
        - Kleinanzeigen Mannheim +50km (Direkt)
        - Optional: ImmoScout24 + Immowelt + Kleinanzeigen via Apify Delta-Engine
        """
        self.total_scans += 1
        now_iso = datetime.now(timezone.utc).isoformat()
        self.last_fast_scan_at = now_iso

        tasks: list[Any] = [
            self.fetch_newest_from_ohne_makler(),
            fetch_kleinanzeigen_direct_fast(),
        ]
        if include_apify:
            self.last_apify_scan_at = now_iso
            tasks.append(
                fetch_mannheim_multi_portal_apify(
                    max_items_per_portal=max_items_per_portal,
                    use_monitoring_mode=True,
                )
            )

        batches = await asyncio.gather(*tasks, return_exceptions=True)
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

    async def fast_direct_poll_loop(self):
        """Pollt alle 20 Sekunden direkt ohne Container-Overhead."""
        await self.seed_seen_ids_from_disk()
        while True:
            try:
                await self.scan_all_portals_now(include_apify=False)
            except Exception as exc:
                print(f"[Fast Direct Loop] Fehler: {exc}")
            await asyncio.sleep(FAST_DIRECT_POLL_INTERVAL_SECONDS)

    async def apify_delta_poll_loop(self):
        """Pollt ImmoScout24, Immowelt & Kleinanzeigen im Delta/Monitoring-Modus."""
        await asyncio.sleep(5)
        while True:
            try:
                await self.scan_all_portals_now(include_apify=True, max_items_per_portal=10)
            except Exception as exc:
                print(f"[Apify Delta Loop] Fehler: {exc}")
            await asyncio.sleep(APIFY_DELTA_POLL_INTERVAL_SECONDS)

    async def poll_loop(self):
        await asyncio.gather(
            self.fast_direct_poll_loop(),
            self.apify_delta_poll_loop(),
        )
