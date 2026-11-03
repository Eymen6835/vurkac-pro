import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis

from scraper_worker import (
    APIFY_DELTA_POLL_INTERVAL_SECONDS,
    FAST_DIRECT_POLL_INTERVAL_SECONDS,
    DeltaScraperEngine,
    REDIS_URL,
)
from calculator import EnrichedDeal, evaluate_listing
from notifier import send_telegram_alert
from apify_integration import fetch_listings_via_apify, APIFY_TOKEN


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, data: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(data)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()
scraper = DeltaScraperEngine()


async def redis_pubsub_listener():
    r = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("live_deals_stream")
    async for message in pubsub.listen():
        if message["type"] == "message":
            deal_json = message["data"]
            await manager.broadcast_json(deal_json)
            deal = EnrichedDeal(**json.loads(deal_json))
            # Maximum-Response: Jedes neue Inserat löst sofort einen Push-Alert aus (nicht nur >=6% Rendite)
            asyncio.create_task(send_telegram_alert(deal))


@asynccontextmanager
async def lifespan(app: FastAPI):
    scraper_task = asyncio.create_task(scraper.poll_loop())
    listener_task = asyncio.create_task(redis_pubsub_listener())
    yield
    scraper_task.cancel()
    listener_task.cancel()


app = FastAPI(title="VurKac Pro Maximum-Response Realtime Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/deals/recent")
async def get_recent_deals():
    r = redis.from_url(REDIS_URL, decode_responses=True)
    raw_list = await r.lrange("recent_deals", 0, 199)
    return [json.loads(item) for item in raw_list]


@app.get("/api/apify/status")
async def get_apify_status():
    return {
        "configured": bool(APIFY_TOKEN),
        "ready": bool(APIFY_TOKEN),
    }


@app.get("/api/mannheim/status")
async def get_mannheim_engine_status():
    return {
        "mode": "MAXIMUM_RESPONSE",
        "region": "Mannheim (+50 km Umkreis)",
        "portals": ["ImmoScout24", "Immowelt", "Kleinanzeigen", "Ohne-Makler"],
        "fast_direct_interval_sec": FAST_DIRECT_POLL_INTERVAL_SECONDS,
        "apify_delta_interval_sec": APIFY_DELTA_POLL_INTERVAL_SECONDS,
        "notify_all_new_listings": True,
        "last_fast_scan_at": scraper.last_fast_scan_at,
        "last_apify_scan_at": scraper.last_apify_scan_at,
        "total_scans": scraper.total_scans,
        "new_deals_found": scraper.new_deals_found,
        "ws_clients": len(manager.active_connections),
    }


@app.post("/api/mannheim/scan-now")
async def trigger_mannheim_scan_now(include_apify: bool = True, max_items: int = 10):
    """
    Triggert sofort einen parallelen Maximum-Response Live-Scan über alle Portale
    (ImmoScout24, Immowelt, Kleinanzeigen & Ohne-Makler) rund um Mannheim (+50 km).
    """
    result = await scraper.scan_all_portals_now(
        include_apify=include_apify,
        max_items_per_portal=max_items,
    )
    return result


@app.post("/api/apify/scrape")
async def trigger_apify_scrape(
    portal: str = "Kleinanzeigen", search_url: str = "", max_items: int = 5
):
    listings = await fetch_listings_via_apify(portal, search_url, max_items=max_items)
    r = redis.from_url(REDIS_URL, decode_responses=True)
    pushed = []
    for raw in listings:
        deal = evaluate_listing(raw)
        deal_json = deal.model_dump_json()
        await r.lpush("recent_deals", deal_json)
        await r.ltrim("recent_deals", 0, 199)
        await r.publish("live_deals_stream", deal_json)
        pushed.append(deal.model_dump())
    return {"count": len(pushed), "deals": pushed}


@app.websocket("/ws/live-deals")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
