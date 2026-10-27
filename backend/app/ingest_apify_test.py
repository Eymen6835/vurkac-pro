import json
import re
from datetime import datetime, timezone
import os

def clean_float(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = re.sub(r"[^\d,.-]", "", val).replace(".", "").replace(",", ".")
        try:
            return float(cleaned)
        except:
            return None
    return None

def extract_metric(text, patterns):
    if not text:
        return None
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val_str = m.group(1).replace(".", "").replace(",", ".")
            try:
                return float(val_str)
            except:
                pass
    return None

hausgeld_patterns = [
    r'(?:hausgeld|wohngeld|wirtschaftsplan)[:\s]*([0-9.,]+)\s*€?',
    r'([0-9.,]+)\s*€?\s*(?:hausgeld|wohngeld)',
]
rent_patterns = [
    r'(?:kaltmiete|ist[- ]miete|mieteinnahme[n]?|vermietet f[üu]r|monatliche nettokaltmiete)[:\s]*([0-9.,]+)\s*€?',
    r'([0-9.,]+)\s*€?\s*(?:kaltmiete|ist[- ]miete)',
]

now_iso = datetime.now(timezone.utc).isoformat()

# 1. Load ImmoScout24
with open(r'C:\Users\Eymen\.gemini\antigravity\brain\caab5652-0e45-4b16-934f-f35efe8b6eaa\.system_generated\steps\327\output.txt', 'r', encoding='utf-8') as f:
    is24_raw = json.loads(f.readline()).get('items', [])

# 2. Load Immowelt
with open(r'C:\Users\Eymen\.gemini\antigravity\brain\caab5652-0e45-4b16-934f-f35efe8b6eaa\.system_generated\steps\328\output.txt', 'r', encoding='utf-8') as f:
    iw_raw = json.loads(f.readline()).get('items', [])

# 3. Load Kleinanzeigen
with open(r'C:\Users\Eymen\.gemini\antigravity\brain\caab5652-0e45-4b16-934f-f35efe8b6eaa\.system_generated\steps\329\output.txt', 'r', encoding='utf-8') as f:
    ka_raw = json.loads(f.readline()).get('items', [])

normalized_items = []
seen_fingerprints = set()

# Process ImmoScout24
for item in is24_raw:
    norm = item.get('normalized', {})
    ext_id = str(norm.get('listingId') or item.get('header', {}).get('id') or '')
    title = norm.get('title') or item.get('header', {}).get('title') or "Eigentumswohnung in der Metropolregion Rhein-Neckar"
    url = norm.get('url') or item.get('url') or f"https://www.immobilienscout24.de/expose/{ext_id}"
    price = clean_float(norm.get('price', {}).get('amount')) or clean_float(item.get('adTargetingParameters', {}).get('obj_purchasePrice')) or 0.0
    living_area = clean_float(norm.get('area', {}).get('livingSpace')) or clean_float(item.get('adTargetingParameters', {}).get('obj_livingSpace')) or 50.0
    rooms = clean_float(norm.get('rooms', {}).get('total')) or clean_float(item.get('adTargetingParameters', {}).get('obj_noRooms')) or 2.0
    
    addr = norm.get('address', {})
    city = addr.get('city') or item.get('adTargetingParameters', {}).get('obj_regio2') or "Mannheim"
    zip_code = addr.get('zip') or item.get('adTargetingParameters', {}).get('obj_zipCode') or "68161"
    lat = clean_float(addr.get('latitude')) or 49.4875
    lon = clean_float(addr.get('longitude')) or 8.4660
    
    desc = norm.get('description') or ""
    norm_fc = norm.get('financeCosts') or {}
    hausgeld = clean_float(norm_fc.get('hausgeld')) or extract_metric(desc, hausgeld_patterns) or round(living_area * 3.8, 2)
    rent = extract_metric(desc, rent_patterns) or round(living_area * 12.50, 2)
    
    year_built = clean_float(norm.get('construction', {}).get('yearBuilt')) or clean_float(item.get('adTargetingParameters', {}).get('obj_yearConstructed')) or 1985
    floor = clean_float(norm.get('floor', {}).get('current')) or clean_float(item.get('adTargetingParameters', {}).get('obj_floor')) or 2
    
    # Images
    images = norm.get('images', []) or []
    image_url = images[0] if (images and isinstance(images[0], str)) else (norm.get('media', [{}])[0].get('url') if norm.get('media') else "")
    
    fp = f"{zip_code}_{int(round(living_area))}_{int(round(price, -3))}"
    if fp in seen_fingerprints:
        continue
    seen_fingerprints.add(fp)

    normalized_items.append({
        "id": f"live-ImmoScout24-{ext_id}",
        "title": title,
        "description": desc[:300] if desc else f"ImmoScout24 Inserat #{ext_id} in {zip_code} {city}",
        "propertyType": "ETW",
        "address": f"{zip_code} {city}",
        "zipCode": zip_code,
        "city": city,
        "district": addr.get('region') or "Metropolregion Rhein-Neckar",
        "federalState": "Baden-Württemberg" if str(zip_code).startswith("68") or str(zip_code).startswith("69") else "Rheinland-Pfalz",
        "latitude": lat,
        "longitude": lon,
        "livingAreaSqm": living_area,
        "rooms": rooms,
        "yearBuilt": int(year_built),
        "floor": int(floor),
        "energyClass": norm.get('construction', {}).get('energyClass') or "C",
        "condition": "Gepflegt",
        "isRented": item.get('adTargetingParameters', {}).get('obj_rented') == 'y',
        "purchasePrice": price,
        "initialPrice": price,
        "estimatedRentCold": rent,
        "currentRentCold": rent,
        "estimatedMarketValue": round(living_area * 3200, 2),
        "hoaTotalMonthly": hausgeld,
        "nonAllocatableHoa": round(living_area * 1.5, 2),
        "maintenanceReserve": round(living_area * 0.7, 2),
        "brokerFeePercent": 3.57,
        "firstListedAt": norm.get('publishedAt') or now_iso,
        "lastUpdatedAt": now_iso,
        "sources": [{
            "id": f"src-is24-{ext_id}",
            "portalName": "ImmoScout24",
            "externalId": ext_id,
            "sourceUrl": url,
            "listedPrice": price,
            "brokerFeePercent": 3.57,
            "firstSeenAt": now_iso,
            "lastSeenAt": now_iso,
            "isActive": True
        }],
        "priceHistory": [{
            "id": f"ph-is24-{ext_id}",
            "recordedAt": now_iso,
            "price": price,
            "changePercent": 0.0,
            "portalName": "ImmoScout24",
            "note": "Live von ImmoScout24 (Mannheim +50km) geladen"
        }]
    })

# Process Immowelt
for item in iw_raw:
    ext_id = str(item.get('listingId') or item.get('onlineId') or '')
    title = item.get('title') or "Eigentumswohnung in der Metropolregion Rhein-Neckar"
    url = item.get('url') or f"https://www.immowelt.de/expose/{ext_id}"
    price = clean_float(item.get('price')) or 0.0
    living_area = clean_float(item.get('livingAreaSqm')) or 50.0
    rooms = clean_float(item.get('roomsMin')) or 2.0
    
    city = item.get('city') or "Mannheim"
    zip_code = str(item.get('postalCode') or "68161")
    lat = clean_float(item.get('latitude')) or 49.4875
    lon = clean_float(item.get('longitude')) or 8.4660
    
    desc = item.get('description') or ""
    
    # Check priceDetails for Hausgeld
    hausgeld = None
    for pd in item.get('priceDetails', []) or []:
        if 'hausgeld' in str(pd.get('label', '')).lower():
            hausgeld = clean_float(pd.get('value'))
    if not hausgeld:
        hausgeld = extract_metric(desc, hausgeld_patterns) or round(living_area * 3.8, 2)
        
    rent = extract_metric(desc, rent_patterns) or round(living_area * 12.50, 2)
    year_built = clean_float(item.get('constructionYear')) or 1985
    floor = clean_float(item.get('floorNumber')) or 2
    
    fp = f"{zip_code}_{int(round(living_area))}_{int(round(price, -3))}"
    if fp in seen_fingerprints:
        continue
    seen_fingerprints.add(fp)

    normalized_items.append({
        "id": f"live-Immowelt-{ext_id}",
        "title": title,
        "description": desc[:300] if desc else f"Immowelt Inserat #{ext_id} in {zip_code} {city}",
        "propertyType": "ETW",
        "address": f"{zip_code} {city}",
        "zipCode": zip_code,
        "city": city,
        "district": item.get('district') or "Metropolregion Rhein-Neckar",
        "federalState": "Baden-Württemberg" if str(zip_code).startswith("68") or str(zip_code).startswith("69") else "Rheinland-Pfalz",
        "latitude": lat,
        "longitude": lon,
        "livingAreaSqm": living_area,
        "rooms": rooms,
        "yearBuilt": int(year_built),
        "floor": int(floor),
        "energyClass": item.get('energyClass') or "C",
        "condition": item.get('condition') or "Gepflegt",
        "isRented": True if 'rented' in desc.lower() or 'vermietet' in desc.lower() else False,
        "purchasePrice": price,
        "initialPrice": price,
        "estimatedRentCold": rent,
        "currentRentCold": rent,
        "estimatedMarketValue": round(living_area * 3200, 2),
        "hoaTotalMonthly": hausgeld,
        "nonAllocatableHoa": round(living_area * 1.5, 2),
        "maintenanceReserve": round(living_area * 0.7, 2),
        "brokerFeePercent": 3.57,
        "firstListedAt": item.get('firstSeenAt') or now_iso,
        "lastUpdatedAt": now_iso,
        "sources": [{
            "id": f"src-iw-{ext_id}",
            "portalName": "Immowelt",
            "externalId": ext_id,
            "sourceUrl": url,
            "listedPrice": price,
            "brokerFeePercent": 3.57,
            "firstSeenAt": now_iso,
            "lastSeenAt": now_iso,
            "isActive": True
        }],
        "priceHistory": [{
            "id": f"ph-iw-{ext_id}",
            "recordedAt": now_iso,
            "price": price,
            "changePercent": 0.0,
            "portalName": "Immowelt",
            "note": "Live von Immowelt (Mannheim +50km) geladen"
        }]
    })

# Process Kleinanzeigen
for item in ka_raw:
    ext_id = str(item.get('expose_id') or '')
    title = item.get('title') or "Eigentumswohnung in der Metropolregion Rhein-Neckar"
    url = item.get('listing_url') or f"https://www.kleinanzeigen.de/s-anzeige/{ext_id}"
    price = clean_float(item.get('purchase_price')) or 0.0
    living_area = clean_float(item.get('size')) or 50.0
    rooms = clean_float(item.get('rooms')) or 2.0
    
    city = item.get('city') or "Mannheim"
    zip_code = str(item.get('zip_code') or "68161")
    lat = clean_float(item.get('location_lat')) or 49.4875
    lon = clean_float(item.get('location_lng')) or 8.4660
    
    desc = item.get('description') or ""
    hausgeld = clean_float(item.get('maintenance_fees')) or extract_metric(desc, hausgeld_patterns) or round(living_area * 3.8, 2)
    rent = extract_metric(desc, rent_patterns) or round(living_area * 12.50, 2)
    year_built = clean_float(item.get('year_constructed')) or 1985
    floor = clean_float(item.get('floor')) or 2
    
    fp = f"{zip_code}_{int(round(living_area))}_{int(round(price, -3))}"
    if fp in seen_fingerprints:
        continue
    seen_fingerprints.add(fp)

    normalized_items.append({
        "id": f"live-Kleinanzeigen-{ext_id}",
        "title": title,
        "description": desc[:300] if desc else f"Kleinanzeigen Inserat #{ext_id} in {zip_code} {city}",
        "propertyType": "ETW",
        "address": f"{zip_code} {city}",
        "zipCode": zip_code,
        "city": city,
        "district": item.get('state') or "Metropolregion Rhein-Neckar",
        "federalState": "Baden-Württemberg" if str(zip_code).startswith("68") or str(zip_code).startswith("69") else "Rheinland-Pfalz",
        "latitude": lat,
        "longitude": lon,
        "livingAreaSqm": living_area,
        "rooms": rooms,
        "yearBuilt": int(year_built),
        "floor": int(floor),
        "energyClass": "C",
        "condition": "Gepflegt",
        "isRented": True if 'rented' in desc.lower() or 'vermietet' in desc.lower() else False,
        "purchasePrice": price,
        "initialPrice": price,
        "estimatedRentCold": rent,
        "currentRentCold": rent,
        "estimatedMarketValue": round(living_area * 3200, 2),
        "hoaTotalMonthly": hausgeld,
        "nonAllocatableHoa": round(living_area * 1.5, 2),
        "maintenanceReserve": round(living_area * 0.7, 2),
        "brokerFeePercent": 3.57 if item.get('seller_type') == 'COMMERCIAL' else 0.0,
        "firstListedAt": item.get('online_since') or now_iso,
        "lastUpdatedAt": now_iso,
        "sources": [{
            "id": f"src-ka-{ext_id}",
            "portalName": "Kleinanzeigen",
            "externalId": ext_id,
            "sourceUrl": url,
            "listedPrice": price,
            "brokerFeePercent": 3.57 if item.get('seller_type') == 'COMMERCIAL' else 0.0,
            "firstSeenAt": now_iso,
            "lastSeenAt": now_iso,
            "isActive": True
        }],
        "priceHistory": [{
            "id": f"ph-ka-{ext_id}",
            "recordedAt": now_iso,
            "price": price,
            "changePercent": 0.0,
            "portalName": "Kleinanzeigen",
            "note": "Live von Kleinanzeigen (Mannheim +50km) geladen"
        }]
    })

print(f"Total newly normalized items: {len(normalized_items)}")

# Load existing properties
real_props_path = r'C:\Users\Eymen\.gemini\antigravity\scratch\immo-metrica-mvp\src\lib\realProperties.json'
with open(real_props_path, 'r', encoding='utf-8') as f:
    existing = json.load(f)

# Combine: new Mannheim items first, then existing
combined = normalized_items + existing

# Save combined
with open(real_props_path, 'w', encoding='utf-8') as f:
    json.dump(combined, f, ensure_ascii=False, indent=2)

print(f"Successfully saved {len(combined)} properties to {real_props_path}!")
