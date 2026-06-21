# Design Document: AI-Driven Parking Hotspot Intelligence

## Overview

The system is a hackathon-scale web application split into three independently runnable pieces:

1. **Preprocessor** (`preprocess.py`) — an offline Python script that ingests the raw violation CSV, bins records into H3 hexagons, computes the Congestion Impact Score per hotspot, and writes one JSON file per police station to a local `data/` directory.
2. **API Server** (`backend/main.py`) — a lightweight FastAPI server that reads the precomputed JSON files and exposes two REST endpoints consumed by the frontend.
3. **Frontend** (`frontend/`) — a Vite + React + TypeScript single-page application featuring a Station Selector, an interactive Leaflet map, a sortable ranked list, and a slide-in hotspot detail panel.

The preprocessor runs once (or whenever source data changes) and produces a static data directory that the API server serves. This deliberately avoids a database to keep the demo setup to a single `pip install` + `npm install`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Developer Machine                                          │
│                                                             │
│  preprocess.py ──────────────────► data/                   │
│  (one-time offline run)            ├─ stations_index.json  │
│                                    ├─ anna_nagar.json       │
│                                    └─ ...                   │
│                                         │                   │
│                                    backend/main.py          │
│                                    (FastAPI :8000)          │
│                                         │                   │
│                                    frontend/ (Vite :3000)   │
│                                    └─ React SPA             │
└─────────────────────────────────────────────────────────────┘
```

Data flow at runtime:
1. Browser loads the React SPA.
2. SPA calls `GET /stations` → backend reads `stations_index.json` → returns station list.
3. User selects a station → SPA calls `GET /hotspots/{station_name}` → backend reads `<station>.json` → returns hotspot array.
4. SPA renders map markers + ranked list from the response.

No database, no authentication, no WebSockets — intentionally minimal for demo reliability.

---

## Components and Interfaces

### Preprocessor (`preprocess.py`)

Single-file Python script with the following logical stages, each implemented as a function:

| Function | Responsibility |
|---|---|
| `load_and_validate(csv_path, min_violations)` | Read CSV, parse JSON columns, UTC→IST, filter approved + valid coords |
| `assign_h3(df)` | Vectorised H3 index assignment at resolution 9 |
| `bin_hotspots(df, min_violations)` | GroupBy (station, h3_index), drop small cells, compute centroid |
| `compute_cis(group_df)` | Severity mean, junction factor, peak factor, raw CIS |
| `normalize_cis(station_df)` | Min-max per station → `cis_normalized` |
| `build_hotspot_record(group_df)` | Assemble final dict with all required output fields |
| `write_outputs(hotspots_by_station, output_dir)` | Write per-station JSON + `stations_index.json` |
| `main()` | Argparse entry point, orchestrates stages, logs timing |

**Dependencies:** `pandas`, `h3`, `pyarrow` (for fast CSV reading), standard library only.

### API Server (`backend/main.py`)

Single-file FastAPI application:

| Route | Handler | Notes |
|---|---|---|
| `GET /stations` | `get_stations()` | Returns loaded `stations_index.json` in memory |
| `GET /hotspots/{station_name}` | `get_hotspots(station_name)` | Reads per-station JSON file; 404 if missing |

Startup:
- Validates that the data directory exists and `stations_index.json` is readable.
- Loads `stations_index.json` into an in-memory dict at startup (tiny file, fast).
- Per-station JSON files are read on-demand from disk (they are small, ~50–500 KB each).

**Dependencies:** `fastapi`, `uvicorn`.

### Frontend (`frontend/src/`)

Component tree:

```
<App>
 ├─ <LoadingScreen />           — full-screen spinner on init
 ├─ <ErrorScreen />             — stations fetch failed
 └─ <Layout>
     ├─ <Header>
     │   └─ <StationSelector /> — combobox, fetches /stations on mount
     ├─ <MainArea>              — responsive split / toggle
     │   ├─ <MapView>           — React-Leaflet map + marker layer
     │   │   ├─ <HotspotMarker />  (per hotspot)
     │   │   ├─ <ClusterLayer />   (>200 hotspots)
     │   │   └─ <MapOverlay />     (empty-state message, spinner)
     │   └─ <RankedList>        — sortable table + pagination
     └─ <DetailPanel />         — slide-in side/bottom panel
```

**State management:** Plain React `useState` + `useReducer` at the `<App>` level, passed down via props and a single `AppContext`. No Redux or Zustand — the state shape is small enough.

```
AppState {
  stations: Station[]           // loaded once on mount
  stationsLoading: boolean
  stationsError: string | null
  selectedStation: Station | null
  hotspots: Hotspot[]           // for selected station
  hotspotsLoading: boolean
  hotspotsError: string | null
  selectedHotspot: Hotspot | null
  viewMode: 'map' | 'list'      // mobile toggle
}
```

**Routing:** No React Router — a single page, view switching is pure state.

**API layer:** `frontend/src/api/client.ts` — thin wrapper around `fetch`:

```typescript
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';
export const fetchStations = (): Promise<Station[]> => ...
export const fetchHotspots = (stationName: string): Promise<Hotspot[]> => ...
```

**Map library:** `react-leaflet` v4 + `leaflet.markercluster` for clustering.

**Styling:** Tailwind CSS utility classes with a custom theme extending the brand palette. No external component library.

---

## Data Models

### Python (Preprocessor output / API response shape)

```python
# Per-hotspot dict written to JSON
HotspotRecord = TypedDict('HotspotRecord', {
    'h3_index':                str,    # e.g. "891f1d48177ffff"
    'latitude':                float,  # centroid lat
    'longitude':               float,  # centroid lon
    'violation_count':         int,
    'dominant_violation_types': list[dict],  # [{type, count}, ...] top 3
    'peak_hour_label':         str,    # e.g. "08:00–09:00 IST"
    'cis':                     float,  # raw CIS, 2 dp
    'cis_normalized':          float,  # 0–100
    'junction_flag':           bool,
    'sample_address':          str | None,
})

# stations_index.json entry
StationIndexEntry = TypedDict('StationIndexEntry', {
    'name':     str,
    'filename': str,   # e.g. "anna_nagar.json"
    'bbox':     dict,  # {min_lat, max_lat, min_lon, max_lon}
})
```

### TypeScript (Frontend)

```typescript
// frontend/src/types/index.ts

export interface DominantViolationType {
  type: string;
  count: number;
}

export interface Hotspot {
  h3_index: string;
  latitude: number;
  longitude: number;
  violation_count: number;
  dominant_violation_types: DominantViolationType[];
  peak_hour_label: string;
  cis: number;
  cis_normalized: number;
  junction_flag: boolean;
  sample_address: string | null;
}

export interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface Station {
  name: string;
  filename: string;
  bbox: BoundingBox;
}

// API response types (arrays of the above)
export type StationsResponse = Station[];
export type HotspotsResponse = Hotspot[];

export type ViewMode = 'map' | 'list';

export interface AppState {
  stations: Station[];
  stationsLoading: boolean;
  stationsError: string | null;
  selectedStation: Station | null;
  hotspots: Hotspot[];
  hotspotsLoading: boolean;
  hotspotsError: string | null;
  selectedHotspot: Hotspot | null;
  viewMode: ViewMode;
}
```

---

## Project Structure

```
flipkart_gridlock/
├─ preprocess.py               # standalone Python pipeline
├─ requirements.txt            # pandas, h3, pyarrow, tqdm
├─ data/                       # generated by preprocess.py (git-ignored)
│   ├─ stations_index.json
│   ├─ anna_nagar.json
│   └─ ...
├─ backend/
│   ├─ main.py                 # FastAPI app
│   └─ requirements.txt        # fastapi, uvicorn
├─ frontend/
│   ├─ package.json
│   ├─ vite.config.ts
│   ├─ tailwind.config.ts
│   ├─ index.html
│   └─ src/
│       ├─ main.tsx
│       ├─ App.tsx
│       ├─ types/
│       │   └─ index.ts
│       ├─ api/
│       │   └─ client.ts
│       ├─ context/
│       │   └─ AppContext.tsx
│       ├─ hooks/
│       │   ├─ useStations.ts
│       │   └─ useHotspots.ts
│       ├─ components/
│       │   ├─ LoadingScreen.tsx
│       │   ├─ ErrorScreen.tsx
│       │   ├─ Header.tsx
│       │   ├─ StationSelector.tsx
│       │   ├─ MapView.tsx
│       │   ├─ HotspotMarker.tsx
│       │   ├─ MapOverlay.tsx
│       │   ├─ RankedList.tsx
│       │   ├─ DetailPanel.tsx
│       │   └─ Layout.tsx
│       └─ utils/
│           ├─ colors.ts         # CIS → hex interpolation
│           └─ formatters.ts     # CIS plain-English, address fallback
└─ README.md
```

---

## CIS Formula Reference

```
CIS = (violation_count × weighted_severity_mean) × junction_factor × peak_hour_factor

weighted_severity_mean  = mean of per-violation-type severity weights
                          WRONG PARKING           → 1.0
                          PARKING IN A MAIN ROAD  → 1.5
                          NO PARKING ZONE         → 1.5
                          OBSTRUCTION TO TRAFFIC  → 2.0
                          BLOCKING EMERGENCY ACCESS → 3.0
                          (unknown)               → 1.0

junction_factor         = 1.3 if any member record has junction_name ≠ "No Junction"
                          1.0 otherwise

peak_hour_factor        = 1.0 + (peak_fraction × 0.5)
                          peak hours: 08:00–10:59 IST or 17:00–19:59 IST
                          peak_fraction = count(peak records) / violation_count

cis_normalized          = (cis - min_cis) / (max_cis - min_cis) × 100  [per station]
                          When station has single hotspot: cis_normalized = 100
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Severity weight is bounded

*For any* list of violation type strings (including unknown types), the computed `weighted_severity_mean` SHALL be ≥ 1.0 and ≤ 3.0, where 1.0 is the minimum defined severity weight and 3.0 is the maximum.

**Validates: Requirements 3.2**

---

### Property 2: Peak hour factor is bounded

*For any* collection of violation records, the computed `peak_hour_factor` SHALL satisfy `1.0 ≤ peak_hour_factor ≤ 1.5`, since `peak_fraction` is always in [0, 1] and the formula is `1.0 + (peak_fraction × 0.5)`.

**Validates: Requirements 3.4**

---

### Property 3: CIS is strictly positive

*For any* hotspot with at least one violation record, the computed `cis` SHALL be strictly greater than 0. This follows from all sub-factors being ≥ 1.0 and `violation_count` ≥ 1.

**Validates: Requirements 3.1**

---

### Property 4: CIS normalization is in range and order-preserving

*For any* station with two or more hotspots, every hotspot's `cis_normalized` SHALL satisfy `0.0 ≤ cis_normalized ≤ 100.0`, and if hotspot A has a higher raw `cis` than hotspot B, hotspot A SHALL have a strictly higher `cis_normalized`. (Properties 3 and 5 from the initial draft are combined here since order-preservation and range-validity are both consequences of min-max normalization.)

**Validates: Requirements 3.6**

---

### Property 5: Single-hotspot station normalization sentinel

*For any* station containing exactly one hotspot, that hotspot's `cis_normalized` SHALL equal `100.0`.

**Validates: Requirements 3.6**

---

### Property 6: Minimum-violation threshold is enforced

*For any* (station, H3 cell) group and any value of `min_violations` N, if that group's record count is less than N, the group SHALL NOT appear in the output hotspot list. This covers both the default threshold of 2 and any value supplied via `--min-violations`.

**Validates: Requirements 2.3, 13.3**

---

### Property 7: Centroid is the mean of member coordinates

*For any* set of violation records that form a hotspot, the output `latitude` SHALL equal the arithmetic mean of all member latitudes, and the output `longitude` SHALL equal the arithmetic mean of all member longitudes.

**Validates: Requirements 2.4**

---

### Property 8: Approved-only filter and India bbox filter compose correctly

*For any* set of raw records with mixed `validation_status` values and mixed coordinate validity, the output hotspot records SHALL contain only records whose `validation_status` is `approved` AND whose coordinates are within the India bounding box (lat ∈ [6, 37], lon ∈ [68, 98]). No record failing either filter SHALL contribute to any hotspot.

**Validates: Requirements 1.5, 1.6**

---

### Property 9: UTC-to-IST conversion preserves offset

*For any* UTC datetime value in the `created_datetime` column, the derived `created_datetime_ist` value SHALL equal the input plus exactly 5 hours and 30 minutes (UTC+05:30).

**Validates: Requirements 1.4**

---

### Property 10: Station filter correctness (case-insensitive substring)

*For any* query string and any list of station names, the Station Selector's filter function SHALL return exactly the subset of station names that contain the query as a case-insensitive substring — no station matching the query SHALL be absent, and no station not matching the query SHALL be included.

**Validates: Requirements 6.2**

---

### Property 11: Marker radius scales linearly with CIS

*For any* `cis_normalized` value in [0, 100], the rendered marker radius SHALL satisfy `radius = 8 + (cis_normalized / 100) × 16`, i.e., 8 px at 0 and 24 px at 100.

**Validates: Requirements 7.3**

---

### Property 12: Detail panel renders complete hotspot data

*For any* selected hotspot, the Detail Panel SHALL render the `sample_address` (or coordinate fallback), `violation_count`, `cis`, `cis_normalized`, all entries in `dominant_violation_types` (up to 3) with their counts, `peak_hour_label`, and the plain-English CIS explanation string. No required field SHALL be absent or silently empty.

**Validates: Requirements 8.1, 8.2, 8.4**

---

### Property 13: Ranked list sort is correct for any sort direction

*For any* list of hotspots and any sort column, after sorting descending no element at index `i` SHALL have a lower value than the element at index `i + 1`, and after sorting ascending no element at index `i` SHALL have a higher value than the element at index `i + 1`.

**Validates: Requirements 9.2, 9.3**

---

### Property 14: Preprocessor output is idempotent

*For any* input CSV, running the Preprocessor twice with identical arguments SHALL produce byte-identical output JSON files. This subsumes the JSON serialization round-trip (Property 10 in initial draft) since stable round-trip serialization is a prerequisite for idempotent output.

**Validates: Requirements 4.4, 13.5**

---

## Error Handling

### Preprocessor

| Scenario | Behavior |
|---|---|
| Missing or unreadable CSV | `argparse` error + exit 1 |
| Unparseable JSON column value | Log warning with record `id`, treat as empty list, continue |
| < 1 000 records after filtering | `warnings.warn()` to stderr, continue |
| Output directory does not exist | Create it (`os.makedirs(exist_ok=True)`) |
| H3 encoding failure for a record | Log warning, skip record |

### API Server

| Scenario | Behavior |
|---|---|
| Data directory missing at startup | Log error + `sys.exit(1)` |
| `stations_index.json` unreadable | Log error + `sys.exit(1)` |
| Station not found in index | HTTP 404 `{"error": "Station not found"}` |
| Station JSON file missing from disk | HTTP 404 (defensive; index and files must stay in sync) |
| Unhandled exception | FastAPI default 500 handler |

### Frontend

| Scenario | Behavior |
|---|---|
| `/stations` fails | Full-screen error with "Could not load stations. Please refresh." |
| `/hotspots/{name}` fails (5xx / network) | Inline error + retry button adjacent to map/list |
| 404 from `/hotspots/{name}` | Treat as empty station — show "No hotspots found" message |
| Zero hotspots returned | "No hotspots found for [Station Name]." overlay on map + table |

---

## Testing Strategy

### Preprocessor (Python)

**Unit tests** (`tests/test_preprocess.py`) using `pytest`:
- `test_severity_weight_known_types` — each known violation type returns the correct weight
- `test_severity_weight_unknown_type` — unknown type returns 1.0
- `test_peak_hour_factor_all_peak` — all records in peak hours → factor = 1.5
- `test_peak_hour_factor_none_peak` — no peak records → factor = 1.0
- `test_junction_factor_with_junction` — at least one non-"No Junction" → 1.3
- `test_junction_factor_without_junction` — all "No Junction" → 1.0
- `test_hotspot_filtered_below_min` — cells with < min_violations excluded
- `test_cis_normalized_single_hotspot` — single hotspot per station → 100.0
- `test_india_bbox_filter` — coords outside India bbox are excluded
- `test_idempotency` — run pipeline twice on same fixture CSV, compare JSON bytes

**Property-based tests** (`tests/test_preprocess_properties.py`) using `hypothesis`:

These tests validate the correctness properties listed in the design:

- **Property 1** — `@given(violation_type_lists)` → `weighted_severity_mean` ∈ [1.0, 3.0]
- **Property 2** — `@given(peak_fraction_floats)` → `peak_hour_factor` ∈ [1.0, 1.5]
- **Property 3** — `@given(hotspot_records)` → `cis > 0` for any valid record set
- **Property 4** — `@given(station_hotspot_lists_multi)` → all `cis_normalized` ∈ [0.0, 100.0], order-preserving
- **Property 5** — `@given(single_hotspot_station)` → `cis_normalized == 100.0`
- **Property 6** — `@given(hotspot_groups, min_violations)` → groups below threshold absent in output
- **Property 7** — `@given(coordinate_sets)` → centroid equals mean of lats/lons
- **Property 8** — `@given(record_sets_mixed_status_and_coords)` → output contains only approved + valid-coord records
- **Property 9** — `@given(utc_datetimes)` → IST = UTC + 5h30m
- **Property 10** — `@given(query_strings, station_name_lists)` → filter output = exact case-insensitive substring match (frontend `utils/formatters` unit)
- **Property 11** — `@given(cis_normalized_values)` → marker radius = 8 + (v/100)×16 (frontend `utils/colors` unit)
- **Property 12** — `@given(hotspot_objects)` → detail panel rendered output contains all required fields and the correct explanation string (frontend `utils/formatters` unit)
- **Property 13** — `@given(hotspot_lists, sort_column, sort_direction)` → sorted output is monotone (frontend `RankedList` sort util)
- **Property 14** — run pipeline twice on fixture CSV; compare all output JSON file bytes

Library: `hypothesis` (Python) for preprocessor properties; `fast-check` (TypeScript) for frontend properties 10–13. Each property test runs ≥ 100 iterations.
Tag format in test docstring/comment: `Feature: parking-hotspot-intelligence, Property {N}: {property_text}`

### API Server (Python)

**Unit / integration tests** (`tests/test_api.py`) using `pytest` + `httpx` (ASGI test client):
- `test_get_stations_returns_list` — valid data dir → 200, array response
- `test_get_hotspots_valid_station` — known station → 200, non-empty array
- `test_get_hotspots_unknown_station` → 404, `{"error": "Station not found"}`
- `test_startup_fails_missing_data_dir` — confirm `sys.exit` when dir absent
- `test_cors_header_present` — response includes correct `Access-Control-Allow-Origin`

### Frontend (TypeScript)

**Unit tests** (`src/**/__tests__/`) using `vitest` + `@testing-library/react`:
- `colors.ts` — `cisToColor(0)` returns `#F5A623`, `cisToColor(100)` returns `#C0392B`
- `formatters.ts` — `formatCisExplanation(hotspot)` produces correct plain-English string
- `StationSelector` — filters visible options within 100 ms of keystroke simulation
- `RankedList` — click column header toggles sort order; row highlight reflects `selectedHotspot`
- `DetailPanel` — renders all required fields; close button fires dismiss callback

**End-to-end smoke test**: Manual demo walkthrough (hackathon context — full E2E automation deferred).

### Performance

- Preprocessor: validated by timing on the 298 K-record CSV in CI; must complete < 10 min.
- Ranked list sort: `performance.now()` guard in unit test asserts ≤ 100 ms for 500-row dataset.
- Station filter: `performance.now()` guard asserts ≤ 100 ms for 54-item list.
