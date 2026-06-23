"""
backend/main.py — AI-Driven Parking Hotspot Intelligence API

Lightweight FastAPI server that serves precomputed hotspot data.
Run with:
    uvicorn backend.main:app --reload

Environment variables:
    DATA_DIR   — path to the directory containing stations_index.json and
                 per-station JSON files (default: ./data/processed)
    PORT       — port to bind to (default: 8000, used by Uvicorn)
"""

import json
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.forecast import router as forecast_router
# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

default_data_dir = Path(__file__).parent / "data"
DATA_DIR = Path(os.getenv("DATA_DIR", default_data_dir))
STATIONS_INDEX_FILE = DATA_DIR / "stations_index.json"

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Parking Hotspot Intelligence API",
    description=(
        "Serves precomputed illegal-parking hotspot data per police station. "
        "Run preprocess.py first to generate the JSON files."
    ),
    version="1.0.0",
)

# CORS — allow the Vite dev server and any localhost origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
app.include_router(forecast_router, prefix="/forecast")
# In-process cache (loaded once at startup)
# ---------------------------------------------------------------------------

_stations_index: list[dict] | None = None
_stations_index_mtime: float = 0.0

def _get_stations_index() -> list[dict]:
    """Return the cached stations index, loading it from disk on first call."""
    global _stations_index, _stations_index_mtime
    
    if not STATIONS_INDEX_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "stations_index.json not found. "
                "Run: python preprocess.py --input <csv> --output data/processed"
            ),
        )
        
    current_mtime = os.path.getmtime(STATIONS_INDEX_FILE)
    
    if _stations_index is None or current_mtime > _stations_index_mtime:
        with STATIONS_INDEX_FILE.open(encoding="utf-8") as fh:
            _stations_index = json.load(fh)
        _stations_index_mtime = current_mtime
            
    return _stations_index


def _station_filename(station_name: str) -> str:
    """Derive the JSON filename for a station name (mirrors preprocess.py logic)."""
    return station_name.lower().replace(" ", "_") + ".json"


def _safe_filename(filename: str) -> bool:
    """Return True only if filename is a plain '<slug>.json' with no path traversal."""
    return bool(re.fullmatch(r"[a-z0-9_\-\.\(\)]+\.json", filename))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get(
    "/stations",
    summary="List all police stations",
    response_description="Array of station index entries (name, filename, bbox)",
)
async def list_stations() -> list[dict]:
    """Return the full stations index — name, derived filename, and bounding box.

    The bounding box is computed from the min/max lat/lon of all hotspots in
    that station's area, and is used by the frontend to auto-fit the map.

    Returns 503 if the preprocessor has not been run yet.
    """
    return _get_stations_index()


@app.get(
    "/hotspots/{station_name}",
    summary="Get hotspots for a police station",
    response_description="Array of hotspot records sorted by CIS descending",
)
def get_hotspots(station_name: str) -> list[dict[str, Any]]:
    """Return the precomputed hotspot list for *station_name*.

    The station name is matched case-insensitively against the stations index.
    On match, the corresponding JSON file is read from DATA_DIR and returned.

    Raises:
        404 — if no station with that name exists in the index.
        503 — if stations_index.json has not been generated yet.
    """
    index = _get_stations_index()

    # Find matching station (case-insensitive)
    matched: dict | None = None
    for entry in index:
        if entry["name"].lower() == station_name.lower():
            matched = entry
            break

    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"Station '{station_name}' not found. "
                   f"Use GET /stations to list available stations.",
        )

    filename = matched["filename"]

    # Safety: reject any filename that looks like a path traversal attempt
    if not _safe_filename(filename):
        raise HTTPException(status_code=500, detail="Malformed station filename in index.")

    hotspot_file = DATA_DIR / filename
    if not hotspot_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Hotspot file '{filename}' is missing. "
                   "Re-run the preprocessor to regenerate it.",
        )

    with hotspot_file.open(encoding="utf-8") as fh:
        return json.load(fh)


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    """Simple health-check endpoint."""
    return {"status": "ok", "data_dir": str(DATA_DIR)}
