# Requirements Document

## Introduction

AI-Driven Parking Hotspot Intelligence is a web application designed for traffic police officers and urban planners participating in a Road Safety Hackathon. The system processes ~298,000 parking violation records (Jan–May 2026) to identify, score, and visualize illegal-parking hotspots by police station jurisdiction. Users can select a police station, explore hotspots on an interactive map, inspect detailed violation breakdowns, and consult a ranked table to prioritize enforcement activity — all backed by a computed Congestion Impact Score derived from violation density, severity, junction proximity, and peak-hour overlap.

---

## Glossary

- **System**: The AI-Driven Parking Hotspot Intelligence web application as a whole.
- **Preprocessor**: The offline Python pipeline that ingests the raw CSV, cleans it, bins violations into spatial cells, computes scores, and outputs per-station hotspot JSON files.
- **API_Server**: The FastAPI backend that serves precomputed hotspot data to the frontend.
- **Map_View**: The interactive Leaflet/React-Leaflet map component rendered in the browser.
- **Detail_Panel**: The side panel that shows full hotspot information when a marker is selected.
- **Ranked_List**: The sortable table view of hotspots for the selected police station.
- **Station_Selector**: The search-as-you-type dropdown that lets the user pick a police station.
- **Hotspot**: A spatial bin (grid cell or H3 hexagon, ~100–150 m resolution) that aggregates one or more parking violations within a police station's jurisdiction.
- **Congestion Impact Score (CIS)**: A computed numeric score per Hotspot that combines violation count, violation-type severity weights, junction proximity, and peak-hour overlap.
- **Peak Hours**: 08:00–11:00 IST and 17:00–20:00 IST.
- **IST**: Indian Standard Time, UTC+05:30.
- **Approved Record**: A violation record whose `validation_status` is `approved`.
- **Pending Record**: A violation record whose `validation_status` is `processing`.
- **Violation_Type**: A JSON-array-encoded string field listing one or more named violation categories for a single record (e.g., `["WRONG PARKING","PARKING IN A MAIN ROAD"]`).
- **Severity Weight**: A numeric multiplier assigned to each violation category that reflects its relative traffic-safety impact.

---

## Requirements

### Requirement 1: Data Ingestion and Validation

**User Story:** As a data engineer, I want the preprocessing pipeline to ingest and validate the raw CSV, so that only clean, relevant records feed into hotspot computation.

#### Acceptance Criteria

1. THE Preprocessor SHALL read the raw CSV file from a configurable file path specified via a command-line argument or environment variable.
2. WHEN the CSV is loaded, THE Preprocessor SHALL parse the `violation_type` and `offence_code` columns as JSON arrays, producing one list per record.
3. WHEN a `violation_type` or `offence_code` value cannot be parsed as a JSON array, THE Preprocessor SHALL log a warning with the record `id` and treat both fields as empty lists for that record.
4. WHEN records are loaded, THE Preprocessor SHALL convert the `created_datetime` column from UTC to IST (UTC+05:30) and store the result in a derived column named `created_datetime_ist`.
5. THE Preprocessor SHALL filter records so that only those with `validation_status` equal to `approved` are included in hotspot computation.
6. THE Preprocessor SHALL exclude records where `latitude` or `longitude` is null, zero, or outside the bounding box of India (latitude 6°N–37°N, longitude 68°E–98°E).
7. WHEN the input CSV contains fewer than 1,000 records after filtering, THE Preprocessor SHALL emit a warning to stderr indicating the low record count before continuing.

---

### Requirement 2: Spatial Binning

**User Story:** As a data engineer, I want violations spatially grouped into ~100–150 m resolution cells, so that nearby violations are aggregated into meaningful hotspots rather than treated as isolated points.

#### Acceptance Criteria

1. THE Preprocessor SHALL assign each filtered violation record to an H3 hexagon cell at resolution 9 (edge length ≈ 174 m) using the record's `latitude` and `longitude`.
2. THE Preprocessor SHALL group records by the combination of `police_station` and H3 cell index to produce one Hotspot entry per unique (station, cell) pair.
3. WHEN a Hotspot contains fewer than 2 violation records, THE Preprocessor SHALL omit it from the output so that isolated single incidents do not appear as hotspots.
4. THE Preprocessor SHALL compute the centroid latitude and longitude of each Hotspot as the mean of all member records' coordinates.

---

### Requirement 3: Congestion Impact Score Computation

**User Story:** As a traffic officer, I want each hotspot to carry a meaningful numeric score, so that I can objectively compare and prioritize enforcement locations.

#### Acceptance Criteria

1. THE Preprocessor SHALL compute the Congestion Impact Score (CIS) for each Hotspot using the formula:
   `CIS = (violation_count × weighted_severity_mean) × junction_factor × peak_hour_factor`
   where each sub-factor is defined in subsequent criteria.
2. THE Preprocessor SHALL compute `weighted_severity_mean` as the arithmetic mean of the Severity Weight values across all violation types present in the Hotspot's member records, where `WRONG PARKING` = 1.0, `PARKING IN A MAIN ROAD` = 1.5, `NO PARKING ZONE` = 1.5, `OBSTRUCTION TO TRAFFIC` = 2.0, `BLOCKING EMERGENCY ACCESS` = 3.0, and any unrecognized violation type = 1.0.
3. THE Preprocessor SHALL set `junction_factor` to 1.3 when the Hotspot contains at least one member record whose `junction_name` is not `"No Junction"`, and to 1.0 otherwise.
4. THE Preprocessor SHALL compute `peak_hour_factor` as `1.0 + (peak_fraction × 0.5)`, where `peak_fraction` is the proportion of member records whose `created_datetime_ist` hour falls within Peak Hours (08:00–10:59 or 17:00–19:59).
5. THE Preprocessor SHALL round the final CIS value to two decimal places.
6. THE Preprocessor SHALL normalize CIS values within each police station to a 0–100 scale and store the normalized value as `cis_normalized`, using min-max normalization per station. When a station has only one Hotspot, THE Preprocessor SHALL set `cis_normalized` to 100.

---

### Requirement 4: Preprocessor Output

**User Story:** As a backend developer, I want the preprocessor to emit compact, structured data files per police station, so that the API server can serve them quickly without re-running heavy computation.

#### Acceptance Criteria

1. THE Preprocessor SHALL write one JSON file per police station to a configurable output directory, with the filename derived from the station name by lowercasing and replacing spaces with underscores (e.g., `anna_nagar.json`).
2. WHEN writing output, THE Preprocessor SHALL include the following fields per Hotspot entry: `h3_index`, `latitude`, `longitude`, `violation_count`, `dominant_violation_types` (top 3 by frequency), `peak_hour_label` (the hour-of-day bin with the highest record count, expressed as a human-readable range such as `"08:00–09:00 IST"`), `cis`, `cis_normalized`, `junction_flag` (boolean), and `sample_address` (the most frequent non-null `location` value among member records, or `null` if all are null).
3. THE Preprocessor SHALL also write a `stations_index.json` file listing all station names with their output filename and bounding-box coordinates (min/max lat/lon of member hotspots).
4. WHEN an output file already exists, THE Preprocessor SHALL overwrite it without prompting.
5. THE Preprocessor SHALL log the count of hotspots written per station and total elapsed time upon completion.

---

### Requirement 5: API Server — Station and Hotspot Endpoints

**User Story:** As a frontend developer, I want a REST API that serves station metadata and hotspot data, so that the UI can query structured data without reading raw files directly.

#### Acceptance Criteria

1. THE API_Server SHALL expose a `GET /stations` endpoint that returns a JSON array of all station names and their bounding boxes, sourced from `stations_index.json`.
2. THE API_Server SHALL expose a `GET /hotspots/{station_name}` endpoint that accepts a URL-encoded station name and returns the corresponding hotspot JSON array for that station.
3. WHEN a request is made to `GET /hotspots/{station_name}` with a station name that does not exist in the index, THE API_Server SHALL respond with HTTP 404 and a JSON body `{"error": "Station not found"}`.
4. THE API_Server SHALL respond to `GET /stations` within 200 ms under a load of up to 10 concurrent requests on standard development hardware.
5. THE API_Server SHALL include CORS headers permitting requests from `http://localhost:3000` and any origin specified via an environment variable `ALLOWED_ORIGINS`.
6. WHEN the precomputed data directory is missing or unreadable at startup, THE API_Server SHALL log an error and exit with a non-zero status code.

---

### Requirement 6: Station Selector

**User Story:** As a traffic officer, I want to search for and select a police station from a dropdown, so that the map and list immediately focus on my jurisdiction.

#### Acceptance Criteria

1. THE Station_Selector SHALL display a text input and dropdown listing all 54 police stations fetched from the `GET /stations` endpoint on application load.
2. WHEN the user types at least 1 character into the Station_Selector, THE Station_Selector SHALL filter the visible options to those whose station name contains the typed string (case-insensitive) within 100 ms of the last keystroke.
3. WHEN the user selects a station from the dropdown, THE System SHALL fetch hotspot data for that station and update both the Map_View and Ranked_List within 1 second on a standard broadband connection.
4. WHILE hotspot data is loading, THE Station_Selector SHALL display a loading indicator and THE Map_View SHALL display a spinner overlay.
5. IF the `GET /stations` request fails, THEN THE Station_Selector SHALL display an error message `"Could not load stations. Please refresh."` and disable the input.

---

### Requirement 7: Map View

**User Story:** As a traffic officer, I want to see hotspots rendered on an interactive map scaled to my selected station, so that I can visually understand the geographic distribution of violations.

#### Acceptance Criteria

1. THE Map_View SHALL render an interactive tile-based map using React-Leaflet with OpenStreetMap tiles as the default base layer.
2. WHEN a station is selected, THE Map_View SHALL fit its viewport to the bounding box of the station's hotspots, adding a padding of at least 10% of the bounding box dimensions on each side.
3. THE Map_View SHALL render each Hotspot as a circular marker whose radius scales linearly between 8 px and 24 px based on `cis_normalized` (0 → 8 px, 100 → 24 px).
4. THE Map_View SHALL color each marker using a single-hue intensity ramp from amber (#F5A623) at `cis_normalized` = 0 to signal red (#C0392B) at `cis_normalized` = 100, with no use of green, blue, or purple tones.
5. WHEN a Hotspot marker is clicked, THE Map_View SHALL highlight that marker with a white outline stroke of 2 px and open the Detail_Panel for that Hotspot.
6. WHEN the total number of visible hotspots exceeds 200, THE Map_View SHALL cluster nearby markers using Leaflet.markercluster and display the cluster count.
7. IF hotspot data for the selected station is empty, THEN THE Map_View SHALL display a centered message `"No hotspots found for this station."` overlaid on the map.
8. THE Map_View SHALL allow standard pan and zoom interactions at all times.

---

### Requirement 8: Hotspot Detail Panel

**User Story:** As a traffic officer, I want to see detailed violation information for a selected hotspot, so that I can understand why it is high-priority before dispatching enforcement.

#### Acceptance Criteria

1. WHEN a Hotspot is selected, THE Detail_Panel SHALL display the Hotspot's `sample_address` (or coordinates if address is null), total `violation_count`, `cis` value, and `cis_normalized` value.
2. THE Detail_Panel SHALL list the top 3 `dominant_violation_types` for the selected Hotspot, each with its frequency count.
3. THE Detail_Panel SHALL display the `peak_hour_label` for the selected Hotspot.
4. THE Detail_Panel SHALL display a plain-English explanation of the CIS in the format: `"Score driven by [count] violations, [X]× severity weight, [junction/no junction], and [Y]% peak-hour overlap."` where values are substituted from the Hotspot's fields.
5. WHEN a different Hotspot is selected, THE Detail_Panel SHALL update its content within 100 ms without a full page reload.
6. THE Detail_Panel SHALL include a close/dismiss control that returns focus to the map without deselecting the station.

---

### Requirement 9: Ranked List View

**User Story:** As a traffic officer, I want a sortable table of hotspots ranked by Congestion Impact Score, so that I can quickly identify the top enforcement priorities without relying solely on the map.

#### Acceptance Criteria

1. THE Ranked_List SHALL display a table of all hotspots for the selected station with columns: Rank, Address/Location, Violation Count, Dominant Type, Peak Hour, and CIS (normalized).
2. THE Ranked_List SHALL default to sorting by `cis_normalized` descending so that the highest-priority hotspot appears first.
3. WHEN the user clicks a column header, THE Ranked_List SHALL toggle the sort order for that column (ascending / descending) within 100 ms.
4. WHEN the user clicks a row in the Ranked_List, THE Map_View SHALL pan and zoom to center on that Hotspot's coordinates and open the Detail_Panel for it.
5. THE Ranked_List SHALL visually highlight the row corresponding to the currently selected Hotspot on the map.
6. WHEN the station has more than 50 hotspots, THE Ranked_List SHALL paginate results at 50 rows per page and display current page and total page count.

---

### Requirement 10: Map and List Toggle (Responsive Layout)

**User Story:** As a traffic officer using a tablet, I want to switch between a full-screen map and a full-screen list, so that I can use the app effectively on smaller screens without horizontal scrolling.

#### Acceptance Criteria

1. THE System SHALL render the Map_View and Ranked_List side-by-side on screens with a viewport width of 1024 px or greater.
2. WHEN the viewport width is less than 1024 px, THE System SHALL render a toggle control that switches between Map_View-only and Ranked_List-only display.
3. WHEN the toggle is set to Map_View, THE System SHALL show the full-width map and hide the Ranked_List.
4. WHEN the toggle is set to Ranked_List, THE System SHALL show the full-width table and hide the Map_View.
5. THE System SHALL preserve the selected station and hotspot selection state when the user toggles between views.

---

### Requirement 11: Visual Design and Theming

**User Story:** As a hackathon judge, I want the application to present a cohesive, professional visual identity, so that the product conveys credibility and readability during demonstration.

#### Acceptance Criteria

1. THE System SHALL use a color palette restricted to: background `#F5F0E8` (warm off-white/cream), primary text `#2C2C2C` (asphalt charcoal), secondary surfaces `#E0DAD0` (concrete grey), accent/interactive `#F5A623` (warning amber), and high-severity indicator `#C0392B` (signal red). THE System SHALL NOT use green, blue, purple, or violet tones in any UI chrome, interactive element, or data visualization.
2. THE System SHALL use a condensed display typeface (e.g., Barlow Condensed or similar) for headings and station names, and a clean utilitarian typeface (e.g., IBM Plex Mono or Inter) for numeric data, labels, and table content.
3. THE Map_View SHALL occupy the dominant visual area of the layout, with all chrome (header, Station_Selector, Detail_Panel, Ranked_List) positioned in quieter peripheral zones that do not overlay the map unless explicitly triggered.
4. THE Detail_Panel SHALL slide in from the right side of the map area on desktop and from the bottom on mobile, using a CSS transition of 200 ms or less.
5. ALL interactive controls (buttons, rows, dropdown items) SHALL display a visible amber-toned focus indicator meeting WCAG 2.1 AA contrast requirements (minimum 3:1 contrast ratio against adjacent background).

---

### Requirement 12: Loading and Error States

**User Story:** As a traffic officer, I want the application to communicate clearly when data is unavailable or loading, so that I am never confused about whether the app is working.

#### Acceptance Criteria

1. WHILE the application initializes and fetches the station list, THE System SHALL display a full-screen loading state with a spinner and the text `"Loading station data…"`.
2. WHILE hotspot data for a selected station is loading, THE Map_View SHALL display a semi-transparent spinner overlay and THE Ranked_List SHALL show a skeleton loading placeholder.
3. IF an API request fails with a network error or HTTP 5xx response, THEN THE System SHALL display an inline error message adjacent to the affected component with the text `"Data unavailable. Please try again."` and a retry button.
4. WHEN a retry button is activated, THE System SHALL re-issue the failed request.
5. IF the selected station has zero hotspots after a successful data fetch, THEN THE System SHALL display `"No hotspots found for [Station Name]."` in both the Map_View overlay and as the sole Ranked_List row.

---

### Requirement 13: Preprocessing CLI and Reproducibility

**User Story:** As a developer setting up the project, I want a single command to regenerate all hotspot JSON from the raw CSV, so that the preprocessing step is reproducible and transparent.

#### Acceptance Criteria

1. THE Preprocessor SHALL be executable as a standalone Python script via `python preprocess.py --input <csv_path> --output <dir_path>`.
2. WHEN the `--help` flag is passed, THE Preprocessor SHALL print a usage summary describing all available arguments and exit with code 0.
3. THE Preprocessor SHALL accept an optional `--min-violations <N>` argument (default: 2) that overrides the minimum number of violations required to include a cell as a Hotspot.
4. THE Preprocessor SHALL complete processing of the full 298,000-record CSV in under 10 minutes on a machine with 8 GB RAM and a 4-core CPU.
5. THE Preprocessor SHALL be idempotent: running it twice with the same inputs SHALL produce byte-identical output JSON files.
