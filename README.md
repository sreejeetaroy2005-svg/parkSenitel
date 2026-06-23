# 🛡️ ParkSentinel — AI-Driven Parking Hotspot Intelligence

An enforcement decision-support system for Bengaluru Traffic Police — where violations cluster, how severe they truly are, and which hotspots demand immediate attention.

`Python` `React` `FastAPI` `scikit-learn` `H3` `Bengaluru Traffic Police`

---

ParkSentinel turns raw parking violation records across **68 police stations** in Bengaluru into a calibrated, per-station enforcement priority map. It is a decision-support triage tool — not an auto-enforcement system — every hotspot ranking is built for an officer to review and act on.

It answers the commander's morning question — *"where do we send patrols today?"* — with a transparent, auditable score rather than a black-box heatmap.

---

## Why it's different

Most tools rank yesterday's worst streets by raw count. ParkSentinel pairs a deterministic severity model with unsupervised ML validation, and is honest about what each layer can and cannot claim:

🗺️ **H3 Hexagonal Clustering** — violations are aggregated into uniform spatial cells (resolution 9), eliminating GPS drift noise and arbitrary street-boundary bias.

📊 **Congestion Impact Score (CIS)** — a transparent, multi-factor score that weights volume, violation severity, junction proximity, and peak-hour timing — then normalises both per-station and city-wide.

🤖 **DBSCAN Spatial Validation** — independently confirms whether a high-CIS cell reflects genuine geographic density, or is just scattered noise that happened to land inside a hexagon.

🚨 **IsolationForest Anomaly Detection** — catches low-volume but extreme-severity hotspots (e.g. a consistently blocked emergency lane) that the volume-weighted CIS would otherwise bury.

✅ **Provenance-safe pipeline** — pre-computed JSON artifacts, hot-reload caching, and path-traversal-safe serving ensure every recommendation is reproducible and auditable.

---

## The Congestion Impact Score — what it measures

The CIS is the primary ranking metric. It is fully deterministic and computed from four factors:

| Factor | What it captures |
|---|---|
| **Violation Volume** | Raw count of violations in the H3 cell |
| **Severity Multiplier** | High-impact types (BLOCKING EMERGENCY ACCESS, OBSTRUCTION TO TRAFFIC) weight heavier than standard violations |
| **Junction Proximity Factor** | Violations near mapped intersections receive a 30% uplift — cascading traffic effects are real |
| **Peak Hour Factor** | A dynamic multiplier applied when a significant share of violations fall in the station's historically busiest windows |

CIS scores are min-max normalised on both a **per-station (0–100)** and **global (0–100)** scale, giving commanders both local triage and city-wide perspective in one view.

---

## The ML validation layer — what it adds

The CIS alone can be fooled. Two unsupervised models independently validate it:

### DBSCAN Spatial Validation
The H3 grid is an arbitrary geometric overlay — a high-volume cell might be scattered noise that happened to fall inside a hexagon boundary. DBSCAN dynamically calculates its search radius from the spatial spread of each station (handling both dense city centres and sparse suburbs) and independently confirms whether a hotspot represents actual geographic density. Cells that fail this check are flagged as **unconfirmed**.

### IsolationForest Anomaly Detection
The CIS formula is weighted by volume, which can overshadow emerging high-severity events. IsolationForest evaluates the holistic profile of each hotspot — severity, junction presence, peak-hour fraction — against peers within the same police station. For stations with fewer than 8 hotspots, it gracefully falls back to a standard-deviation threshold. Hotspots that punch above their weight receive an `ai_risk_flag`, surfacing emerging pressure before it becomes a crisis.

---

## How it works — one pipeline, three stages

```
police_violations.csv  (Bengaluru BTP · 68 stations)
        │
   ┌────▼───────────┐   ┌─────────────────────┐   ┌───────────────────┐
   │   PREPROCESS   │──▶│   ML INTELLIGENCE   │──▶│   SERVE & DISPLAY │
   └────────────────┘   └─────────────────────┘   └───────────────────┘
   ingest · validate    DBSCAN spatial check       FastAPI read-only API
   H3 clustering        IsolationForest anomaly    React + Leaflet map
   CIS scoring          ai_risk_flag               per-station JSON cache
   peak-hour stats      unconfirmed flag           Shift Briefing overlay
        │
        ▼
   data/processed/<station>.json  ──▶  FastAPI (hot-reload)  ──▶  React dashboard
```

### Stage 1 — Offline Preprocessing (`preprocess.py`)
The heavy work happens once, offline:
1. **Ingestion & Validation** — reads the raw CSV via PyArrow, parses nested JSON fields, converts timestamps to IST, and filters invalid or out-of-bounds coordinates.
2. **H3 Aggregation** — bins all validated coordinates into H3 resolution-9 hexagons per station, computing per-cell statistics.
3. **CIS Calculation** — applies severity multipliers, junction proximity, and peak-hour factors; normalises scores locally and globally.
4. **Export** — writes one lightweight JSON per station plus a master `stations_index.json`.

### Stage 2 — ML Validation (`ml_intelligence.py`)
Runs automatically as part of preprocessing:
- DBSCAN confirms genuine spatial density for each H3 cell.
- IsolationForest flags anomalous hotspots that warrant attention regardless of volume.
Both results are embedded directly in the per-station JSON artifacts.

### Stage 3 — API & Dashboard
- **FastAPI backend** (`backend/main.py`) — read-only, hot-reload caching (invalidates automatically when new JSONs appear), async threadpool, and path-traversal-safe filename resolution.
- **React + Leaflet frontend** (`frontend/`) — interactive map with Heatmap and Cluster views, real-time priority sidebar, Hotspot Detail Panel, and a Shift Briefing overlay for the morning brief.

---

## The product — what officers see

**Web command centre — for the commander, at the station**

A React + Vite + TypeScript console with five core views:

| View | What it shows |
|---|---|
| **Map** | Toggle between Heatmap and Cluster views; click any marker for the Hotspot Detail Panel |
| **Priority Sidebar** | Real-time CIS ranking with AI risk flags surfaced to the top |
| **Filters** | Narrow by violation type across any station |
| **Shift Briefing** | Full-screen glass-morphism overlay — top-5 hotspots, copy-to-clipboard |
| **Station Search** | Jump to any of the 68 stations by name |

UI design: amber accent (`#F5A623`) on dark backgrounds (`#0F172A`); animated slide-in panels with z-index layering above Leaflet panes; Recharts sidebar charts with guaranteed non-zero dimensions.

---

## Run it

```bash
# 1. Clone and install Python dependencies
git clone https://github.com/your-org/parkSentinel
cd parkSentinel
pip install -r requirements.txt

# 2. Place your dataset
#    data/police_violations.csv

# 3. Run the preprocessing pipeline
#    Produces data/processed/<station>.json + stations_index.json
python preprocess.py data/police_violations.csv

# 4. Start the backend
uvicorn backend.main:app --reload
#    API available at http://localhost:8000
#    Docs at http://localhost:8000/docs

# 5. Start the frontend
cd frontend
npm install
npm run dev
#    Dashboard at http://localhost:5173

# 6. (Optional) Run all tests
pytest tests/
cd frontend && npm run test
```

**Windows one-command bootstrap:**
```powershell
./RunAll.ps1   # Sets up venv, installs deps, preprocesses data, launches both servers
```

---

## Tech stack

| Layer | Tools |
|---|---|
| **Data engineering** | Python, pandas, PyArrow, h3-py |
| **Machine learning** | scikit-learn (DBSCAN, IsolationForest), numpy |
| **Backend** | FastAPI, Uvicorn |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, React-Leaflet, Recharts, Leaflet.markercluster |
| **Testing** | pytest, Hypothesis (property tests), Vitest, fast-check |

---

## Code structure

```
parkSentinel/
├── preprocess.py              # The data pipeline — ingestion → H3 → CIS → JSON
├── ml_intelligence.py         # DBSCAN + IsolationForest validation models
├── generate_seed_data.py      # Synthetic data generator for development
├── requirements.txt           # Python dependencies
├── RunAll.ps1                 # Windows one-command bootstrap
├── backend/
│   ├── main.py                # FastAPI server — read-only, hot-reload cache
│   ├── requirements.txt       # Backend-only deps (fastapi, uvicorn)
│   └── data/                  # Per-station JSONs for deployment
├── data/
│   └── processed/             # Output of preprocess.py — one JSON per station
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Root component and routing
│   │   ├── api/client.ts      # API client
│   │   ├── components/        # HotspotMap, HotspotTable, ShiftBriefing, FilterBar…
│   │   ├── context/           # AppContext — global station + filter state
│   │   ├── hooks/             # useHotspots, useStations
│   │   ├── types/index.ts     # Shared TypeScript interfaces
│   │   └── utils/             # Color scale, formatters (with property tests)
│   └── dist/                  # Static build output
└── tests/
    ├── test_preprocess.py
    ├── test_preprocess_properties.py   # Hypothesis property-based tests
    └── test_ml_intelligence.py
```

---

## Guardrails

| Rule | How it's enforced |
|---|---|
| No real-time compute on request | All ranking and ML runs offline; the API serves pre-computed JSONs only |
| Path traversal protection | Filename regex whitelist in `backend/main.py` before any file read |
| Hot-reload cache invalidation | mtime check on `stations_index.json` — stale data is never served silently |
| Honest score framing | CIS and AI flags are shown side-by-side, not collapsed into a single opaque number |
| `created_datetime` caveat | Timestamps reflect enforcement logging time, not the moment of the parking violation |

---

## Docs

- `preprocess.py` — inline docstrings cover every transformation step
- `ml_intelligence.py` — rationale for model choices and graceful fallback logic
- `backend/main.py` — API contract, environment variables, and error codes
- `.kiro/specs/parking-hotspot-intelligence/` — full requirements, design doc, and task manifest
