import os
from pathlib import Path
import httpx
from dotenv import load_dotenv
from calculator import EnrichedDeal

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")


async def send_telegram_alert(deal: EnrichedDeal):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return

    headline = (
        f"🚨 *NEUER TOP-DEAL ({deal.portal})*"
        if deal.is_top_deal
        else f"⚡ *NEUES INSERAT ({deal.portal} · Maximum-Response)*"
    )

    text = (
        f"{headline}\n\n"
        f"📍 *{deal.zip_code} {deal.city}* – {deal.title}\n"
        f"💰 *Kaufpreis:* {deal.price:,.0f} € ({deal.price_per_sqm:,.0f} €/m²)\n"
        f"📊 *Marktwert-Spread:* `{deal.market_spread_pct:+.1f} %` unter Markt\n"
        f"📈 *Bruttorendite:* `{deal.gross_yield_pct:.2f} %`\n"
        f"💵 *Cashflow (n. St.):* `{deal.monthly_cashflow_after_tax:+.0f} €/Monat`\n"
        f"🏠 *Eckdaten:* {deal.living_area} m² | {deal.rooms} Zi. | Bj. {deal.construction_year}\n\n"
        f"👉 [Sofort zum Original-Inserat öffnen]({deal.url})"
    )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                url,
                json={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "text": text,
                    "parse_mode": "Markdown",
                    "disable_web_page_preview": False,
                },
            )
    except Exception as exc:
        print(f"[Telegram Alert] Warnung: {exc}")
