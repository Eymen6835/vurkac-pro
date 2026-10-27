import asyncio
import redis.asyncio as redis
from calculator import RawListing, evaluate_listing
from ohne_makler_scraper import fetch_real_ohne_makler_listings

REDIS_URL = "redis://localhost:6379"


class DeltaScraperEngine:
    def __init__(self):
        self.redis = redis.from_url(REDIS_URL, decode_responses=True)

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

    async def fetch_newest_from_portal(self, portal_name: str = "Ohne-Makler") -> list[tuple[RawListing, float, float]]:
        items = await fetch_real_ohne_makler_listings(pages=2)
        results: list[tuple[RawListing, float, float]] = []
        for item in items:
            raw = RawListing(
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
            )
            results.append((raw, item["ref_sqm_price"], item["ref_sqm_rent"]))
        return results

    async def poll_loop(self):
        while True:
            try:
                listings = await self.fetch_newest_from_portal("Ohne-Makler")
                for raw, ref_sqm_price, ref_sqm_rent in reversed(listings):
                    if not await self.is_new_portal_id(raw.portal, raw.external_id):
                        continue
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
            except Exception as e:
                print(f"Fehler beim Ohne-Makler Live-Scraper: {e}")
            await asyncio.sleep(60)
