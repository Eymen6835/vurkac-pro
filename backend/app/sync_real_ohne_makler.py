import asyncio
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from ohne_makler_scraper import fetch_real_ohne_makler_listings

DB_PATH = Path(__file__).resolve().parents[2] / "prisma" / "dev.db"


async def sync_db():
    items = await fetch_real_ohne_makler_listings(pages=2)
    print(f"Scraped {len(items)} echte Inserate von ohne-makler.net")
    if not items:
        return

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    # Entferne alle erfundenen/Mock-Inserate restlos
    cur.execute("DELETE FROM price_history;")
    cur.execute("DELETE FROM property_sources;")
    cur.execute("DELETE FROM properties;")

    for item in items:
        prop_id = f"live-Ohne-Makler-{item['external_id']}"
        living_area = float(item["living_area"])
        price = float(item["price"])
        est_rent = round(living_area * float(item["ref_sqm_rent"]), 2)
        est_mv = round(living_area * float(item["ref_sqm_price"]), 0)
        non_alloc = round(living_area * 1.5, 2)
        maint = round(est_rent * 0.05, 2)
        hoa_total = round(non_alloc + maint + living_area * 2.0, 2)

        cur.execute(
            """
            INSERT INTO properties (
                id, title, description, property_type, address, zip_code, city,
                district, federal_state, latitude, longitude, living_area_sqm,
                rooms, year_built, floor, energy_class, condition, is_rented,
                purchase_price, initial_price, estimated_rent_cold, current_rent_cold,
                estimated_market_value, hoa_total_monthly, non_allocatable_hoa,
                maintenance_reserve, broker_fee_percent, first_listed_at, last_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prop_id,
                item["title"],
                f"Provisionsfreies Original-Inserat von Ohne-Makler.net (#{item['external_id']}) in {item['zip_code']} {item['city']}.",
                "ETW",
                f"{item['zip_code']} {item['city']}",
                item["zip_code"],
                item["city"],
                item["district"],
                item["federal_state"],
                item["latitude"],
                item["longitude"],
                living_area,
                float(item["rooms"]),
                1995,
                2,
                item["energy_class"],
                "Gepflegt",
                1,
                price,
                price,
                est_rent,
                est_rent,
                est_mv,
                hoa_total,
                non_alloc,
                maint,
                0.0,
                now_iso,
                now_iso,
            ),
        )

        cur.execute(
            """
            INSERT INTO property_sources (
                id, property_id, portal_name, external_id, source_url,
                listed_price, broker_fee_percent, first_seen_at, last_seen_at, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"src-{prop_id}",
                prop_id,
                "Ohne-Makler",
                item["external_id"],
                item["url"],
                price,
                0.0,
                now_iso,
                now_iso,
                1,
            ),
        )

        cur.execute(
            """
            INSERT INTO price_history (
                id, property_id, recorded_at, price, change_percent, portal_name, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"ph-{prop_id}",
                prop_id,
                now_iso,
                price,
                0.0,
                "Ohne-Makler",
                "Original-Inserat von ohne-makler.net geladen",
            ),
        )

    conn.commit()
    conn.close()
    print(f"Erfolgreich {len(items)} echte Ohne-Makler-Inserate in SQLite gespeichert.")


if __name__ == "__main__":
    asyncio.run(sync_db())
