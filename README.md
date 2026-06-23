# ParkSentinel — AI-Driven Parking Hotspot Intelligence

## Overview
ParkSentinel is a Traffic Enforcement Decision-Support System designed to optimize municipal resources by pinpointing actionable, high-priority parking enforcement zones. Rather than relying purely on raw violation volumes, the system intelligently clusters violations and evaluates their true real-world impact—factoring in proximity to critical junctions, peak-hour congestion, and violation severity.

## Core Concepts

### H3 Spatial Clustering
Instead of treating each violation as an isolated point, ParkSentinel aggregates scattered records into standardized hexagonal cells (H3 resolution 9). This eliminates the noise of GPS drift and arbitrary street segmenting, grouping nearby violations into coherent geographic units known as **Hotspots**.

### Congestion Impact Score (CIS)
The CIS is the primary metric used to rank hotspots. It is a deterministic, transparent score calculated from the ground up:
- **Violation Volume**: The raw number of violations in the hotspot.
- **Severity Multiplier**: Certain violations (e.g., "BLOCKING EMERGENCY ACCESS", "OBSTRUCTION TO TRAFFIC") mathematically weigh heavier than standard violations.
- **Junction Proximity Factor**: Violations occurring near mapped intersections or junctions receive a 30% penalty multiplier due to their cascading effect on traffic flow.
- **Peak Hour Factor**: A dynamic multiplier applied when a significant fraction of a hotspot's violations occur during the station's historically busiest times.

CIS scores are dynamically min-max normalized on both a **per-station** (0-100) and **global** (0-100) scale to provide both local prioritization and city-wide insight.

## Machine Learning & AI Validations
Beyond deterministic calculations, ParkSentinel integrates unsupervised machine learning to filter noise and identify hidden risks.

### DBSCAN Spatial Validation
Because the H3 grid is arbitrary, a high-volume cell might just be scattered noise that happened to fall within the hexagon's boundaries. 
- **Methodology**: DBSCAN dynamically calculates search radii based on the standard deviation of geographic coordinates within the station (handling both dense urban centers and sparse suburbs). 
- **Result**: It independently searches for *actual* spatial density without grid bias. If a cell lacks genuine cluster density, it is flagged as unconfirmed.

### IsolationForest Anomaly Detection
The linear CIS formula heavily weights volume, which can overshadow low-volume but extreme-severity events (e.g., an emergency lane blocked consistently).
- **Methodology**: An IsolationForest model assesses the holistic profile of each hotspot against its peers within the same police station (accounting for severity, junction presence, and peak hours). For very small police stations (fewer than 8 hotspots), the system gracefully falls back to a standard deviation threshold.
- **Result**: It flags anomalies that "punch above their weight," creating an `ai_risk_flag` that surfaces emerging high-risk hotspots before they explode in volume.

## Architecture

### Offline Data Preprocessing (`preprocess.py`)
Because parsing hundreds of thousands of CSV rows in real-time is inefficient, the heavy lifting is done offline.
1. **Ingestion & Validation**: Reads the raw CSV via a fast PyArrow engine, parses JSON structures, converts timezones to IST, and filters out unapproved or out-of-bounds coordinates.
2. **Aggregation**: Bins millions of coordinates into H3 cells and computes aggregate statistics.
3. **ML Application**: Applies DBSCAN and IsolationForest scoring.
4. **Export**: Outputs lightweight, pre-computed JSON files—one per police station—along with a master `stations_index.json`.

### High-Performance Backend API (`backend/main.py`)
A lightweight, lightning-fast FastAPI server specifically designed to serve the precomputed JSONs to the frontend. It features hot-reloading (invalidating cache automatically when new JSONs are generated) and asynchronous non-blocking threadpools to handle high-throughput dashboard requests without touching a database.

### Interactive Dashboard Frontend (`frontend/`)
A React (Vite) + TypeScript application leveraging `react-leaflet` to render an interactive map. 
- Officers can dynamically toggle between Heatmap and Cluster views.
- Hotspots can be filtered by specific violation types.
- A priority sidebar sorts actionable intelligence in real-time.

## Technology Stack
- **Data Engineering**: Python, pandas, PyArrow, h3-py
- **Machine Learning**: scikit-learn, numpy
- **Backend**: FastAPI, Uvicorn
- **Frontend**: React 18, TypeScript, TailwindCSS, React-Leaflet, Recharts, Radix UI

## Code Structure Highlights
- `preprocess.py`: The heart of the data pipeline.
- `ml_intelligence.py`: Encapsulated scikit-learn models for validation.
- `backend/main.py`: The API gateway.
- `frontend/src/features/hotspots/`: Core React components governing map state and hotspot visualization.

## Unique Features Added
- **Responsive overflow handling**: The root container now uses `overflow-auto` and the main area `overflow-visible` to ensure detail panels are never clipped.
- **Hotspot Detail Panel**: Click a map marker to open a right‑anchored panel (width = w‑80) showing address, violation count, and estimated delay minutes.
- **Shift Briefing Overlay**: A full‑screen, glass‑morphism styled panel (`z-[1000]`) that summarizes the top‑5 hotspots with copy‑to‑clipboard functionality.
- **Sidebar Charts enhancements**: Added `min-w-[250px]`, `min-h-32` and `min-h-28` to guarantee Recharts receives non‑zero dimensions, removing the `width(-1)` warning.
- **Dynamic Z‑index strategy**: Detail panels use `z-[800]` / `z-[900]` to sit above Leaflet panes, while the briefing uses `z-[1000]`.
- **Improved map interaction**: Added pointer‑events handling and fixed container styles to prevent marker click swallowing.
- **Animated UI**: Tailwind `animate-fade-in` and `animate-slide-left` give smooth transitions for panels and sidebars.
- **Dark‑mode design system**: Consistent amber accents (`#F5A623`) and dark backgrounds (`#0F172A`) across all components.
- **Performance‑optimized data flow**: Pre‑computed JSONs enable sub‑second API responses even for city‑wide datasets.

---

Feel free to explore the source, contribute, or spin up your own instance using the provided `RunAll.ps1` script.


## Overview
ParkSentinel is a Traffic Enforcement Decision-Support System designed to optimize municipal resources by pinpointing actionable, high-priority parking enforcement zones. Rather than relying purely on raw violation volumes, the system intelligently clusters violations and evaluates their true real-world impact—factoring in proximity to critical junctions, peak-hour congestion, and violation severity.

## Core Concepts

### H3 Spatial Clustering
Instead of treating each violation as an isolated point, ParkSentinel aggregates scattered records into standardized hexagonal cells (H3 resolution 9). This eliminates the noise of GPS drift and arbitrary street segmenting, grouping nearby violations into coherent geographic units known as **Hotspots**.

### Congestion Impact Score (CIS)
The CIS is the primary metric used to rank hotspots. It is a deterministic, transparent score calculated from the ground up:
- **Violation Volume**: The raw number of violations in the hotspot.
- **Severity Multiplier**: Certain violations (e.g., "BLOCKING EMERGENCY ACCESS", "OBSTRUCTION TO TRAFFIC") mathematically weigh heavier than standard violations.
- **Junction Proximity Factor**: Violations occurring near mapped intersections or junctions receive a 30% penalty multiplier due to their cascading effect on traffic flow.
- **Peak Hour Factor**: A dynamic multiplier applied when a significant fraction of a hotspot's violations occur during the station's historically busiest times.

CIS scores are dynamically min-max normalized on both a **per-station** (0-100) and **global** (0-100) scale to provide both local prioritization and city-wide insight.

## Machine Learning & AI Validations
Beyond deterministic calculations, ParkSentinel integrates unsupervised machine learning to filter noise and identify hidden risks.

### DBSCAN Spatial Validation
Because the H3 grid is arbitrary, a high-volume cell might just be scattered noise that happened to fall within the hexagon's boundaries. 
- **Methodology**: DBSCAN dynamically calculates search radii based on the standard deviation of geographic coordinates within the station (handling both dense urban centers and sparse suburbs). 
- **Result**: It independently searches for *actual* spatial density without grid bias. If a cell lacks genuine cluster density, it is flagged as unconfirmed.

### IsolationForest Anomaly Detection
The linear CIS formula heavily weights volume, which can overshadow low-volume but extreme-severity events (e.g., an emergency lane blocked consistently).
- **Methodology**: An IsolationForest model assesses the holistic profile of each hotspot against its peers within the same police station (accounting for severity, junction presence, and peak hours). For very small police stations (fewer than 8 hotspots), the system gracefully falls back to a standard deviation threshold.
- **Result**: It flags anomalies that "punch above their weight," creating an `ai_risk_flag` that surfaces emerging high-risk hotspots before they explode in volume.

## Architecture

### Offline Data Preprocessing (`preprocess.py`)
Because parsing hundreds of thousands of CSV rows in real-time is inefficient, the heavy lifting is done offline.
1. **Ingestion & Validation**: Reads the raw CSV via a fast PyArrow engine, parses JSON structures, converts timezones to IST, and filters out unapproved or out-of-bounds coordinates.
2. **Aggregation**: Bins millions of coordinates into H3 cells and computes aggregate statistics.
3. **ML Application**: Applies DBSCAN and IsolationForest scoring.
4. **Export**: Outputs lightweight, pre-computed JSON files—one per police station—along with a master `stations_index.json`.

### High-Performance Backend API (`backend/main.py`)
A lightweight, lightning-fast FastAPI server specifically designed to serve the precomputed JSONs to the frontend. It features hot-reloading (invalidating cache automatically when new JSONs are generated) and asynchronous non-blocking threadpools to handle high-throughput dashboard requests without touching a database.

### Interactive Dashboard Frontend (`frontend/`)
A React (Vite) + TypeScript application leveraging `react-leaflet` to render an interactive map. 
- Officers can dynamically toggle between Heatmap and Cluster views.
- Hotspots can be filtered by specific violation types.
- A priority sidebar sorts actionable intelligence in real-time.

## Technology Stack
- **Data Engineering**: Python, pandas, PyArrow, h3-py
- **Machine Learning**: scikit-learn, numpy
- **Backend**: FastAPI, Uvicorn
- **Frontend**: React 18, TypeScript, TailwindCSS, React-Leaflet, Recharts, Radix UI

## Code Structure Highlights
- `preprocess.py`: The heart of the data pipeline.
- `ml_intelligence.py`: Encapsulated scikit-learn models for validation.
- `backend/main.py`: The API gateway.
- `frontend/src/features/hotspots/`: Core React components governing map state and hotspot visualization.
