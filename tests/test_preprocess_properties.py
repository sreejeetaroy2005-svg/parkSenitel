"""
Property-based tests for preprocess.py using Hypothesis.

Each test is annotated with the feature and property it validates.
Tag format: Feature: parking-hotspot-intelligence, Property {N}: {property_text}
"""

from hypothesis import given, settings
import hypothesis.strategies as st

from preprocess import compute_weighted_severity_mean


# Feature: parking-hotspot-intelligence, Property 1: Severity weight is bounded
# Validates: Requirements 3.2
@given(st.lists(st.text()))
@settings(max_examples=100)
def test_weighted_severity_mean_is_bounded(types: list[str]) -> None:
    """For any list of violation type strings (including unknown types),
    weighted_severity_mean must be in [1.0, 3.0].

    1.0 is the minimum defined severity weight (and the default for unknowns).
    3.0 is the maximum defined severity weight (BLOCKING EMERGENCY ACCESS).
    """
    result = compute_weighted_severity_mean(types)
    assert 1.0 <= result <= 3.0


# ---------------------------------------------------------------------------
# Shared helpers for file-based property tests
# ---------------------------------------------------------------------------

import csv
import io
import tempfile
import os
from datetime import datetime, timedelta

import pandas as pd

from preprocess import load_and_validate


def _rows_to_csv(rows: list[dict]) -> str:
    """Serialise a list of row dicts to a CSV string."""
    if not rows:
        return ""
    fieldnames = list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def _write_tmp_csv_str(csv_text: str) -> str:
    """Write a CSV string to a named temp file; return the path."""
    fd, path = tempfile.mkstemp(suffix=".csv")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(csv_text)
    except Exception:
        os.unlink(path)
        raise
    return path


# ---------------------------------------------------------------------------
# Property 8: Approved-only + India bbox filters compose correctly
# Validates: Requirements 1.5, 1.6
# ---------------------------------------------------------------------------

@given(
    st.lists(
        st.fixed_dictionaries({
            "id": st.integers(min_value=1, max_value=10_000).map(str),
            "validation_status": st.sampled_from(["approved", "processing", "rejected"]),
            # Latitude: half inside India [6, 37], half outside
            "latitude": st.one_of(
                st.floats(min_value=6.0, max_value=37.0, allow_nan=False, allow_infinity=False),
                st.floats(min_value=-90.0, max_value=5.9, allow_nan=False, allow_infinity=False),
                st.floats(min_value=37.1, max_value=90.0, allow_nan=False, allow_infinity=False),
            ).map(str),
            # Longitude: half inside India [68, 98], half outside
            "longitude": st.one_of(
                st.floats(min_value=68.0, max_value=98.0, allow_nan=False, allow_infinity=False),
                st.floats(min_value=-180.0, max_value=67.9, allow_nan=False, allow_infinity=False),
                st.floats(min_value=98.1, max_value=180.0, allow_nan=False, allow_infinity=False),
            ).map(str),
            "created_datetime": st.just("2026-01-15 08:00:00"),
            "violation_type": st.just('["WRONG PARKING"]'),
            "offence_code": st.just('["OC001"]'),
            "police_station": st.just("Anna Nagar"),
            "junction_name": st.just("No Junction"),
            "location": st.just("Main Road"),
        }),
        min_size=1,
        max_size=30,
    )
)
@settings(max_examples=50)
def test_approved_and_bbox_filter_compose(rows: list[dict]) -> None:
    """Feature: parking-hotspot-intelligence, Property 8: Approved-only filter and India bbox \
filter compose correctly — output contains only records whose validation_status is 'approved' \
AND whose coordinates are within the India bounding box (lat ∈ [6, 37], lon ∈ [68, 98]).

    Validates: Requirements 1.5, 1.6
    """
    csv_text = _rows_to_csv(rows)
    path = _write_tmp_csv_str(csv_text)
    try:
        df = load_and_validate(path, min_violations=2)
    finally:
        os.unlink(path)

    # Every surviving record must pass BOTH filters simultaneously
    for _, row in df.iterrows():
        assert row["validation_status"] == "approved", (
            f"Record id={row.get('id')} survived with validation_status={row['validation_status']!r}"
        )
        lat = float(row["latitude"])
        lon = float(row["longitude"])
        assert 6.0 <= lat <= 37.0, (
            f"Record id={row.get('id')} has latitude={lat} outside India bbox"
        )
        assert 68.0 <= lon <= 98.0, (
            f"Record id={row.get('id')} has longitude={lon} outside India bbox"
        )


# ---------------------------------------------------------------------------
# Property 9: UTC-to-IST conversion preserves +05:30 offset
# Validates: Requirements 1.4
# ---------------------------------------------------------------------------

@given(
    st.lists(
        st.fixed_dictionaries({
            "id": st.integers(min_value=1, max_value=10_000).map(str),
            "validation_status": st.just("approved"),
            "latitude": st.just("13.0"),
            "longitude": st.just("80.0"),
            # Generate random UTC datetimes within a realistic range
            "created_datetime": st.datetimes(
                min_value=datetime(2020, 1, 1, 0, 0, 0),
                max_value=datetime(2030, 12, 31, 23, 59, 59),
            ).map(lambda dt: dt.strftime("%Y-%m-%d %H:%M:%S")),
            "violation_type": st.just('["WRONG PARKING"]'),
            "offence_code": st.just('["OC001"]'),
            "police_station": st.just("Anna Nagar"),
            "junction_name": st.just("No Junction"),
            "location": st.just("Main Road"),
        }),
        min_size=1,
        max_size=20,
    )
)
@settings(max_examples=50)
def test_utc_to_ist_offset_is_5h30m(rows: list[dict]) -> None:
    """Feature: parking-hotspot-intelligence, Property 9: UTC-to-IST conversion preserves offset \
— for any UTC datetime in created_datetime, the derived created_datetime_ist SHALL equal the \
input plus exactly 5 hours and 30 minutes (UTC+05:30).

    Validates: Requirements 1.4
    """
    csv_text = _rows_to_csv(rows)
    path = _write_tmp_csv_str(csv_text)
    try:
        df = load_and_validate(path, min_violations=2)
    finally:
        os.unlink(path)

    IST_DELTA = timedelta(hours=5, minutes=30)

    for _, row in df.iterrows():
        utc_dt = pd.to_datetime(row["created_datetime"])
        ist_dt = row["created_datetime_ist"]
        expected_ist = utc_dt + IST_DELTA
        assert ist_dt == expected_ist, (
            f"Record id={row.get('id')}: expected IST={expected_ist}, got {ist_dt}"
        )


# ---------------------------------------------------------------------------
# Property 6: Minimum-violation threshold is enforced
# Validates: Requirements 2.3, 13.3
# ---------------------------------------------------------------------------

import numpy as np
import pytest

from preprocess import bin_hotspots


def _make_hotspot_df(groups: list[tuple[str, str, list[tuple[float, float]]]]) -> "pd.DataFrame":
    """Build a DataFrame for bin_hotspots from a list of (station, h3, [(lat, lon), ...]) tuples."""
    rows = []
    for station, h3_idx, coords in groups:
        for lat, lon in coords:
            rows.append({
                "police_station": station,
                "h3_index": h3_idx,
                "latitude": lat,
                "longitude": lon,
            })
    return pd.DataFrame(rows)


# Strategy: produce a list of (station, h3_index, count) groups,
# some with count < min_violations and some with count >= min_violations.
_group_spec = st.fixed_dictionaries({
    "station": st.text(alphabet="ABCDE", min_size=1, max_size=3),
    "h3_index": st.text(alphabet="0123456789abcdef", min_size=8, max_size=8),
    "count": st.integers(min_value=1, max_value=10),
    "lat": st.floats(min_value=6.0, max_value=37.0, allow_nan=False, allow_infinity=False),
    "lon": st.floats(min_value=68.0, max_value=98.0, allow_nan=False, allow_infinity=False),
})


@given(
    groups=st.lists(_group_spec, min_size=1, max_size=15),
    min_violations=st.integers(min_value=1, max_value=8),
)
@settings(max_examples=50)
def test_property_6_min_violation_threshold_enforced(
    groups: list[dict], min_violations: int
) -> None:
    """Feature: parking-hotspot-intelligence, Property 6: Minimum-violation threshold is \
enforced — for any (station, H3 cell) group and any value of min_violations N, if that \
group's record count is less than N, the group SHALL NOT appear in the output hotspot list.

    Validates: Requirements 2.3, 13.3
    """
    # Build rows from the generated group specs.
    # Use unique (station, h3_index) keys to avoid accidental merging — prefix each h3 with
    # the group index to guarantee distinctness even if Hypothesis generates duplicate values.
    rows = []
    for i, g in enumerate(groups):
        unique_h3 = f"{i:04d}_{g['h3_index']}"
        for _ in range(g["count"]):
            rows.append({
                "police_station": g["station"],
                "h3_index": unique_h3,
                "latitude": g["lat"],
                "longitude": g["lon"],
            })

    df = pd.DataFrame(rows)
    result = bin_hotspots(df, min_violations=min_violations)

    if result.empty:
        return  # All groups were below threshold — nothing to assert

    # For every surviving (station, h3_index) group, assert its count >= min_violations
    group_sizes = result.groupby(["police_station", "h3_index"]).size()
    for (station, h3_idx), size in group_sizes.items():
        assert size >= min_violations, (
            f"Group (station={station!r}, h3={h3_idx!r}) has {size} record(s) in output "
            f"but min_violations={min_violations}"
        )

    # Cross-check: every input group with count < min_violations must NOT appear in output
    output_keys = set(zip(result["police_station"], result["h3_index"]))
    for i, g in enumerate(groups):
        unique_h3 = f"{i:04d}_{g['h3_index']}"
        if g["count"] < min_violations:
            assert (g["station"], unique_h3) not in output_keys, (
                f"Group (station={g['station']!r}, h3={unique_h3!r}) with count={g['count']} "
                f"appeared in output despite being below min_violations={min_violations}"
            )


# ---------------------------------------------------------------------------
# Property 7: Centroid equals the mean of member coordinates
# Validates: Requirements 2.4
# ---------------------------------------------------------------------------

# Strategy: generate a single group with multiple (lat, lon) pairs.
_coord_pair = st.tuples(
    st.floats(min_value=6.0, max_value=37.0, allow_nan=False, allow_infinity=False),
    st.floats(min_value=68.0, max_value=98.0, allow_nan=False, allow_infinity=False),
)


@given(
    coords=st.lists(_coord_pair, min_size=2, max_size=30),
    extra_groups=st.lists(
        st.fixed_dictionaries({
            "station": st.just("OtherStation"),
            "h3_index": st.text(alphabet="xyz", min_size=4, max_size=4),
            "count": st.integers(min_value=2, max_value=5),
            "lat": st.floats(min_value=6.0, max_value=37.0, allow_nan=False, allow_infinity=False),
            "lon": st.floats(min_value=68.0, max_value=98.0, allow_nan=False, allow_infinity=False),
        }),
        min_size=0,
        max_size=5,
    ),
)
@settings(max_examples=50)
def test_property_7_centroid_equals_mean_coordinates(
    coords: list[tuple[float, float]],
    extra_groups: list[dict],
) -> None:
    """Feature: parking-hotspot-intelligence, Property 7: Centroid equals mean coordinates \
— for any set of violation records that form a hotspot, the output centroid_lat SHALL equal \
the arithmetic mean of all member latitudes and centroid_lon SHALL equal the arithmetic mean \
of all member longitudes.

    Validates: Requirements 2.4
    """
    # Build the primary group (station="TargetStation", h3_index="primary_cell")
    primary_rows = [
        {
            "police_station": "TargetStation",
            "h3_index": "primary_cell",
            "latitude": lat,
            "longitude": lon,
        }
        for lat, lon in coords
    ]

    # Add extra distractor groups (all with >= 2 records to survive the filter)
    extra_rows = []
    for i, g in enumerate(extra_groups):
        unique_h3 = f"extra_{i:03d}_{g['h3_index']}"
        for _ in range(g["count"]):
            extra_rows.append({
                "police_station": g["station"],
                "h3_index": unique_h3,
                "latitude": g["lat"],
                "longitude": g["lon"],
            })

    df = pd.DataFrame(primary_rows + extra_rows)
    result = bin_hotspots(df, min_violations=2)

    # The primary group must appear in output (it always has >= 2 records)
    primary_result = result[
        (result["police_station"] == "TargetStation") & (result["h3_index"] == "primary_cell")
    ]
    assert len(primary_result) > 0, (
        "Primary group did not appear in output — bin_hotspots dropped it unexpectedly"
    )

    # Compute expected centroid from the raw coords
    expected_lat = sum(lat for lat, _ in coords) / len(coords)
    expected_lon = sum(lon for _, lon in coords) / len(coords)

    # Every row in the primary group must carry the correct centroid values
    for _, row in primary_result.iterrows():
        assert row["centroid_lat"] == pytest.approx(expected_lat, rel=1e-9, abs=1e-9), (
            f"centroid_lat={row['centroid_lat']} does not equal mean lat={expected_lat}"
        )
        assert row["centroid_lon"] == pytest.approx(expected_lon, rel=1e-9, abs=1e-9), (
            f"centroid_lon={row['centroid_lon']} does not equal mean lon={expected_lon}"
        )


# ---------------------------------------------------------------------------
# Property 2: Peak hour factor is bounded
# Validates: Requirements 3.4
# ---------------------------------------------------------------------------

from preprocess import compute_cis


@given(
    n=st.integers(min_value=1, max_value=50),
    peak_count=st.integers(min_value=0, max_value=50),
)
@settings(max_examples=50)
def test_property_2_peak_hour_factor_bounded(n: int, peak_count: int) -> None:
    """Feature: parking-hotspot-intelligence, Property 2: Peak hour factor is bounded \
— for any collection of violation records, the computed peak_hour_factor SHALL satisfy \
1.0 ≤ peak_hour_factor ≤ 1.5.

    Validates: Requirements 3.4
    """
    # peak_count may exceed n; clamp so we can't have more peak records than total rows
    actual_peak = min(peak_count, n)

    # Build a group where `actual_peak` rows fall in a peak hour (08:00) and the rest
    # fall in an off-peak hour (12:00). All other required columns are set to minimal values.
    peak_dt = "2026-01-15 08:00:00"    # 08:xx IST — peak hour
    offpeak_dt = "2026-01-15 12:00:00"  # 12:xx IST — off-peak hour

    rows = []
    for i in range(n):
        dt = peak_dt if i < actual_peak else offpeak_dt
        rows.append({
            "created_datetime_ist": pd.Timestamp(dt),
            "junction_name": "No Junction",
            "violation_type": ["WRONG PARKING"],
            "location": None,
        })

    group_df = pd.DataFrame(rows)
    result = compute_cis(group_df)

    phf = result["peak_hour_factor"]
    assert 1.0 <= phf <= 1.5, (
        f"peak_hour_factor={phf} is outside [1.0, 1.5] "
        f"(n={n}, actual_peak={actual_peak})"
    )


# ---------------------------------------------------------------------------
# Property 3: CIS is strictly positive
# Validates: Requirements 3.1
# ---------------------------------------------------------------------------

@given(
    n=st.integers(min_value=1, max_value=30),
    violation_types=st.lists(
        st.sampled_from([
            "WRONG PARKING", "PARKING IN A MAIN ROAD", "NO PARKING ZONE",
            "OBSTRUCTION TO TRAFFIC", "BLOCKING EMERGENCY ACCESS", "UNKNOWN_TYPE",
        ]),
        min_size=1,
        max_size=5,
    ),
    has_junction=st.booleans(),
    peak_count=st.integers(min_value=0, max_value=30),
)
@settings(max_examples=50)
def test_property_3_cis_strictly_positive(
    n: int,
    violation_types: list[str],
    has_junction: bool,
    peak_count: int,
) -> None:
    """Feature: parking-hotspot-intelligence, Property 3: CIS is strictly positive \
— for any hotspot with at least one violation record, the computed cis SHALL be \
strictly greater than 0.

    Validates: Requirements 3.1
    """
    actual_peak = min(peak_count, n)
    peak_dt = "2026-01-15 08:00:00"
    offpeak_dt = "2026-01-15 12:00:00"
    junction_val = "Main Junction" if has_junction else "No Junction"

    rows = []
    for i in range(n):
        dt = peak_dt if i < actual_peak else offpeak_dt
        rows.append({
            "created_datetime_ist": pd.Timestamp(dt),
            "junction_name": junction_val,
            "violation_type": violation_types,
            "location": None,
        })

    group_df = pd.DataFrame(rows)
    result = compute_cis(group_df)

    assert result["cis"] > 0, (
        f"cis={result['cis']} is not > 0 "
        f"(n={n}, violation_types={violation_types}, has_junction={has_junction})"
    )


# ---------------------------------------------------------------------------
# Property 4: CIS normalization is in range and order-preserving
# Validates: Requirements 3.6
# ---------------------------------------------------------------------------

from preprocess import normalize_cis


@given(
    cis_values=st.lists(
        st.floats(min_value=0.01, max_value=1_000_000.0, allow_nan=False, allow_infinity=False),
        min_size=2,
        max_size=20,
    ).filter(lambda xs: len(set(xs)) >= 2),  # require at least 2 distinct values
)
@settings(max_examples=50)
def test_property_4_normalization_range_and_order_preserving(
    cis_values: list[float],
) -> None:
    """Feature: parking-hotspot-intelligence, Property 4: CIS normalization is in range \
and order-preserving — for any station with two or more hotspots, every hotspot's \
cis_normalized SHALL satisfy 0.0 ≤ cis_normalized ≤ 100.0, and if hotspot A has a higher \
raw cis than hotspot B, hotspot A SHALL have a strictly higher cis_normalized.

    Validates: Requirements 3.6
    """
    n = len(cis_values)
    station_df = pd.DataFrame({
        "police_station": ["TestStation"] * n,
        "h3_index": [f"cell_{i}" for i in range(n)],
        "cis": cis_values,
    })

    result = normalize_cis(station_df)

    # 1. All normalized values must be in [0.0, 100.0]
    for val in result["cis_normalized"]:
        assert 0.0 <= val <= 100.0, (
            f"cis_normalized={val} is outside [0.0, 100.0]"
        )

    # 2. Order must be preserved: higher cis → higher cis_normalized
    for i in range(n):
        for j in range(n):
            cis_i = result["cis"].iloc[i]
            cis_j = result["cis"].iloc[j]
            norm_i = result["cis_normalized"].iloc[i]
            norm_j = result["cis_normalized"].iloc[j]
            if cis_i > cis_j:
                assert norm_i > norm_j, (
                    f"Order not preserved: cis[{i}]={cis_i} > cis[{j}]={cis_j} "
                    f"but cis_normalized[{i}]={norm_i} <= cis_normalized[{j}]={norm_j}"
                )


# ---------------------------------------------------------------------------
# Property 5: Single-hotspot station normalization sentinel
# Validates: Requirements 3.6
# ---------------------------------------------------------------------------

@given(
    cis_val=st.floats(min_value=0.01, max_value=1_000_000.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=50)
def test_property_5_single_hotspot_normalized_to_100(cis_val: float) -> None:
    """Feature: parking-hotspot-intelligence, Property 5: Single-hotspot station \
normalization sentinel — for any station containing exactly one hotspot, that hotspot's \
cis_normalized SHALL equal 100.0.

    Validates: Requirements 3.6
    """
    station_df = pd.DataFrame({
        "police_station": ["SingleStation"],
        "h3_index": ["only_cell"],
        "cis": [cis_val],
    })

    result = normalize_cis(station_df)

    normalized = result["cis_normalized"].iloc[0]
    assert normalized == 100.0, (
        f"Single-hotspot cis_normalized={normalized} (expected 100.0) for cis={cis_val}"
    )
