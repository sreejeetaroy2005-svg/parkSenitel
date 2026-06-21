"""
preprocess.py — AI-Driven Parking Hotspot Intelligence
Offline preprocessing pipeline: ingests the raw violations CSV, bins records
into H3 hexagons, computes Congestion Impact Scores, and writes one JSON file
per police station to a configurable output directory.

Usage:
    python preprocess.py --input <csv_path> --output <dir_path> [--min-violations N]
"""

# ---------------------------------------------------------------------------
# Standard library imports
# ---------------------------------------------------------------------------
import argparse
import json
import logging
import os
import sys
import time
import warnings
from datetime import timedelta
from typing import Any, TypedDict

# ---------------------------------------------------------------------------
# Third-party imports
# ---------------------------------------------------------------------------
import pandas as pd
import h3  # noqa: F401  (h3-py — used for spatial binning)
import pyarrow  # noqa: F401  (referenced for fast CSV engine: engine="pyarrow")

from ml_intelligence import validate_hotspots_dbscan, compute_anomaly_flags

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Severity weights per violation type (Requirement 3.2).
# Any unrecognised violation type defaults to 1.0.
SEVERITY_WEIGHTS: dict[str, float] = {
    "WRONG PARKING": 1.0,
    "PARKING IN A MAIN ROAD": 1.5,
    "NO PARKING ZONE": 1.5,
    "OBSTRUCTION TO TRAFFIC": 2.0,
    "BLOCKING EMERGENCY ACCESS": 3.0,
}

# Geographic bounding box for India (Requirement 1.6).
# Records outside this box are excluded from hotspot computation.
INDIA_BBOX: dict[str, float] = {
    "min_lat": 6.0,
    "max_lat": 37.0,
    "min_lon": 68.0,
    "max_lon": 98.0,
}

# IST is UTC+05:30 (Requirement 1.4).
IST_OFFSET: timedelta = timedelta(hours=5, minutes=30)

# ---------------------------------------------------------------------------
# TypedDict definitions
# ---------------------------------------------------------------------------


class HotspotRecord(TypedDict):
    """Shape of a single hotspot entry written to each per-station JSON file.

    Corresponds to the output fields defined in Requirement 4.2.
    """

    h3_index: str                          # H3 cell index at resolution 9
    latitude: float                        # Centroid latitude (mean of members)
    longitude: float                       # Centroid longitude (mean of members)
    violation_count: int                   # Total number of member records
    dominant_violation_types: list         # Top-3 violation types [{type, count}, ...]
    peak_hour_label: str                   # e.g. "08:00–09:00 IST"
    cis: float                             # Raw Congestion Impact Score (2 d.p.)
    cis_normalized: float                  # Min-max normalised CIS per station (0–100)
    global_cis_normalized: float           # Min-max normalised CIS across all stations (0–100)
    junction_flag: bool                    # True if any member has a real junction
    sample_address: "str | None"           # Most-frequent non-null location, or None
    ai_cluster_validated: bool             # True if confirmed by DBSCAN
    ai_anomaly_score: float                # IsolationForest decision function score
    ai_risk_flag: bool                     # True if IsolationForest flagged as anomaly


class StationIndexEntry(TypedDict):
    """Shape of a single entry in stations_index.json (Requirement 4.3)."""

    name: str       # Human-readable station name
    filename: str   # Output filename, e.g. "anna_nagar.json"
    bbox: dict      # {min_lat, max_lat, min_lon, max_lon} of member hotspots


# ---------------------------------------------------------------------------
# Severity helper functions (Requirement 3.2)
# ---------------------------------------------------------------------------


def get_severity_weight(violation_type: str) -> float:
    """Return the severity weight for a given violation type.

    Looks up *violation_type* in ``SEVERITY_WEIGHTS``. If the type is not
    recognised, returns the default weight of 1.0.

    Args:
        violation_type: A violation category string, e.g. ``"WRONG PARKING"``.

    Returns:
        The severity weight as a float (≥ 1.0, ≤ 3.0 for known types; 1.0
        for unknown types).
    """
    return SEVERITY_WEIGHTS.get(violation_type, 1.0)


def compute_weighted_severity_mean(types: list[str]) -> float:
    """Return the arithmetic mean of severity weights for a list of violation types.

    Each element of *types* is passed through :func:`get_severity_weight`.
    Duplicate entries are included individually in the mean computation (they
    represent real, repeated violations).

    If *types* is empty, returns the default weight of 1.0.

    Args:
        types: A flat list of violation type strings (may contain duplicates).

    Returns:
        The mean severity weight as a float.  Always in [1.0, 3.0].
    """
    if not types:
        return 1.0
    weights = [get_severity_weight(t) for t in types]
    return sum(weights) / len(weights)


# ---------------------------------------------------------------------------
# Pipeline functions
# ---------------------------------------------------------------------------


def load_and_validate(csv_path: str, min_violations: int) -> pd.DataFrame:
    """Read, clean, and validate the raw violations CSV.

    Steps:
    1. Read the CSV using pandas with engine="pyarrow" for speed (Req 1.1).
    2. Parse ``violation_type`` and ``offence_code`` columns as JSON arrays
       per record. On parse error, log a warning with the record ``id`` and
       treat both fields as empty lists (Req 1.2, 1.3).
    3. Convert ``created_datetime`` from UTC to IST (UTC+05:30) by adding
       ``IST_OFFSET``; store in new column ``created_datetime_ist``.  Handles
       both timezone-naive and timezone-aware inputs (Req 1.4).
    4. Filter to keep only records where ``validation_status == "approved"``
       (Req 1.5).
    5. Drop records where ``latitude`` or ``longitude`` is null, zero, or
       outside the India bounding box (Req 1.6).
    6. Emit a ``warnings.warn()`` to stderr if fewer than 1 000 records remain
       after filtering (Req 1.7).

    Args:
        csv_path: Path to the input CSV file.
        min_violations: Minimum violation count threshold (passed through for
            context; the actual threshold enforcement happens in
            ``bin_hotspots``).

    Returns:
        A cleaned ``pd.DataFrame`` ready for H3 assignment.
    """
    # ------------------------------------------------------------------
    # Step 1: Read CSV with pyarrow engine (Requirement 1.1)
    # ------------------------------------------------------------------
    logger.info("Reading CSV: %s", csv_path)
    df = pd.read_csv(csv_path, engine="pyarrow")
    logger.info("Loaded %d raw records", len(df))

    # ------------------------------------------------------------------
    # Step 2 & 3: Parse JSON columns (Requirements 1.2, 1.3)
    # ------------------------------------------------------------------
    def _parse_json_columns(row: "pd.Series") -> "pd.Series":
        """Parse violation_type and offence_code for a single row."""
        parsed_vt: list = []
        parsed_oc: list = []
        parse_error = False

        for col_name in ("violation_type", "offence_code"):
            raw = row.get(col_name)
            try:
                if pd.isna(raw) or raw == "":
                    result: list = []
                else:
                    result = json.loads(raw)
                    if not isinstance(result, list):
                        result = [result]
            except (json.JSONDecodeError, TypeError, ValueError):
                parse_error = True
                result = []

            if col_name == "violation_type":
                parsed_vt = result
            else:
                parsed_oc = result

        if parse_error:
            record_id = row.get("id", "<unknown>")
            logger.warning(
                "JSON parse error for record id=%s; treating violation_type "
                "and offence_code as empty lists.",
                record_id,
            )
            # On any parse error, treat *both* fields as empty per spec
            parsed_vt = []
            parsed_oc = []

        return pd.Series({"violation_type": parsed_vt, "offence_code": parsed_oc})

    logger.info("Parsing JSON columns (violation_type, offence_code)…")
    parsed_cols = df.apply(_parse_json_columns, axis=1)
    df["violation_type"] = parsed_cols["violation_type"]
    df["offence_code"] = parsed_cols["offence_code"]

    # ------------------------------------------------------------------
    # Step 4: UTC → IST conversion (Requirement 1.4)
    # ------------------------------------------------------------------
    logger.info("Converting created_datetime UTC → IST…")
    dt_series = pd.to_datetime(df["created_datetime"], errors="coerce", utc=False)

    # If the column has mixed awareness, coerce timezone-aware to naive UTC
    if hasattr(dt_series.dtype, "tz") and dt_series.dtype.tz is not None:
        # Column is timezone-aware — convert to UTC-naive first
        dt_series = dt_series.dt.tz_convert("UTC").dt.tz_localize(None)
    else:
        # Column is timezone-naive — assume values are already in UTC
        pass

    df["created_datetime_ist"] = dt_series + IST_OFFSET

    # ------------------------------------------------------------------
    # Step 5: Filter approved records (Requirement 1.5)
    # ------------------------------------------------------------------
    before = len(df)
    df = df[df["validation_status"] == "approved"].copy()
    logger.info(
        "After approved filter: %d records (dropped %d)", len(df), before - len(df)
    )

    # ------------------------------------------------------------------
    # Step 6: Drop invalid / out-of-bbox coordinates (Requirement 1.6)
    # ------------------------------------------------------------------
    before = len(df)

    # Cast to numeric, coercing non-numeric values to NaN
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    valid_coords = (
        df["latitude"].notna()
        & df["longitude"].notna()
        & (df["latitude"] != 0)
        & (df["longitude"] != 0)
        & (df["latitude"] >= INDIA_BBOX["min_lat"])
        & (df["latitude"] <= INDIA_BBOX["max_lat"])
        & (df["longitude"] >= INDIA_BBOX["min_lon"])
        & (df["longitude"] <= INDIA_BBOX["max_lon"])
    )
    df = df[valid_coords].copy()
    logger.info(
        "After coordinate filter: %d records (dropped %d)", len(df), before - len(df)
    )

    # ------------------------------------------------------------------
    # Step 7: Warn if fewer than 1 000 records remain (Requirement 1.7)
    # ------------------------------------------------------------------
    if len(df) < 1000:
        warnings.warn(
            f"Only {len(df)} records remain after filtering (expected ≥ 1 000). "
            "Hotspot results may be unreliable.",
            stacklevel=2,
        )

    logger.info("load_and_validate complete: %d clean records", len(df))
    return df


def assign_h3(df: pd.DataFrame) -> pd.DataFrame:
    """Assign each record to an H3 hexagon cell at resolution 9.

    Iterates over the DataFrame rows, calling ``h3.geo_to_h3(lat, lng, 9)``
    (h3-py 3.x API) for each record.  On any H3 encoding failure the row is
    logged as a warning and excluded from the returned DataFrame.

    Args:
        df: A cleaned DataFrame that contains numeric ``latitude`` and
            ``longitude`` columns (already validated by
            :func:`load_and_validate`).

    Returns:
        A copy of *df* with a new ``h3_index`` column (str) containing the H3
        cell index at resolution 9.  Rows that could not be encoded are
        dropped from the returned DataFrame.

    Notes:
        The implementation uses ``Series.apply`` with a per-row try/except so
        that a single bad coordinate cannot silently corrupt neighbouring rows.
        Failed rows are collected and dropped in a single pass after the apply
        completes.
    """
    H3_RESOLUTION = 9
    _SENTINEL = None  # marks rows that failed encoding

    def _encode(row: pd.Series) -> "str | None":
        try:
            return h3.latlng_to_cell(row["latitude"], row["longitude"], H3_RESOLUTION)
        except Exception as exc:  # noqa: BLE001
            record_id = row.get("id", "<unknown>")
            logger.warning(
                "H3 encoding failure for record id=%s (lat=%s, lon=%s): %s — skipping.",
                record_id,
                row.get("latitude"),
                row.get("longitude"),
                exc,
            )
            return _SENTINEL

    df = df.copy()
    df["h3_index"] = df.apply(_encode, axis=1)

    failed_count = df["h3_index"].isna().sum()
    if failed_count:
        logger.warning("Dropping %d record(s) due to H3 encoding failures.", failed_count)
        df = df[df["h3_index"].notna()].copy()

    logger.info("assign_h3 complete: %d records assigned to H3 cells.", len(df))
    return df


def bin_hotspots(df: pd.DataFrame, min_violations: int) -> pd.DataFrame:
    """Group violations by (police_station, h3_index), filter small groups, add centroid.

    Steps:
    1. Group the DataFrame by (``police_station``, ``h3_index``).
    2. Drop any group whose record count is < *min_violations* (Requirement 2.3).
    3. For each surviving group, compute centroid latitude and longitude as the
       arithmetic mean of the member latitudes/longitudes (Requirement 2.4).
    4. Return a flat DataFrame of all surviving individual rows, with two extra
       columns: ``centroid_lat`` and ``centroid_lon`` (the group mean). All
       original columns are preserved so later stages (``compute_cis``,
       ``build_hotspot_record``) can access every field.

    Args:
        df: A DataFrame that contains at minimum the columns ``police_station``,
            ``h3_index``, ``latitude``, and ``longitude``.  Produced by
            :func:`assign_h3`.
        min_violations: Minimum number of violation records a (station, cell)
            group must contain to survive.  Groups with fewer records are
            silently discarded.

    Returns:
        A copy of *df* containing only rows that belong to groups meeting the
        threshold, with ``centroid_lat`` and ``centroid_lon`` columns appended.
    """
    if df.empty:
        result = df.copy()
        result["centroid_lat"] = pd.Series(dtype=float)
        result["centroid_lon"] = pd.Series(dtype=float)
        return result

    group_keys = ["police_station", "h3_index"]

    # Step 2: keep only groups with at least min_violations records
    filtered = df.groupby(group_keys, group_keys=False).filter(
        lambda g: len(g) >= min_violations
    )

    if filtered.empty:
        result = filtered.copy()
        result["centroid_lat"] = pd.Series(dtype=float)
        result["centroid_lon"] = pd.Series(dtype=float)
        return result

    # Step 3: compute centroid lat/lon as group mean and broadcast back to rows
    group_means = (
        filtered.groupby(group_keys)[["latitude", "longitude"]]
        .transform("mean")
    )
    filtered = filtered.copy()
    filtered["centroid_lat"] = group_means["latitude"]
    filtered["centroid_lon"] = group_means["longitude"]

    logger.info(
        "bin_hotspots: %d records in %d (station, cell) bins after min_violations=%d filter.",
        len(filtered),
        filtered.groupby(group_keys).ngroups,
        min_violations,
    )
    return filtered


def compute_cis(group_df: pd.DataFrame, peak_hours: "set[int] | None" = None) -> dict:
    """Compute the Congestion Impact Score and associated metadata for one hotspot group.

    Receives a group DataFrame — all rows sharing the same
    (police_station, h3_index) combination — and returns a dict that captures
    every field needed by ``build_hotspot_record`` that relates to CIS computation
    and summary statistics.

    Returned keys
    -------------
    junction_factor : float
        1.3 if any row has ``junction_name != "No Junction"``, else 1.0
        (Requirement 3.3).
    peak_hour_factor : float
        ``1.0 + (peak_fraction * 0.5)`` where ``peak_fraction`` is the
        proportion of rows whose IST hour falls in 08–10 or 17–19
        (Requirement 3.4).
    weighted_severity_mean : float
        Arithmetic mean of all severity weights across every violation type
        in all member records (Requirement 3.2).
    cis : float
        ``round((violation_count * weighted_severity_mean)
               * junction_factor * peak_hour_factor, 2)``
        (Requirements 3.1, 3.5).
    junction_flag : bool
        ``True`` when ``junction_factor == 1.3``.
    peak_hour_label : str
        The hour-of-day bin with the highest record count expressed as
        ``"HH:00–HH+1:00 IST"`` (e.g. ``"08:00–09:00 IST"``).
    dominant_violation_types : list[dict]
        Top-3 violation types by frequency, each as
        ``{"type": str, "count": int}`` (Requirement 4.2).
    sample_address : str | None
        Most-frequent non-null value in the ``location`` column, or ``None``
        if all values are null / empty (Requirement 4.2).

    Args:
        group_df: A non-empty DataFrame slice representing one hotspot group.
                  Expected columns: ``junction_name``, ``created_datetime_ist``,
                  ``violation_type`` (each cell is a list[str]), ``location``.

    Returns:
        A dict with the keys described above.
    """
    total_rows = len(group_df)

    # ------------------------------------------------------------------
    # 1. junction_factor  (Requirement 3.3)
    # ------------------------------------------------------------------
    if "junction_name" in group_df.columns:
        has_junction = group_df["junction_name"].apply(
            lambda v: bool(v) and str(v) != "No Junction"
        ).any()
    else:
        has_junction = False

    junction_factor: float = 1.3 if has_junction else 1.0
    junction_flag: bool = junction_factor == 1.3

    # ------------------------------------------------------------------
    # 2. peak_hour_factor  (Requirement 3.4)
    #    Peak hours: Dynamic based on most active hours
    # ------------------------------------------------------------------
    if "created_datetime_ist" in group_df.columns:
        ist_hours: pd.Series = pd.to_datetime(
            group_df["created_datetime_ist"], errors="coerce"
        ).dt.hour

        if peak_hours is not None and len(peak_hours) > 0:
            peak_mask = ist_hours.isin(peak_hours)
        else:
            peak_mask = ist_hours.isin([8, 9, 10, 17, 18, 19])
            
        peak_fraction: float = float(peak_mask.sum()) / total_rows
    else:
        ist_hours = pd.Series(dtype=int)
        peak_fraction = 0.0

    peak_hour_factor: float = 1.0 + (peak_fraction * 0.5)

    # ------------------------------------------------------------------
    # 3. peak_hour_label  (Requirement 4.2)
    #    The hour-of-day bin with the highest record count.
    # ------------------------------------------------------------------
    if ist_hours.empty or ist_hours.isna().all():
        peak_hour_label: str = "00:00–01:00 IST"
    else:
        mode_hour: int = int(ist_hours.dropna().mode().iloc[0])
        peak_hour_label = f"{mode_hour:02d}:00–{mode_hour + 1:02d}:00 IST"

    # ------------------------------------------------------------------
    # 4. weighted_severity_mean  (Requirement 3.2)
    #    Flatten all violation_type lists across all rows, then compute mean.
    # ------------------------------------------------------------------
    if "violation_type" in group_df.columns:
        all_types: list[str] = []
        for vt in group_df["violation_type"]:
            if isinstance(vt, list):
                all_types.extend(vt)
    else:
        all_types = []

    weighted_severity_mean: float = compute_weighted_severity_mean(all_types)

    # ------------------------------------------------------------------
    # 5. CIS  (Requirements 3.1, 3.5)
    # ------------------------------------------------------------------
    cis: float = round(
        (total_rows * weighted_severity_mean) * junction_factor * peak_hour_factor,
        2,
    )

    # ------------------------------------------------------------------
    # 6. dominant_violation_types  (Requirement 4.2)
    #    Top-3 violation types by frequency across all member records.
    # ------------------------------------------------------------------
    if all_types:
        from collections import Counter
        type_counts = Counter(all_types)
        dominant_violation_types: list[dict] = [
            {"type": vtype, "count": count}
            for vtype, count in type_counts.most_common(3)
        ]
    else:
        dominant_violation_types = []

    # ------------------------------------------------------------------
    # 7. sample_address  (Requirement 4.2)
    #    Most-frequent non-null, non-empty value in the ``location`` column.
    # ------------------------------------------------------------------
    sample_address: "str | None" = None
    if "location" in group_df.columns:
        non_null_locations = group_df["location"].dropna()
        non_null_locations = non_null_locations[non_null_locations.astype(str).str.strip() != ""]
        if not non_null_locations.empty:
            sample_address = str(non_null_locations.mode().iloc[0])

    return {
        "junction_factor": junction_factor,
        "peak_hour_factor": peak_hour_factor,
        "weighted_severity_mean": weighted_severity_mean,
        "cis": cis,
        "junction_flag": junction_flag,
        "peak_hour_label": peak_hour_label,
        "dominant_violation_types": dominant_violation_types,
        "sample_address": sample_address,
    }


def normalize_cis(station_df: pd.DataFrame) -> pd.DataFrame:
    """Normalize CIS values within each police station to a 0–100 scale.

    Performs min-max normalization per ``police_station`` group and stores the
    result in a new column ``cis_normalized``.

    Formula (Requirement 3.6):
        ``cis_normalized = (cis - min_cis) / (max_cis - min_cis) * 100``

    Edge case — single hotspot per station:
        When a station has only one hotspot, ``min_cis == max_cis`` and the
        denominator is zero.  In this case ``cis_normalized`` is set to the
        sentinel value ``100.0`` (Requirement 3.6).

    Args:
        station_df: A DataFrame where each row represents one hotspot.  Must
            contain a ``police_station`` column and a ``cis`` column.

    Returns:
        A copy of *station_df* with a new ``cis_normalized`` column (float).
        The original DataFrame is not mutated.
    """
    df = station_df.copy()

    def _minmax(series: pd.Series) -> pd.Series:
        min_val = series.min()
        max_val = series.max()
        if max_val == min_val:
            # Single-hotspot sentinel (or all CIS values identical within station)
            return pd.Series(100.0, index=series.index)
        return (series - min_val) / (max_val - min_val) * 100.0

    df["cis_normalized"] = df.groupby("police_station")["cis"].transform(_minmax)
    
    # Global normalization
    global_min = df["cis"].min()
    global_max = df["cis"].max()
    if global_max == global_min:
        df["global_cis_normalized"] = 100.0
    else:
        df["global_cis_normalized"] = (df["cis"] - global_min) / (global_max - global_min) * 100.0
        
    return df


def build_hotspot_record(group_df: pd.DataFrame, cis_row: dict) -> HotspotRecord:
    """Assemble the final output dict for one hotspot from its group DataFrame and CIS dict.

    Combines raw group data with the precomputed CIS metrics to produce a
    ``HotspotRecord`` that is ready to be serialised to JSON.

    Args:
        group_df: The group DataFrame slice containing all rows for a single
            (police_station, h3_index) pair.  Must have the columns
            ``h3_index``, ``centroid_lat``, and ``centroid_lon`` added by
            :func:`bin_hotspots`.
        cis_row: The dict returned by :func:`compute_cis` *plus* the
            ``cis_normalized`` key populated by :func:`normalize_cis`.

    Returns:
        A :class:`HotspotRecord` TypedDict with the following fields
        (Requirement 4.2):

        - ``h3_index``                — H3 cell index string
        - ``latitude``                — centroid latitude (mean of member coords)
        - ``longitude``               — centroid longitude (mean of member coords)
        - ``violation_count``         — total number of member records
        - ``dominant_violation_types``— top-3 violation types by frequency
        - ``peak_hour_label``         — hour-of-day bin with the most records
        - ``cis``                     — raw CIS rounded to 2 d.p.
        - ``cis_normalized``          — min-max normalised CIS for the station (0–100)
        - ``junction_flag``           — True if any member has a real junction
        - ``sample_address``          — most-frequent non-null location, or None
        - ``ai_cluster_validated``    — DBSCAN validation result
        - ``ai_anomaly_score``        — IsolationForest score
        - ``ai_risk_flag``            — IsolationForest anomaly flag
    """
    return HotspotRecord(
        h3_index=group_df["h3_index"].iloc[0],
        latitude=group_df["centroid_lat"].iloc[0],
        longitude=group_df["centroid_lon"].iloc[0],
        violation_count=len(group_df),
        dominant_violation_types=cis_row["dominant_violation_types"],
        peak_hour_label=cis_row["peak_hour_label"],
        cis=cis_row["cis"],
        cis_normalized=cis_row["cis_normalized"],
        global_cis_normalized=cis_row.get("global_cis_normalized", 0.0),
        junction_flag=cis_row["junction_flag"],
        sample_address=cis_row["sample_address"],
        ai_cluster_validated=cis_row.get("ai_cluster_validated", False),
        ai_anomaly_score=cis_row.get("ai_anomaly_score", 0.0),
        ai_risk_flag=cis_row.get("ai_risk_flag", False),
    )


def write_outputs(hotspots_by_station: dict, output_dir: str) -> None:
    """Write per-station JSON files and a stations_index.json to *output_dir*.

    For each station in *hotspots_by_station*:
    - Derives a filename by lowercasing the station name and replacing spaces
      with underscores, then appending ``.json`` (Requirement 4.1).
    - Writes the list of :class:`HotspotRecord` dicts to
      ``{output_dir}/{filename}.json`` using ``json.dump`` with
      ``indent=2, ensure_ascii=False`` (Requirement 4.4).

    Additionally writes ``stations_index.json`` to *output_dir*, containing a
    list of :class:`StationIndexEntry` dicts — one per station — each carrying:
    - ``name``: the human-readable station name
    - ``filename``: the derived JSON filename (e.g. ``"anna_nagar.json"``)
    - ``bbox``: ``{min_lat, max_lat, min_lon, max_lon}`` computed from the
      min/max latitude/longitude of all hotspots in that station
      (Requirement 4.3).

    Logs the count of hotspots written for each station and the total elapsed
    wall-clock time upon completion (Requirement 4.5).

    Args:
        hotspots_by_station: Mapping of ``station_name -> list[HotspotRecord]``.
        output_dir: Path to the directory where output files are written.
            Created if it does not already exist (Requirement 4.4 — overwrite
            without prompting).
    """
    t0 = time.time()

    # Requirement 4.4: create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    index_entries: list[StationIndexEntry] = []

    for station_name, hotspots in hotspots_by_station.items():
        # Requirement 4.1: derive filename
        filename = station_name.lower().replace(" ", "_") + ".json"
        out_path = os.path.join(output_dir, filename)

        # Requirement 4.4: write JSON with stable formatting (indent=2, ensure_ascii=False)
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(hotspots, fh, indent=2, ensure_ascii=False)

        # Requirement 4.5: log per-station count
        logger.info("Wrote %d hotspot(s) for station '%s' → %s", len(hotspots), station_name, filename)

        # Requirement 4.3: compute bbox from hotspot lat/lon values
        if hotspots:
            lats = [h["latitude"] for h in hotspots]
            lons = [h["longitude"] for h in hotspots]
            bbox: dict[str, float] = {
                "min_lat": min(lats),
                "max_lat": max(lats),
                "min_lon": min(lons),
                "max_lon": max(lons),
            }
        else:
            bbox = {"min_lat": 0.0, "max_lat": 0.0, "min_lon": 0.0, "max_lon": 0.0}

        index_entries.append(
            StationIndexEntry(name=station_name, filename=filename, bbox=bbox)
        )

    # Write stations_index.json (Requirement 4.3)
    index_path = os.path.join(output_dir, "stations_index.json")
    with open(index_path, "w", encoding="utf-8") as fh:
        json.dump(index_entries, fh, indent=2, ensure_ascii=False)

    elapsed = time.time() - t0
    total_hotspots = sum(len(v) for v in hotspots_by_station.values())
    logger.info(
        "write_outputs complete: %d station(s), %d total hotspot(s), elapsed %.2f s",
        len(hotspots_by_station),
        total_hotspots,
        elapsed,
    )


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


def main() -> None:
    """CLI entry point — orchestrates all pipeline stages.

    Usage:
        python preprocess.py --input <csv_path> --output <dir_path> [--min-violations N]

    Stages (in order):
        1. load_and_validate  — read CSV, parse JSON columns, convert UTC→IST, filter approved
        2. assign_h3          — bin each record into an H3 cell at resolution 9
        3. bin_hotspots       — group by (station, cell), drop cells below min_violations
        3a. validate_hotspots_dbscan — check if clusters are dense
        4. Per-station loop   — compute_cis for each (station, cell) group
        5. normalize_cis      — min-max scale CIS to 0–100 within each station
        5a. compute_anomaly_flags — use IsolationForest to find emerging risks
        6. build_hotspot_record — assemble final output dicts
        7. write_outputs      — write per-station JSON + stations_index.json
    """
    parser = argparse.ArgumentParser(
        description="AI-Driven Parking Hotspot Preprocessor — build hotspot JSON from raw violations CSV.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input",
        required=True,
        metavar="CSV_PATH",
        help="Path to the raw violations CSV file (~110 MB).",
    )
    parser.add_argument(
        "--output",
        required=True,
        metavar="OUTPUT_DIR",
        help="Directory where per-station JSON files and stations_index.json are written.",
    )
    parser.add_argument(
        "--min-violations",
        type=int,
        default=3,
        metavar="N",
        help="Minimum violations per H3 cell to be included as a hotspot (default: 3).",
    )
    args = parser.parse_args()

    t_total = time.time()
    logger.info(
        "=== Parking Hotspot Preprocessor starting — input=%s, output=%s, min_violations=%d ===",
        args.input,
        args.output,
        args.min_violations,
    )

    # ------------------------------------------------------------------
    # Stage 1: load and validate
    # ------------------------------------------------------------------
    df = load_and_validate(args.input, args.min_violations)

    # ------------------------------------------------------------------
    # Stage 2: assign H3 cells
    # ------------------------------------------------------------------
    df = assign_h3(df)

    # ------------------------------------------------------------------
    # Stage 3: bin into (station, cell) groups, drop small cells
    # ------------------------------------------------------------------
    df = bin_hotspots(df, args.min_violations)

    if df.empty:
        logger.warning(
            "No hotspot groups survived the min_violations=%d filter. "
            "Try lowering --min-violations.",
            args.min_violations,
        )
        write_outputs({}, args.output)
        return

    # ------------------------------------------------------------------
    # Stage 3a: DBSCAN Validation
    # ------------------------------------------------------------------
    logger.info("Running DBSCAN validation…")
    cluster_validation = validate_hotspots_dbscan(df, min_samples=args.min_violations)

    # ------------------------------------------------------------------
    # Stage 3b: Compute dynamic peak hours per station
    # ------------------------------------------------------------------
    logger.info("Computing dynamic peak hours per station…")
    station_peak_hours = {}
    if "created_datetime_ist" in df.columns:
        # Create hour_ist series for faster computation without modifying df
        hour_ist = pd.to_datetime(df["created_datetime_ist"], errors="coerce").dt.hour
        for station, group in df.groupby("police_station"):
            hours = hour_ist.loc[group.index].dropna()
            if not hours.empty:
                top_hours = hours.value_counts().nlargest(6).index.tolist()
                station_peak_hours[station] = set(top_hours)
            else:
                station_peak_hours[station] = set()

    # ------------------------------------------------------------------
    # Stage 4: per-(station, cell) group — compute CIS metrics
    # ------------------------------------------------------------------
    group_keys = ["police_station", "h3_index"]
    grouped = df.groupby(group_keys)

    # Build a flat DataFrame of CIS metric rows — one row per (station, cell) group
    cis_records: list[dict] = []
    logger.info("Computing CIS for %d (station, cell) groups…", grouped.ngroups)

    try:
        from tqdm import tqdm  # type: ignore
        groups_iter = tqdm(grouped, total=grouped.ngroups, desc="CIS computation", unit="cell")
    except ImportError:
        groups_iter = grouped  # tqdm optional

    for (station, h3_idx), group in groups_iter:
        peak_hrs = station_peak_hours.get(station)
        cis_dict = compute_cis(group, peak_hours=peak_hrs)
        cis_dict["police_station"] = station
        cis_dict["h3_index"] = h3_idx
        # Store centroid from the group (already broadcast by bin_hotspots)
        cis_dict["centroid_lat"] = float(group["centroid_lat"].iloc[0])
        cis_dict["centroid_lon"] = float(group["centroid_lon"].iloc[0])
        cis_dict["violation_count"] = len(group)
        cis_dict["ai_cluster_validated"] = cluster_validation.get((str(station), str(h3_idx)), False)
        cis_records.append(cis_dict)

    cis_df = pd.DataFrame(cis_records)

    # ------------------------------------------------------------------
    # Stage 5: normalize CIS within each station (0–100)
    # ------------------------------------------------------------------
    cis_df = normalize_cis(cis_df)

    # ------------------------------------------------------------------
    # Stage 5a: IsolationForest Anomaly Detection
    # ------------------------------------------------------------------
    logger.info("Running IsolationForest anomaly detection…")
    cis_df = compute_anomaly_flags(cis_df)

    # ------------------------------------------------------------------
    # Stage 6: build HotspotRecord dicts, grouped by station
    # ------------------------------------------------------------------
    hotspots_by_station: dict[str, list] = {}
    for _, cis_row in cis_df.iterrows():
        station = str(cis_row["police_station"])
        h3_idx = str(cis_row["h3_index"])

        # Retrieve the original group rows for build_hotspot_record
        group = df[
            (df["police_station"] == station) & (df["h3_index"] == h3_idx)
        ]

        record = build_hotspot_record(group, cis_row.to_dict())

        if station not in hotspots_by_station:
            hotspots_by_station[station] = []
        hotspots_by_station[station].append(record)

    # Sort each station's hotspots by CIS descending (highest priority first)
    for station in hotspots_by_station:
        hotspots_by_station[station].sort(key=lambda h: h["cis"], reverse=True)

    # ------------------------------------------------------------------
    # Stage 7: write outputs
    # ------------------------------------------------------------------
    write_outputs(hotspots_by_station, args.output)

    elapsed = time.time() - t_total
    logger.info(
        "=== Preprocessing complete: %d stations, %.2f s total ===",
        len(hotspots_by_station),
        elapsed,
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    main()
