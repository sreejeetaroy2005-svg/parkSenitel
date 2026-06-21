"""
generate_seed_data.py — Synthetic hotspot seed data generator

Generates realistic synthetic hotspot JSON files for Chennai police stations
so the frontend and backend can be fully demonstrated without the raw CSV.

Usage:
    python generate_seed_data.py --output data/processed

Produces:
  - data/processed/stations_index.json
  - data/processed/<station_slug>.json  (one per station)
"""

import argparse
import json
import math
import os
import random
from pathlib import Path

random.seed(42)

# ---------------------------------------------------------------------------
# Realistic Chennai police station seeds
# (name, centre_lat, centre_lon)
# ---------------------------------------------------------------------------
STATIONS = [
    ("Anna Nagar",        13.0850, 80.2101),
    ("T. Nagar",          13.0418, 80.2341),
    ("Adyar",             13.0063, 80.2574),
    ("Velachery",         12.9815, 80.2180),
    ("Mylapore",          13.0368, 80.2676),
    ("Kodambakkam",       13.0524, 80.2295),
    ("Tambaram",          12.9249, 80.1000),
    ("Perambur",          13.1149, 80.2442),
    ("Royapettah",        13.0529, 80.2636),
    ("Aminjikarai",       13.0741, 80.2295),
    ("Sholinganallur",    12.9010, 80.2279),
    ("Avadi",             13.1149, 80.0979),
]

VIOLATION_TYPES = [
    "WRONG PARKING",
    "PARKING IN A MAIN ROAD",
    "NO PARKING ZONE",
    "OBSTRUCTION TO TRAFFIC",
    "DOUBLE PARKING",
    "PARKING NEAR ROAD CROSSING",
    "PARKING ON FOOTPATH",
    "PARKING NEAR JUNCTION",
]

SEVERITY_WEIGHTS = {
    "WRONG PARKING": 1.0,
    "PARKING IN A MAIN ROAD": 1.5,
    "NO PARKING ZONE": 1.5,
    "OBSTRUCTION TO TRAFFIC": 2.0,
    "DOUBLE PARKING": 1.8,
    "PARKING NEAR ROAD CROSSING": 1.6,
    "PARKING ON FOOTPATH": 1.2,
    "PARKING NEAR JUNCTION": 1.4,
}

SAMPLE_ADDRESSES = [
    "Near {} Signal, Main Road",
    "{} Bus Stop, Opposite Metro",
    "{} Market Lane",
    "{} Shopping Complex, GF",
    "Below {} Flyover",
    "{} Circle, 100 Feet Road",
    "Behind {} Hospital",
    "Entrance to {} Park",
]

JUNCTION_NAMES = [
    "No Junction",
    "{} Junction",
    "{} Signal",
    "{} Roundabout",
]

PEAK_HOURS = [
    "08:00–09:00 IST",
    "09:00–10:00 IST",
    "17:00–18:00 IST",
    "18:00–19:00 IST",
    "10:00–11:00 IST",
    "11:00–12:00 IST",
]


def haversine_offset(lat: float, lon: float, dx_m: float, dy_m: float):
    """Offset a lat/lon by dx_m metres east and dy_m metres north."""
    R = 6_371_000.0
    dlat = dy_m / R
    dlon = dx_m / (R * math.cos(math.radians(lat)))
    return lat + math.degrees(dlat), lon + math.degrees(dlon)


def make_hotspots(station_name: str, centre_lat: float, centre_lon: float, count: int) -> list:
    """Generate `count` synthetic hotspot records for one station."""
    hotspots = []
    prefix = station_name.split()[0]

    for i in range(count):
        # Scatter hotspots within ~1.5 km of centre
        dx = random.gauss(0, 600)
        dy = random.gauss(0, 600)
        lat, lon = haversine_offset(centre_lat, centre_lon, dx, dy)

        violation_count = random.randint(4, 180)
        num_vtype = random.randint(1, 3)
        vtype_pool = random.sample(VIOLATION_TYPES, num_vtype)
        type_counts = {vt: random.randint(1, violation_count // num_vtype + 1) for vt in vtype_pool}
        dominant = sorted(
            [{"type": k, "count": v} for k, v in type_counts.items()],
            key=lambda x: -x["count"]
        )[:3]

        # CIS computation mirrors preprocess.py
        all_types_flat = []
        for vt, cnt in type_counts.items():
            all_types_flat.extend([vt] * cnt)
        severity_mean = sum(SEVERITY_WEIGHTS.get(t, 1.0) for t in all_types_flat) / len(all_types_flat)

        has_junction = random.random() < 0.35
        junction_factor = 1.3 if has_junction else 1.0
        peak_fraction = random.uniform(0.1, 0.9)
        peak_hour_factor = 1.0 + peak_fraction * 0.5

        cis = round(violation_count * severity_mean * junction_factor * peak_hour_factor, 2)
        address_tmpl = random.choice(SAMPLE_ADDRESSES)
        sample_address = address_tmpl.format(prefix)

        hotspots.append({
            "h3_index": f"892ba{i:06x}bfffff",  # fake H3 index
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "violation_count": violation_count,
            "dominant_violation_types": dominant,
            "peak_hour_label": random.choice(PEAK_HOURS),
            "cis": cis,
            "cis_normalized": 0.0,   # filled in after min-max
            "junction_flag": has_junction,
            "sample_address": sample_address,
            "ai_cluster_validated": random.random() > 0.2, # 80% confirmed
            "ai_anomaly_score": round(random.uniform(-0.2, 0.1), 3),
            "ai_risk_flag": random.random() < 0.1, # 10% anomalies
        })

    # Normalize CIS within this station
    cis_values = [h["cis"] for h in hotspots]
    cis_min, cis_max = min(cis_values), max(cis_values)
    for h in hotspots:
        if cis_max == cis_min:
            h["cis_normalized"] = 100.0
        else:
            h["cis_normalized"] = round((h["cis"] - cis_min) / (cis_max - cis_min) * 100, 2)

    # Sort by CIS descending
    hotspots.sort(key=lambda h: h["cis"], reverse=True)
    return hotspots


def main():
    parser = argparse.ArgumentParser(
        description="Generate synthetic seed hotspot JSON for demo purposes."
    )
    parser.add_argument(
        "--output",
        default="data/processed",
        metavar="OUTPUT_DIR",
        help="Directory to write JSON files (default: data/processed)",
    )
    parser.add_argument(
        "--hotspots-per-station",
        type=int,
        default=30,
        metavar="N",
        help="Number of hotspot records per station (default: 30)",
    )
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    index_entries = []

    for name, centre_lat, centre_lon in STATIONS:
        n_hotspots = args.hotspots_per_station + random.randint(-10, 20)
        hotspots = make_hotspots(name, centre_lat, centre_lon, max(5, n_hotspots))

        filename = name.lower().replace(" ", "_") + ".json"
        out_path = out_dir / filename
        with out_path.open("w", encoding="utf-8") as fh:
            json.dump(hotspots, fh, indent=2, ensure_ascii=False)

        print(f"  Wrote {len(hotspots):3d} hotspots for '{name}' -> {filename}")

        lats = [h["latitude"] for h in hotspots]
        lons = [h["longitude"] for h in hotspots]
        index_entries.append({
            "name": name,
            "filename": filename,
            "bbox": {
                "min_lat": min(lats),
                "max_lat": max(lats),
                "min_lon": min(lons),
                "max_lon": max(lons),
            },
        })

    index_path = out_dir / "stations_index.json"
    with index_path.open("w", encoding="utf-8") as fh:
        json.dump(index_entries, fh, indent=2, ensure_ascii=False)

    print(f"\nOK: stations_index.json written with {len(index_entries)} stations.")
    print(f"OK: Seed data ready in: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
