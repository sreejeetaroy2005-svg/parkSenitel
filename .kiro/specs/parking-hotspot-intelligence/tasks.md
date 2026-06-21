# Implementation Plan: AI-Driven Parking Hotspot Intelligence

## Overview

Implement the full stack in three layers: a Python offline preprocessor, a FastAPI backend, and a Vite + React + TypeScript SPA. Tasks follow the data flow — scaffold first, then Python pipeline, then API server, then frontend from types outward to UI.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Create root-level files: `requirements.txt` (pandas, h3, pyarrow, tqdm, hypothesis, pytest), `.gitignore` (data/, node_modules/, __pycache__/, .env), and empty `data/` directory placeholder
    - _Requirements: 13.1_
  - [x] 1.2 Create `backend/requirements.txt` (fastapi, uvicorn[standard], httpx, pytest, pytest-asyncio) and `backend/__init__.py`
    - _Requirements: 5.1_
  - [x] 1.3 Scaffold `frontend/` with `package.json` (vite, react, react-dom, typescript, tailwindcss, react-leaflet, leaflet, @types/leaflet, vitest, @testing-library/react, fast-check, leaflet.markercluster), `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, and `index.html`
    - _Requirements: 11.1, 11.2_
  - [x] 1.4 Create `frontend/src/main.tsx` entry point that mounts `<App />` into `#root`
    - _Requirements: 7.1_

- [x] 2. Python types, constants, and utility helpers
  - [x] 2.1 Create the top section of `preprocess.py`: imports, `SEVERITY_WEIGHTS` dict, `INDIA_BBOX` constant, `IST_OFFSET` timedelta, and TypedDict definitions for `HotspotRecord` and `StationIndexEntry`
    - _Requirements: 3.2, 1.4, 1.6_
  - [x] 2.2 Implement `get_severity_weight(violation_type: str) -> float` and `compute_weighted_severity_mean(types: list[str]) -> float` helper functions
    - _Requirements: 3.2_
  - [x] 2.3 Write unit tests for severity weight helpers in `tests/test_preprocess.py`: `test_severity_weight_known_types`, `test_severity_weight_unknown_type`
    - _Requirements: 3.2_
  - [x] 2.4 Write property test for `weighted_severity_mean` in `tests/test_preprocess_properties.py`
    - **Property 1: Severity weight is bounded — weighted_severity_mean ∈ [1.0, 3.0]**
    - **Validates: Requirements 3.2**

- [x] 3. Preprocessor — load, validate, and time-convert
  - [x] 3.1 Implement `load_and_validate(csv_path: str, min_violations: int) -> pd.DataFrame`: read CSV with pyarrow engine, parse `violation_type`/`offence_code` JSON columns (warn on parse error), convert `created_datetime` UTC→IST, filter `validation_status == approved`, drop invalid/out-of-bbox coordinates, warn if < 1000 records remain
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 3.2 Write unit tests: `test_india_bbox_filter`, `test_utc_to_ist_conversion`, `test_invalid_json_col_warning`
    - _Requirements: 1.4, 1.6_
  - [x] 3.3 Write property tests: **Property 8 (approved+bbox filter composes correctly)** and **Property 9 (UTC+5:30 offset)**
    - **Property 8: Validates: Requirements 1.5, 1.6**
    - **Property 9: Validates: Requirements 1.4**

- [ ] 4. Preprocessor — H3 binning and hotspot grouping
  - [x] 4.1 Implement `assign_h3(df: pd.DataFrame) -> pd.DataFrame`: vectorised H3 resolution-9 index assignment; skip/warn on encoding failure
    - _Requirements: 2.1_
  - [x] 4.2 Implement `bin_hotspots(df: pd.DataFrame, min_violations: int) -> pd.DataFrame`: groupby (police_station, h3_index), drop groups below threshold, compute centroid lat/lon as group mean
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 4.3 Write unit tests: `test_hotspot_filtered_below_min`
    - _Requirements: 2.3_
  - [x] 4.4 Write property tests: **Property 6 (min-violation threshold enforced)** and **Property 7 (centroid = mean coordinates)**
    - **Property 6: Validates: Requirements 2.3, 13.3**
    - **Property 7: Validates: Requirements 2.4**

- [ ] 5. Preprocessor — CIS computation and normalization
  - [x] 5.1 Implement `compute_cis(group_df: pd.DataFrame) -> dict`: compute `junction_factor`, `peak_hour_factor`, `weighted_severity_mean`, raw CIS (rounded 2 dp), `junction_flag`, `peak_hour_label`, `dominant_violation_types` (top 3), `sample_address`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2_
  - [x] 5.2 Implement `normalize_cis(station_df: pd.DataFrame) -> pd.DataFrame`: min-max per-station normalization → `cis_normalized`; single-hotspot sentinel = 100.0
    - _Requirements: 3.6_
  - [x] 5.3 Write unit tests: `test_peak_hour_factor_all_peak`, `test_peak_hour_factor_none_peak`, `test_junction_factor_with_junction`, `test_junction_factor_without_junction`, `test_cis_normalized_single_hotspot`
    - _Requirements: 3.3, 3.4, 3.6_
  - [x] 5.4 Write property tests: **Property 2 (peak_hour_factor ∈ [1.0,1.5])**, **Property 3 (CIS > 0)**, **Property 4 (normalization range + order-preserving)**, **Property 5 (single-hotspot → 100.0)**
    - **Property 2: Validates: Requirements 3.4**
    - **Property 3: Validates: Requirements 3.1**
    - **Property 4: Validates: Requirements 3.6**
    - **Property 5: Validates: Requirements 3.6**

- [ ] 6. Preprocessor — output writing and CLI entry point
  - [x] 6.1 Implement `build_hotspot_record(group_df: pd.DataFrame, cis_row: dict) -> HotspotRecord` that assembles the final output dict with all required fields
    - _Requirements: 4.2_
  - [ ] 6.2 Implement `write_outputs(hotspots_by_station: dict, output_dir: str) -> None`: create output dir if missing, write per-station JSON files (filename = lowercase + underscores), write `stations_index.json` with bbox per station, log hotspot counts and elapsed time
    - _Requirements: 4.1, 4.3, 4.4, 4.5_
  - [ ] 6.3 Implement `main()`: argparse with `--input`, `--output`, `--min-violations` (default 2), `--help`; orchestrate all pipeline stages; log timing
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [ ] 6.4 Write unit test `test_idempotency` and property test **Property 14 (preprocessor output is idempotent)**
    - **Property 14: Validates: Requirements 4.4, 13.5**

- [ ] 7. Checkpoint — Python pipeline
  - Ensure all Python tests pass (`pytest tests/`). Ask the user if any questions arise before moving to the backend.

- [ ] 8. FastAPI backend
  - [ ] 8.1 Implement `backend/main.py`: define `FastAPI` app, configure CORS middleware (allow `http://localhost:3000` and `ALLOWED_ORIGINS` env var), add lifespan startup handler that validates data directory existence and loads `stations_index.json` into memory; exit with code 1 on failure
    - _Requirements: 5.5, 5.6_
  - [ ] 8.2 Implement `GET /stations` route handler: return in-memory station list as JSON array within 200 ms
    - _Requirements: 5.1, 5.4_
  - [ ] 8.3 Implement `GET /hotspots/{station_name}` route handler: URL-decode station name, look up in index, read per-station JSON from disk, return array; return HTTP 404 `{"error": "Station not found"}` for unknown stations or missing files
    - _Requirements: 5.2, 5.3_
  - [ ] 8.4 Write API tests in `backend/tests/test_api.py` using pytest + httpx ASGI client: `test_get_stations_returns_list`, `test_get_hotspots_valid_station`, `test_get_hotspots_unknown_station`, `test_startup_fails_missing_data_dir`, `test_cors_header_present`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

- [ ] 9. Checkpoint — Backend
  - Ensure all backend tests pass (`pytest backend/tests/`). Verify the server starts correctly with a sample data directory before moving to the frontend.

- [x] 10. TypeScript types and data models
  - [x] 10.1 Create `frontend/src/types/index.ts` with all interfaces: `DominantViolationType`, `Hotspot`, `BoundingBox`, `Station`, `StationsResponse`, `HotspotsResponse`, `ViewMode`, `AppState`
    - _Requirements: 4.2, 5.1, 5.2_

- [x] 11. API client
  - [x] 11.1 Create `frontend/src/api/client.ts`: export `API_BASE` (reads `VITE_API_BASE` env var, fallback `http://localhost:8000`), `fetchStations(): Promise<Station[]>`, `fetchHotspots(stationName: string): Promise<Hotspot[]>` — both throw typed errors on non-2xx responses
    - _Requirements: 5.1, 5.2, 12.3_

- [ ] 12. AppContext and state management
  - [x] 12.1 Create `frontend/src/context/AppContext.tsx`: define `AppAction` discriminated union, implement `appReducer`, create `AppContext` with `useContext` hook, wrap in `AppProvider` that initializes state and exposes dispatch
    - _Requirements: 6.3, 7.5, 10.5_
  - [x] 12.2 Create `frontend/src/hooks/useStations.ts`: fetch stations on mount, dispatch loading/success/error actions, expose `{ stations, loading, error, retry }`
    - _Requirements: 6.1, 6.5, 12.1_
  - [x] 12.3 Create `frontend/src/hooks/useHotspots.ts`: fetch hotspots when `selectedStation` changes, dispatch loading/success/error actions, expose `{ hotspots, loading, error, retry }`
    - _Requirements: 6.3, 6.4, 12.2, 12.4_

- [ ] 13. Utility functions
  - [x] 13.1 Create `frontend/src/utils/colors.ts`: implement `cisToColor(cisNormalized: number): string` (linear interpolation from `#F5A623` at 0 to `#C0392B` at 100) and `cisToRadius(cisNormalized: number): number` (formula: `8 + (cisNormalized / 100) * 16`)
    - _Requirements: 7.3, 7.4_
  - [x] 13.2 Create `frontend/src/utils/formatters.ts`: implement `formatAddress(hotspot: Hotspot): string` (sample_address or `${lat}, ${lon}` fallback), `formatCisExplanation(hotspot: Hotspot): string` (plain-English CIS breakdown string), `filterStations(stations: Station[], query: string): Station[]` (case-insensitive substring match)
    - _Requirements: 6.2, 8.1, 8.4_
  - [x] 13.3 Write vitest unit tests in `frontend/src/utils/__tests__/colors.test.ts`: `cisToColor(0)` → `#F5A623`, `cisToColor(100)` → `#C0392B`; `cisToRadius(0)` → 8, `cisToRadius(100)` → 24
    - _Requirements: 7.3, 7.4_
  - [x] 13.4 Write vitest unit test in `frontend/src/utils/__tests__/formatters.test.ts`: `formatCisExplanation` produces correct string; `formatAddress` falls back to coordinates when `sample_address` is null
    - _Requirements: 8.1, 8.4_
  - [ ] 13.5 Write fast-check property tests in `frontend/src/utils/__tests__/colors.property.test.ts`
    - **Property 11: Marker radius scales linearly with CIS — radius = 8 + (cis_normalized/100)×16**
    - **Validates: Requirements 7.3**
  - [ ] 13.6 Write fast-check property tests in `frontend/src/utils/__tests__/formatters.property.test.ts`
    - **Property 10: Station filter is exact case-insensitive substring match**
    - **Property 12: formatCisExplanation renders all required fields for any valid hotspot**
    - **Validates: Requirements 6.2, 8.1, 8.4**

- [ ] 14. Core UI shell components
  - [ ] 14.1 Create `frontend/src/components/LoadingScreen.tsx`: full-screen centered spinner with text `"Loading station data…"` using Tailwind classes and the cream/charcoal palette
    - _Requirements: 12.1_
  - [ ] 14.2 Create `frontend/src/components/ErrorScreen.tsx`: full-screen error state with message `"Could not load stations. Please refresh."` and a retry button styled with amber accent
    - _Requirements: 6.5, 12.3_
  - [ ] 14.3 Create `frontend/src/components/Header.tsx`: top bar rendering app title in display typeface; accepts `StationSelector` as a slot/child
    - _Requirements: 11.1, 11.2_
  - [ ] 14.4 Create `frontend/src/components/Layout.tsx`: responsive two-column layout (map + list side-by-side ≥1024 px); renders map-or-list toggle control on narrow viewports; preserves state across toggle
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 15. StationSelector component
  - [ ] 15.1 Create `frontend/src/components/StationSelector.tsx`: combobox input that calls `filterStations` on each keystroke, renders dropdown of matching options, fires `onSelect(station)` callback on selection, shows loading indicator while stations load, disables input on error
    - _Requirements: 6.1, 6.2, 6.4, 6.5_
  - [ ] 15.2 Write vitest + @testing-library/react test: filter visible options updates within 100 ms of keystroke; disabled state on error prop
    - _Requirements: 6.2_

- [ ] 16. MapView and marker components
  - [ ] 16.1 Create `frontend/src/components/MapView.tsx`: React-Leaflet `MapContainer` with OpenStreetMap tiles; accepts `hotspots`, `selectedHotspot`, `onHotspotSelect` props; fits bounds to station bbox on station change with 10% padding; renders `<HotspotMarker>` per hotspot; shows `<MapOverlay>` when loading or empty
    - _Requirements: 7.1, 7.2, 7.6, 7.7, 7.8_
  - [ ] 16.2 Create `frontend/src/components/HotspotMarker.tsx`: Leaflet `CircleMarker` using `cisToRadius` and `cisToColor`; adds 2 px white stroke outline when selected; fires `onSelect` on click; clusters via Leaflet.markercluster when > 200 hotspots
    - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [ ] 16.3 Create `frontend/src/components/MapOverlay.tsx`: semi-transparent overlay rendered over the map; shows spinner when `loading=true`; shows `"No hotspots found for this station."` when `empty=true`
    - _Requirements: 6.4, 7.7, 12.2_

- [ ] 17. DetailPanel component
  - [ ] 17.1 Create `frontend/src/components/DetailPanel.tsx`: slide-in panel (right on desktop, bottom on mobile) with 200 ms CSS transition; renders `formatAddress`, `violation_count`, `cis`, `cis_normalized`, `dominant_violation_types` list, `peak_hour_label`, `formatCisExplanation` output; includes close button that fires `onDismiss` callback; updates within 100 ms on hotspot change
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.4_
  - [ ] 17.2 Write vitest + @testing-library/react test: all required fields rendered; close button fires dismiss callback
    - _Requirements: 8.1, 8.6_
  - [ ] 17.3 Write fast-check property test in `frontend/src/components/__tests__/DetailPanel.property.test.tsx`
    - **Property 12: Detail panel renders all required fields for any valid hotspot object**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [ ] 18. RankedList component
  - [ ] 18.1 Create `frontend/src/components/RankedList.tsx`: sortable table with columns Rank, Address/Location, Violation Count, Dominant Type, Peak Hour, CIS (normalized); default sort `cis_normalized` descending; column-header click toggles sort direction within 100 ms; row click pans map + opens DetailPanel; highlights selected hotspot row; paginates at 50 rows/page when > 50 hotspots; shows skeleton loading state
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 12.2_
  - [ ] 18.2 Write vitest + @testing-library/react tests: column header click toggles sort order; selected hotspot row is highlighted
    - _Requirements: 9.3, 9.5_
  - [ ] 18.3 Write fast-check property test in `frontend/src/components/__tests__/RankedList.property.test.tsx`
    - **Property 13: Sorted list is monotone for any hotspot list and sort direction**
    - **Validates: Requirements 9.2, 9.3**

- [ ] 19. App.tsx wiring — integrate all state and components
  - [ ] 19.1 Create `frontend/src/App.tsx`: wrap everything in `AppProvider`; use `useStations` and `useHotspots` hooks; render `<LoadingScreen>` during init, `<ErrorScreen>` on stations failure, otherwise `<Layout>` containing `<Header>` + `<StationSelector>`, `<MapView>`, `<RankedList>`, and `<DetailPanel>`; wire all `onSelect`/`onDismiss`/`onRetry` callbacks through context dispatch
    - _Requirements: 6.3, 7.5, 9.4, 12.1, 12.4_

- [ ] 20. Responsive layout and visual theming
  - [ ] 20.1 Configure `tailwind.config.ts` with custom theme: colors (`#F5F0E8`, `#2C2C2C`, `#E0DAD0`, `#F5A623`, `#C0392B`), font families (Barlow Condensed for headings, Inter/IBM Plex Mono for data), and any custom screen breakpoints
    - _Requirements: 11.1, 11.2_
  - [ ] 20.2 Add global CSS in `frontend/src/index.css`: Tailwind base/components/utilities directives, Google Fonts import (Barlow Condensed + Inter), focus-visible amber ring utility, DetailPanel slide-in transition classes
    - _Requirements: 11.3, 11.4, 11.5_

- [ ] 21. Checkpoint — Frontend
  - Ensure all frontend tests pass (`vitest --run`). Visually verify the app renders correctly with sample data before writing the README.

- [ ] 22. README
  - [ ] 22.1 Write `README.md` at project root: prerequisites, step-by-step setup (pip install, npm install), how to run the preprocessor (`python preprocess.py --input <path> --output data/`), how to start the backend (`uvicorn backend.main:app --reload`), how to start the frontend (`npm run dev` in `frontend/`), CIS formula explanation with all sub-factors, and a brief description of each component
    - _Requirements: 13.1, 13.2, 3.1_

- [ ] 23. Final checkpoint — Ensure all tests pass
  - Run `pytest` from the root and `vitest --run` from `frontend/`. Ensure all tests pass. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 7, 9, 21, 23) ensure incremental validation at layer boundaries
- Python property tests use `hypothesis`; TypeScript property tests use `fast-check`
- Unit tests and property tests are complementary — both are included where applicable
- The preprocessor must be run once before starting the backend or frontend

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "10.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.1", "11.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2", "12.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "5.1", "12.2", "12.3"] },
    { "id": 6, "tasks": ["5.2", "13.1", "13.2"] },
    { "id": 7, "tasks": ["5.3", "5.4", "6.1", "13.3", "13.4"] },
    { "id": 8, "tasks": ["6.2", "13.5", "13.6"] },
    { "id": 9, "tasks": ["6.3", "14.1", "14.2", "14.3"] },
    { "id": 10, "tasks": ["6.4", "8.1", "14.4", "15.1"] },
    { "id": 11, "tasks": ["8.2", "8.3", "15.2", "16.1"] },
    { "id": 12, "tasks": ["8.4", "16.2", "16.3"] },
    { "id": 13, "tasks": ["17.1", "18.1"] },
    { "id": 14, "tasks": ["17.2", "17.3", "18.2", "18.3"] },
    { "id": 15, "tasks": ["19.1"] },
    { "id": 16, "tasks": ["20.1"] },
    { "id": 17, "tasks": ["20.2"] },
    { "id": 18, "tasks": ["22.1"] }
  ]
}
```
