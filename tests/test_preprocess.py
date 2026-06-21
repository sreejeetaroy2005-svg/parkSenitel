"""
tests/test_preprocess.py — Unit tests for preprocess.py helper functions.

Covers task 2.2: get_severity_weight and compute_weighted_severity_mean.
"""

import pytest

from preprocess import (
    SEVERITY_WEIGHTS,
    compute_weighted_severity_mean,
    get_severity_weight,
)


# ---------------------------------------------------------------------------
# get_severity_weight — known types
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "violation_type, expected",
    [
        ("WRONG PARKING", 1.0),
        ("PARKING IN A MAIN ROAD", 1.5),
        ("NO PARKING ZONE", 1.5),
        ("OBSTRUCTION TO TRAFFIC", 2.0),
        ("BLOCKING EMERGENCY ACCESS", 3.0),
    ],
)
def test_severity_weight_known_types(violation_type: str, expected: float) -> None:
    """Each known violation type returns its documented weight."""
    assert get_severity_weight(violation_type) == expected


def test_severity_weight_unknown_type() -> None:
    """An unrecognised violation type returns the default weight of 1.0."""
    assert get_severity_weight("SOMETHING_COMPLETELY_UNKNOWN") == 1.0


def test_severity_weight_empty_string() -> None:
    """An empty string is treated as an unknown type and returns 1.0."""
    assert get_severity_weight("") == 1.0


def test_severity_weight_case_sensitive() -> None:
    """Lookup is case-sensitive; lowercase versions are treated as unknown."""
    assert get_severity_weight("wrong parking") == 1.0


# ---------------------------------------------------------------------------
# compute_weighted_severity_mean — edge cases and examples
# ---------------------------------------------------------------------------


def test_weighted_severity_mean_empty_list() -> None:
    """Empty input returns the default weight 1.0."""
    assert compute_weighted_severity_mean([]) == 1.0


def test_weighted_severity_mean_single_known() -> None:
    """Single known type returns that type's weight exactly."""
    assert compute_weighted_severity_mean(["BLOCKING EMERGENCY ACCESS"]) == 3.0


def test_weighted_severity_mean_single_unknown() -> None:
    """Single unknown type returns 1.0."""
    assert compute_weighted_severity_mean(["MYSTERY_TYPE"]) == 1.0


def test_weighted_severity_mean_all_same() -> None:
    """List of identical types returns that type's weight."""
    assert compute_weighted_severity_mean(["OBSTRUCTION TO TRAFFIC"] * 4) == 2.0


def test_weighted_severity_mean_mixed_known() -> None:
    """Mean of a known mix is computed correctly (1.0 + 3.0) / 2 = 2.0."""
    result = compute_weighted_severity_mean(["WRONG PARKING", "BLOCKING EMERGENCY ACCESS"])
    assert result == pytest.approx(2.0)


def test_weighted_severity_mean_with_unknown_type() -> None:
    """Unknown types contribute 1.0 to the mean."""
    # (1.5 + 1.0) / 2 = 1.25
    result = compute_weighted_severity_mean(["PARKING IN A MAIN ROAD", "UNKNOWN_TYPE"])
    assert result == pytest.approx(1.25)


def test_weighted_severity_mean_duplicates_count_individually() -> None:
    """Duplicates are included individually, not collapsed."""
    # Three "WRONG PARKING" (1.0) + one "BLOCKING EMERGENCY ACCESS" (3.0)
    # mean = (1.0 + 1.0 + 1.0 + 3.0) / 4 = 1.5
    result = compute_weighted_severity_mean(
        ["WRONG PARKING", "WRONG PARKING", "WRONG PARKING", "BLOCKING EMERGENCY ACCESS"]
    )
    assert result == pytest.approx(1.5)


def test_weighted_severity_mean_result_bounds_known_types() -> None:
    """Result for any list of known types stays within [1.0, 3.0]."""
    all_types = list(SEVERITY_WEIGHTS.keys())
    result = compute_weighted_severity_mean(all_types)
    assert 1.0 <= result <= 3.0


# ---------------------------------------------------------------------------
# load_and_validate — unit tests (task 3.2)
# ---------------------------------------------------------------------------

import io
import json as _json
import warnings as _warnings
from datetime import datetime, timedelta

import pandas as pd
import pytest

from preprocess import INDIA_BBOX, IST_OFFSET, load_and_validate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_csv(rows: list[dict]) -> str:
    """Serialise a list of row dicts to a CSV string for in-memory testing."""
    import csv, io
    if not rows:
        return ""
    fieldnames = list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def _base_row(**overrides) -> dict:
    """Return a minimal, valid violation row dict, applying any overrides."""
    row = {
        "id": "1",
        "validation_status": "approved",
        "latitude": "13.0",
        "longitude": "80.0",
        "created_datetime": "2026-01-15 08:00:00",
        "violation_type": '["WRONG PARKING"]',
        "offence_code": '["OC001"]',
        "police_station": "Anna Nagar",
        "junction_name": "No Junction",
        "location": "Main Road",
    }
    row.update(overrides)
    return row


def _write_tmp_csv(tmp_path, rows):
    """Write rows to a temp CSV file and return its path."""
    csv_text = _make_csv(rows)
    p = tmp_path / "test_violations.csv"
    p.write_text(csv_text, encoding="utf-8")
    return str(p)


# ---------------------------------------------------------------------------
# test_india_bbox_filter
# ---------------------------------------------------------------------------

class TestIndiaBboxFilter:
    """Records with coordinates outside India bbox (or null/zero) are dropped."""

    def test_valid_coordinates_kept(self, tmp_path):
        rows = [_base_row(id=str(i), latitude="13.0", longitude="80.0") for i in range(5)]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 5

    def test_null_latitude_dropped(self, tmp_path):
        rows = [_base_row(id="1", latitude=""), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1
        assert int(df.iloc[0]["id"]) == 2

    def test_null_longitude_dropped(self, tmp_path):
        rows = [_base_row(id="1", longitude=""), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_zero_latitude_dropped(self, tmp_path):
        rows = [_base_row(id="1", latitude="0"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_zero_longitude_dropped(self, tmp_path):
        rows = [_base_row(id="1", longitude="0"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_latitude_too_low_dropped(self, tmp_path):
        # Below India min_lat (6.0)
        rows = [_base_row(id="1", latitude="5.9"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_latitude_too_high_dropped(self, tmp_path):
        # Above India max_lat (37.0)
        rows = [_base_row(id="1", latitude="37.1"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_longitude_too_low_dropped(self, tmp_path):
        # Below India min_lon (68.0)
        rows = [_base_row(id="1", longitude="67.9"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_longitude_too_high_dropped(self, tmp_path):
        # Above India max_lon (98.0)
        rows = [_base_row(id="1", longitude="98.1"), _base_row(id="2")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1

    def test_bbox_boundary_included(self, tmp_path):
        """Records exactly on the bbox boundary should be retained."""
        rows = [
            _base_row(id="1", latitude="6.0", longitude="68.0"),
            _base_row(id="2", latitude="37.0", longitude="98.0"),
        ]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 2

    def test_non_approved_always_dropped(self, tmp_path):
        """Non-approved records with valid coords are still excluded."""
        rows = [
            _base_row(id="1", validation_status="processing"),
            _base_row(id="2"),
        ]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert len(df) == 1


# ---------------------------------------------------------------------------
# test_utc_to_ist_conversion
# ---------------------------------------------------------------------------

class TestUtcToIstConversion:
    """created_datetime is shifted by +05:30 into created_datetime_ist."""

    def test_ist_column_created(self, tmp_path):
        rows = [_base_row()]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert "created_datetime_ist" in df.columns

    def test_offset_is_5h30m(self, tmp_path):
        rows = [_base_row(created_datetime="2026-01-15 00:00:00")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        row = df.iloc[0]
        utc_dt = pd.to_datetime("2026-01-15 00:00:00")
        expected_ist = utc_dt + timedelta(hours=5, minutes=30)
        assert row["created_datetime_ist"] == expected_ist

    def test_midnight_utc_becomes_morning_ist(self, tmp_path):
        """2026-01-01 00:00:00 UTC → 2026-01-01 05:30:00 IST."""
        rows = [_base_row(created_datetime="2026-01-01 00:00:00")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        expected = pd.Timestamp("2026-01-01 05:30:00")
        assert df.iloc[0]["created_datetime_ist"] == expected

    def test_day_rollover(self, tmp_path):
        """2026-01-15 20:00:00 UTC → 2026-01-16 01:30:00 IST (next day)."""
        rows = [_base_row(created_datetime="2026-01-15 20:00:00")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        expected = pd.Timestamp("2026-01-16 01:30:00")
        assert df.iloc[0]["created_datetime_ist"] == expected


# ---------------------------------------------------------------------------
# test_invalid_json_col_warning
# ---------------------------------------------------------------------------

class TestInvalidJsonColWarning:
    """Unparseable JSON columns are logged as warnings; both fields become []."""

    def test_invalid_violation_type_becomes_empty_list(self, tmp_path):
        rows = [_base_row(id="bad1", violation_type="NOT_JSON")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert df.iloc[0]["violation_type"] == []

    def test_invalid_offence_code_becomes_empty_list(self, tmp_path):
        rows = [_base_row(id="bad2", offence_code="{invalid}")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert df.iloc[0]["offence_code"] == []

    def test_both_fields_cleared_on_any_parse_error(self, tmp_path):
        """If either column is invalid, both are set to empty lists per spec."""
        rows = [_base_row(id="bad3", violation_type="BROKEN_JSON", offence_code='["OC001"]')]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert df.iloc[0]["violation_type"] == []
        assert df.iloc[0]["offence_code"] == []

    def test_valid_json_parses_correctly(self, tmp_path):
        rows = [_base_row(violation_type='["WRONG PARKING","NO PARKING ZONE"]')]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert df.iloc[0]["violation_type"] == ["WRONG PARKING", "NO PARKING ZONE"]

    def test_null_json_column_becomes_empty_list(self, tmp_path):
        """A null/empty cell (not a JSON string) is treated as an empty list without error."""
        rows = [_base_row(violation_type="")]
        df = load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        assert df.iloc[0]["violation_type"] == []

    def test_low_record_count_warning(self, tmp_path):
        """Fewer than 1 000 records after filtering triggers warnings.warn."""
        rows = [_base_row(id=str(i)) for i in range(5)]
        with _warnings.catch_warnings(record=True) as caught:
            _warnings.simplefilter("always")
            load_and_validate(_write_tmp_csv(tmp_path, rows), min_violations=2)
        texts = [str(w.message) for w in caught]
        assert any("records remain" in t for t in texts), (
            "Expected a low-record-count warning but none was emitted"
        )


# ---------------------------------------------------------------------------
# assign_h3 — unit tests (task 4.1)
# ---------------------------------------------------------------------------

from preprocess import assign_h3


class TestAssignH3:
    """assign_h3 adds an h3_index column and drops rows that fail encoding."""

    def _make_df(self, rows: list[dict]) -> pd.DataFrame:
        return pd.DataFrame(rows)

    def _valid_row(self, **kwargs) -> dict:
        base = {"id": "1", "latitude": 13.0607, "longitude": 80.2785}
        base.update(kwargs)
        return base

    # ------------------------------------------------------------------
    # Happy path
    # ------------------------------------------------------------------

    def test_h3_index_column_added(self):
        """assign_h3 adds an 'h3_index' column to the DataFrame."""
        df = self._make_df([self._valid_row()])
        result = df.pipe(assign_h3)
        assert "h3_index" in result.columns

    def test_h3_index_is_string(self):
        """Each h3_index value is a non-empty string."""
        df = self._make_df([self._valid_row(id="1"), self._valid_row(id="2", latitude=12.9716, longitude=77.5946)])
        result = df.pipe(assign_h3)
        for idx in result["h3_index"]:
            assert isinstance(idx, str) and len(idx) > 0

    def test_correct_h3_resolution_9(self):
        """The returned H3 index has resolution 9."""
        import h3 as _h3
        df = self._make_df([self._valid_row(latitude=13.0607, longitude=80.2785)])
        result = df.pipe(assign_h3)
        assert _h3.get_resolution(result.iloc[0]["h3_index"]) == 9

    def test_row_count_preserved_on_valid_input(self):
        """No rows are dropped when all coordinates are valid."""
        rows = [self._valid_row(id=str(i), latitude=13.0 + i * 0.01, longitude=80.0 + i * 0.01)
                for i in range(5)]
        df = self._make_df(rows)
        result = df.pipe(assign_h3)
        assert len(result) == 5

    def test_original_df_not_mutated(self):
        """assign_h3 returns a new DataFrame; the original is unchanged."""
        df = self._make_df([self._valid_row()])
        original_cols = list(df.columns)
        assign_h3(df)
        assert list(df.columns) == original_cols
        assert "h3_index" not in df.columns

    def test_nearby_coordinates_same_cell(self):
        """Two points within ~100 m of each other should share the same H3 cell."""
        # Two points very close together in Chennai
        rows = [
            self._valid_row(id="1", latitude=13.0607, longitude=80.2785),
            self._valid_row(id="2", latitude=13.0608, longitude=80.2786),
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert result.iloc[0]["h3_index"] == result.iloc[1]["h3_index"]

    def test_far_apart_coordinates_different_cells(self):
        """Two points far apart (Chennai vs Bangalore) have different H3 cells."""
        rows = [
            self._valid_row(id="1", latitude=13.0607, longitude=80.2785),  # Chennai
            self._valid_row(id="2", latitude=12.9716, longitude=77.5946),  # Bangalore
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert result.iloc[0]["h3_index"] != result.iloc[1]["h3_index"]

    # ------------------------------------------------------------------
    # Failure / skip behaviour
    # ------------------------------------------------------------------

    def test_nan_latitude_row_dropped(self):
        """A row with NaN latitude is dropped from the result."""
        import math
        rows = [
            self._valid_row(id="good", latitude=13.0607, longitude=80.2785),
            {"id": "bad", "latitude": float("nan"), "longitude": 80.2785},
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert len(result) == 1
        assert result.iloc[0]["id"] == "good"

    def test_nan_longitude_row_dropped(self):
        """A row with NaN longitude is dropped from the result."""
        rows = [
            self._valid_row(id="good"),
            {"id": "bad", "latitude": 13.0607, "longitude": float("nan")},
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert len(result) == 1

    def test_empty_dataframe_returns_empty_with_column(self):
        """An empty DataFrame gains an h3_index column and remains empty."""
        df = pd.DataFrame({"id": pd.Series([], dtype=str),
                           "latitude": pd.Series([], dtype=float),
                           "longitude": pd.Series([], dtype=float)})
        result = assign_h3(df)
        assert "h3_index" in result.columns
        assert len(result) == 0

    def test_all_bad_rows_dropped(self):
        """When every row fails encoding, the result is an empty DataFrame."""
        rows = [
            {"id": "a", "latitude": float("nan"), "longitude": float("nan")},
            {"id": "b", "latitude": float("nan"), "longitude": float("nan")},
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert len(result) == 0

    def test_mixed_valid_invalid_rows(self):
        """Only valid rows survive; invalid rows are dropped."""
        rows = [
            self._valid_row(id="ok1"),
            {"id": "bad1", "latitude": float("nan"), "longitude": 80.0},
            self._valid_row(id="ok2", latitude=12.9716, longitude=77.5946),
            {"id": "bad2", "latitude": 13.0, "longitude": float("nan")},
        ]
        result = self._make_df(rows).pipe(assign_h3)
        assert len(result) == 2
        assert set(result["id"]) == {"ok1", "ok2"}


# ---------------------------------------------------------------------------
# bin_hotspots — unit tests (task 4.2)
# ---------------------------------------------------------------------------

from preprocess import bin_hotspots


def _make_bin_df(rows: list[dict]) -> pd.DataFrame:
    """Build a minimal DataFrame suitable for bin_hotspots."""
    return pd.DataFrame(rows)


def _bin_row(
    police_station: str = "Anna Nagar",
    h3_index: str = "891f1d48177ffff",
    latitude: float = 13.06,
    longitude: float = 80.28,
    **kwargs,
) -> dict:
    base = {
        "police_station": police_station,
        "h3_index": h3_index,
        "latitude": latitude,
        "longitude": longitude,
    }
    base.update(kwargs)
    return base


# ---------------------------------------------------------------------------
# test_hotspot_filtered_below_min — module-level (Requirement 2.3)
# ---------------------------------------------------------------------------


def test_hotspot_filtered_below_min() -> None:
    """A (station, cell) group with fewer records than min_violations is omitted.

    Validates: Requirement 2.3
    """
    # Single record in one group — below default min_violations=2 threshold
    df = _make_bin_df([_bin_row(id="only_one")])
    result = bin_hotspots(df, min_violations=2)
    assert len(result) == 0, (
        "Expected the group to be filtered out because it has only 1 record "
        "and min_violations=2"
    )


class TestBinHotspots:
    """bin_hotspots groups by (police_station, h3_index), filters small groups,
    and attaches centroid columns."""

    # ------------------------------------------------------------------
    # Filtering below threshold (Requirement 2.3)
    # ------------------------------------------------------------------

    def test_filtered_below_min_violations_default(self):
        """A group with exactly 1 record is dropped when min_violations=2."""
        df = _make_bin_df([_bin_row()])
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 0

    def test_filtered_below_min_violations_custom(self):
        """A group with 2 records is dropped when min_violations=3."""
        rows = [_bin_row(id=str(i)) for i in range(2)]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=3)
        assert len(result) == 0

    def test_group_at_threshold_is_kept(self):
        """A group with exactly min_violations records is kept."""
        rows = [_bin_row(id=str(i)) for i in range(2)]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 2

    def test_group_above_threshold_is_kept(self):
        """A group with more than min_violations records is kept."""
        rows = [_bin_row(id=str(i)) for i in range(5)]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 5

    def test_mixed_groups_only_large_survive(self):
        """Only groups meeting the threshold survive; small ones are dropped."""
        big_group = [_bin_row(police_station="Anna Nagar", h3_index="AAA", id=str(i)) for i in range(3)]
        small_group = [_bin_row(police_station="Anna Nagar", h3_index="BBB", id="x")]
        df = _make_bin_df(big_group + small_group)
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 3
        assert set(result["h3_index"]) == {"AAA"}

    def test_different_stations_same_h3_treated_separately(self):
        """Groups are keyed by (station, h3_index), not h3_index alone."""
        # Station A: 2 records in cell X → survives
        # Station B: 1 record in cell X → dropped
        rows = [
            _bin_row(police_station="Station_A", h3_index="CCC", id="a1"),
            _bin_row(police_station="Station_A", h3_index="CCC", id="a2"),
            _bin_row(police_station="Station_B", h3_index="CCC", id="b1"),
        ]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 2
        assert list(result["police_station"].unique()) == ["Station_A"]

    # ------------------------------------------------------------------
    # Centroid computation (Requirement 2.4)
    # ------------------------------------------------------------------

    def test_centroid_columns_added(self):
        """bin_hotspots adds centroid_lat and centroid_lon columns."""
        rows = [_bin_row(id=str(i)) for i in range(2)]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert "centroid_lat" in result.columns
        assert "centroid_lon" in result.columns

    def test_centroid_is_mean_of_latitudes(self):
        """centroid_lat equals the arithmetic mean of member latitudes."""
        rows = [
            _bin_row(latitude=10.0, longitude=80.0, id="1"),
            _bin_row(latitude=20.0, longitude=80.0, id="2"),
        ]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert result["centroid_lat"].iloc[0] == pytest.approx(15.0)

    def test_centroid_is_mean_of_longitudes(self):
        """centroid_lon equals the arithmetic mean of member longitudes."""
        rows = [
            _bin_row(latitude=13.0, longitude=70.0, id="1"),
            _bin_row(latitude=13.0, longitude=90.0, id="2"),
        ]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert result["centroid_lon"].iloc[0] == pytest.approx(80.0)

    def test_centroid_same_for_all_rows_in_group(self):
        """Every row in a group gets the same centroid value (broadcast)."""
        rows = [
            _bin_row(latitude=10.0, longitude=70.0, id="1"),
            _bin_row(latitude=20.0, longitude=90.0, id="2"),
            _bin_row(latitude=30.0, longitude=80.0, id="3"),
        ]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert result["centroid_lat"].nunique() == 1
        assert result["centroid_lon"].nunique() == 1
        assert result["centroid_lat"].iloc[0] == pytest.approx(20.0)
        assert result["centroid_lon"].iloc[0] == pytest.approx(80.0)

    def test_centroid_computed_per_group(self):
        """Different groups get different centroids, each being their own mean."""
        group_a = [_bin_row(police_station="S", h3_index="AA", latitude=10.0, longitude=70.0, id="a1"),
                   _bin_row(police_station="S", h3_index="AA", latitude=20.0, longitude=80.0, id="a2")]
        group_b = [_bin_row(police_station="S", h3_index="BB", latitude=30.0, longitude=90.0, id="b1"),
                   _bin_row(police_station="S", h3_index="BB", latitude=40.0, longitude=100.0, id="b2")]
        df = _make_bin_df(group_a + group_b)
        result = bin_hotspots(df, min_violations=2)
        a_rows = result[result["h3_index"] == "AA"]
        b_rows = result[result["h3_index"] == "BB"]
        assert a_rows["centroid_lat"].iloc[0] == pytest.approx(15.0)
        assert b_rows["centroid_lat"].iloc[0] == pytest.approx(35.0)

    # ------------------------------------------------------------------
    # Column preservation
    # ------------------------------------------------------------------

    def test_original_columns_preserved(self):
        """All original columns from the input DataFrame are present in output."""
        rows = [_bin_row(id=str(i), extra_col="val") for i in range(2)]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        for col in df.columns:
            assert col in result.columns

    # ------------------------------------------------------------------
    # Edge cases
    # ------------------------------------------------------------------

    def test_empty_dataframe_returns_empty(self):
        """An empty input DataFrame returns an empty DataFrame with centroid columns."""
        df = pd.DataFrame(columns=["police_station", "h3_index", "latitude", "longitude"])
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 0
        assert "centroid_lat" in result.columns
        assert "centroid_lon" in result.columns

    def test_all_groups_below_threshold_returns_empty(self):
        """When every group is below the threshold, the output is empty."""
        rows = [_bin_row(id="1"), _bin_row(h3_index="DDD", id="2")]
        df = _make_bin_df(rows)
        result = bin_hotspots(df, min_violations=2)
        assert len(result) == 0

    def test_original_df_not_mutated(self):
        """bin_hotspots does not modify the input DataFrame."""
        rows = [_bin_row(id=str(i)) for i in range(3)]
        df = _make_bin_df(rows)
        original_cols = list(df.columns)
        bin_hotspots(df, min_violations=2)
        assert list(df.columns) == original_cols
        assert "centroid_lat" not in df.columns


# ---------------------------------------------------------------------------
# compute_cis — unit tests (task 5.1)
# ---------------------------------------------------------------------------

from preprocess import compute_cis


def _make_group_df(rows: list[dict]) -> pd.DataFrame:
    """Build a minimal group DataFrame suitable for compute_cis."""
    return pd.DataFrame(rows)


def _cis_row(
    junction_name: str = "No Junction",
    created_datetime_ist: str = "2026-01-15 08:00:00",
    violation_type: "list | None" = None,
    location: "str | None" = "Main Road",
    **kwargs,
) -> dict:
    """Return a minimal row dict for compute_cis tests."""
    return {
        "junction_name": junction_name,
        "created_datetime_ist": created_datetime_ist,
        "violation_type": violation_type if violation_type is not None else ["WRONG PARKING"],
        "location": location,
        **kwargs,
    }


class TestComputeCisJunctionFactor:
    """junction_factor: 1.3 when at least one row has a real junction, else 1.0."""

    def test_junction_factor_without_junction(self):
        """All rows with 'No Junction' → junction_factor = 1.0, junction_flag = False."""
        df = _make_group_df([
            _cis_row(junction_name="No Junction"),
            _cis_row(junction_name="No Junction"),
        ])
        result = compute_cis(df)
        assert result["junction_factor"] == 1.0
        assert result["junction_flag"] is False

    def test_junction_factor_with_junction(self):
        """At least one row has a real junction → junction_factor = 1.3, junction_flag = True."""
        df = _make_group_df([
            _cis_row(junction_name="No Junction"),
            _cis_row(junction_name="Anna Nagar Junction"),
        ])
        result = compute_cis(df)
        assert result["junction_factor"] == 1.3
        assert result["junction_flag"] is True

    def test_junction_factor_all_real_junctions(self):
        """Every row has a real junction → junction_factor = 1.3."""
        df = _make_group_df([
            _cis_row(junction_name="Junction A"),
            _cis_row(junction_name="Junction B"),
        ])
        result = compute_cis(df)
        assert result["junction_factor"] == 1.3

    def test_junction_flag_matches_factor(self):
        """junction_flag is True iff junction_factor == 1.3."""
        df_no = _make_group_df([_cis_row(), _cis_row()])
        df_yes = _make_group_df([_cis_row(junction_name="Some Junction"), _cis_row()])
        r_no = compute_cis(df_no)
        r_yes = compute_cis(df_yes)
        assert r_no["junction_flag"] == (r_no["junction_factor"] == 1.3)
        assert r_yes["junction_flag"] == (r_yes["junction_factor"] == 1.3)


class TestComputeCisPeakHourFactor:
    """peak_hour_factor = 1.0 + (peak_fraction × 0.5), peak hours = 8–10 or 17–19 (IST)."""

    def test_peak_hour_factor_all_peak(self):
        """All records in peak hours (hour=8) → peak_fraction=1.0 → factor=1.5."""
        rows = [_cis_row(created_datetime_ist=f"2026-01-15 08:{m:02d}:00") for m in range(3)]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_factor"] == pytest.approx(1.5)

    def test_peak_hour_factor_none_peak(self):
        """All records outside peak hours (hour=12) → peak_fraction=0.0 → factor=1.0."""
        rows = [_cis_row(created_datetime_ist="2026-01-15 12:00:00") for _ in range(3)]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_factor"] == pytest.approx(1.0)

    def test_peak_hour_factor_half_peak(self):
        """Half records in peak hours → peak_fraction=0.5 → factor=1.25."""
        rows = [
            _cis_row(created_datetime_ist="2026-01-15 09:00:00"),  # peak
            _cis_row(created_datetime_ist="2026-01-15 09:00:00"),  # peak
            _cis_row(created_datetime_ist="2026-01-15 14:00:00"),  # not peak
            _cis_row(created_datetime_ist="2026-01-15 14:00:00"),  # not peak
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_factor"] == pytest.approx(1.25)

    def test_peak_hours_morning_boundary(self):
        """Hours 8, 9, 10 are peak; hour 11 is not."""
        peak_rows = [
            _cis_row(created_datetime_ist="2026-01-15 08:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 09:30:00"),
            _cis_row(created_datetime_ist="2026-01-15 10:59:00"),
        ]
        non_peak_rows = [_cis_row(created_datetime_ist="2026-01-15 11:00:00")]
        rows = peak_rows + non_peak_rows
        result = compute_cis(_make_group_df(rows))
        # 3 out of 4 rows are peak → peak_fraction=0.75 → factor=1.375
        assert result["peak_hour_factor"] == pytest.approx(1.375)

    def test_peak_hours_evening_boundary(self):
        """Hours 17, 18, 19 are peak; hour 20 is not."""
        peak_rows = [
            _cis_row(created_datetime_ist="2026-01-15 17:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 18:30:00"),
            _cis_row(created_datetime_ist="2026-01-15 19:59:00"),
        ]
        non_peak_rows = [_cis_row(created_datetime_ist="2026-01-15 20:00:00")]
        rows = peak_rows + non_peak_rows
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_factor"] == pytest.approx(1.375)


class TestComputeCisCisValue:
    """CIS = round((count × severity_mean) × junction_factor × peak_hour_factor, 2)."""

    def test_cis_basic_computation(self):
        """Simple case: 2 rows, WRONG PARKING (1.0), no junction, no peak hours → CIS = 2.0."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 12:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 12:00:00"),
        ]
        result = compute_cis(_make_group_df(rows))
        # count=2, wsm=1.0, jf=1.0, phf=1.0 → CIS = 2.0
        assert result["cis"] == pytest.approx(2.0)

    def test_cis_is_rounded_to_2dp(self):
        """CIS result is rounded to exactly 2 decimal places."""
        rows = [
            _cis_row(violation_type=["BLOCKING EMERGENCY ACCESS"], created_datetime_ist="2026-01-15 08:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 08:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 12:00:00"),
        ]
        result = compute_cis(_make_group_df(rows))
        # Verify the result is a float rounded to 2dp
        assert isinstance(result["cis"], float)
        assert round(result["cis"], 2) == result["cis"]

    def test_cis_with_junction(self):
        """Junction factor of 1.3 amplifies the CIS correctly."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING"], junction_name="Real Junction",
                     created_datetime_ist="2026-01-15 12:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], junction_name="No Junction",
                     created_datetime_ist="2026-01-15 12:00:00"),
        ]
        result = compute_cis(_make_group_df(rows))
        # count=2, wsm=1.0, jf=1.3, phf=1.0 → CIS = 2.6
        assert result["cis"] == pytest.approx(2.6)

    def test_cis_with_all_peak(self):
        """All-peak rows give factor 1.5, amplifying CIS."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 08:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 09:00:00"),
        ]
        result = compute_cis(_make_group_df(rows))
        # count=2, wsm=1.0, jf=1.0, phf=1.5 → CIS = 3.0
        assert result["cis"] == pytest.approx(3.0)

    def test_cis_strictly_positive(self):
        """CIS is strictly > 0 for any non-empty group."""
        rows = [_cis_row(), _cis_row()]
        result = compute_cis(_make_group_df(rows))
        assert result["cis"] > 0.0

    def test_cis_high_severity(self):
        """Higher severity types produce a higher CIS than lower severity types (same count)."""
        rows_low = [
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 12:00:00"),
            _cis_row(violation_type=["WRONG PARKING"], created_datetime_ist="2026-01-15 12:00:00"),
        ]
        rows_high = [
            _cis_row(violation_type=["BLOCKING EMERGENCY ACCESS"], created_datetime_ist="2026-01-15 12:00:00"),
            _cis_row(violation_type=["BLOCKING EMERGENCY ACCESS"], created_datetime_ist="2026-01-15 12:00:00"),
        ]
        result_low = compute_cis(_make_group_df(rows_low))
        result_high = compute_cis(_make_group_df(rows_high))
        assert result_high["cis"] > result_low["cis"]


class TestComputeCisPeakHourLabel:
    """peak_hour_label is the most frequent IST hour formatted as 'HH:00–HH+1:00 IST'."""

    def test_peak_hour_label_format(self):
        """Label is formatted as 'HH:00–HH+1:00 IST'."""
        rows = [_cis_row(created_datetime_ist="2026-01-15 08:00:00") for _ in range(3)]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_label"] == "08:00–09:00 IST"

    def test_peak_hour_label_most_frequent(self):
        """Label reflects the hour with the highest record count."""
        rows = [
            _cis_row(created_datetime_ist="2026-01-15 09:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 09:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 09:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 17:00:00"),
            _cis_row(created_datetime_ist="2026-01-15 17:00:00"),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_label"] == "09:00–10:00 IST"

    def test_peak_hour_label_midnight(self):
        """Hour 0 produces '00:00–01:00 IST'."""
        rows = [_cis_row(created_datetime_ist="2026-01-15 00:00:00") for _ in range(2)]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_label"] == "00:00–01:00 IST"

    def test_peak_hour_label_evening(self):
        """Hour 17 produces '17:00–18:00 IST'."""
        rows = [_cis_row(created_datetime_ist="2026-01-15 17:45:00") for _ in range(2)]
        result = compute_cis(_make_group_df(rows))
        assert result["peak_hour_label"] == "17:00–18:00 IST"


class TestComputeCisDominantViolationTypes:
    """dominant_violation_types returns top-3 by frequency as [{type, count}, ...]."""

    def test_dominant_violation_types_single(self):
        """Single violation type returns one entry."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING"]),
            _cis_row(violation_type=["WRONG PARKING"]),
        ]
        result = compute_cis(_make_group_df(rows))
        dvt = result["dominant_violation_types"]
        assert len(dvt) == 1
        assert dvt[0]["type"] == "WRONG PARKING"
        assert dvt[0]["count"] == 2

    def test_dominant_violation_types_top3(self):
        """When more than 3 types exist, only top 3 by frequency are returned."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING", "WRONG PARKING", "WRONG PARKING"]),
            _cis_row(violation_type=["NO PARKING ZONE", "NO PARKING ZONE"]),
            _cis_row(violation_type=["OBSTRUCTION TO TRAFFIC"]),
            _cis_row(violation_type=["BLOCKING EMERGENCY ACCESS"]),
            _cis_row(violation_type=["PARKING IN A MAIN ROAD"]),
        ]
        result = compute_cis(_make_group_df(rows))
        dvt = result["dominant_violation_types"]
        assert len(dvt) <= 3

    def test_dominant_violation_types_ordering(self):
        """Types are returned in descending order of frequency."""
        rows = [
            _cis_row(violation_type=["WRONG PARKING"]),
            _cis_row(violation_type=["WRONG PARKING"]),
            _cis_row(violation_type=["WRONG PARKING"]),
            _cis_row(violation_type=["NO PARKING ZONE"]),
            _cis_row(violation_type=["NO PARKING ZONE"]),
            _cis_row(violation_type=["OBSTRUCTION TO TRAFFIC"]),
        ]
        result = compute_cis(_make_group_df(rows))
        dvt = result["dominant_violation_types"]
        counts = [d["count"] for d in dvt]
        assert counts == sorted(counts, reverse=True)

    def test_dominant_violation_types_empty_lists(self):
        """Rows with empty violation_type lists produce an empty dominant list."""
        rows = [
            _cis_row(violation_type=[]),
            _cis_row(violation_type=[]),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["dominant_violation_types"] == []


class TestComputeCisSampleAddress:
    """sample_address is the most-frequent non-null, non-empty location value."""

    def test_sample_address_most_frequent(self):
        """Most frequent non-null location is returned."""
        rows = [
            _cis_row(location="Main Road"),
            _cis_row(location="Main Road"),
            _cis_row(location="Side Street"),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["sample_address"] == "Main Road"

    def test_sample_address_all_null(self):
        """When all location values are null, sample_address is None."""
        rows = [
            _cis_row(location=None),
            _cis_row(location=None),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["sample_address"] is None

    def test_sample_address_empty_strings_treated_as_null(self):
        """Empty strings are treated as null; if all empty, returns None."""
        rows = [
            _cis_row(location=""),
            _cis_row(location=""),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["sample_address"] is None

    def test_sample_address_ignores_empty_picks_non_empty(self):
        """Empty strings are ignored; the non-empty value is returned."""
        rows = [
            _cis_row(location=""),
            _cis_row(location="Real Address"),
            _cis_row(location=""),
        ]
        result = compute_cis(_make_group_df(rows))
        assert result["sample_address"] == "Real Address"


class TestComputeCisReturnKeys:
    """compute_cis always returns all 8 required keys."""

    REQUIRED_KEYS = {
        "junction_factor",
        "peak_hour_factor",
        "weighted_severity_mean",
        "cis",
        "junction_flag",
        "peak_hour_label",
        "dominant_violation_types",
        "sample_address",
    }

    def test_all_keys_present(self):
        rows = [_cis_row(), _cis_row()]
        result = compute_cis(_make_group_df(rows))
        assert self.REQUIRED_KEYS.issubset(result.keys())

    def test_weighted_severity_mean_key(self):
        """weighted_severity_mean is included in the return dict."""
        rows = [
            _cis_row(violation_type=["BLOCKING EMERGENCY ACCESS"]),
            _cis_row(violation_type=["WRONG PARKING"]),
        ]
        result = compute_cis(_make_group_df(rows))
        # mean of 3.0 and 1.0 = 2.0
        assert result["weighted_severity_mean"] == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# compute_cis / normalize_cis — unit tests (task 5.3)
# Requirements: 3.3, 3.4, 3.6
# ---------------------------------------------------------------------------

from preprocess import compute_cis, normalize_cis


def _make_cis_group(rows: list[dict]) -> pd.DataFrame:
    """Build a minimal group DataFrame with the columns expected by compute_cis."""
    return pd.DataFrame(rows)


def _cis_group_row(
    junction_name: str = "No Junction",
    created_datetime_ist: "str | pd.Timestamp" = "2026-01-15 12:00:00",
    violation_type: "list | None" = None,
    location: str = "Main Road",
    **kwargs,
) -> dict:
    return {
        "junction_name": junction_name,
        "created_datetime_ist": pd.Timestamp(created_datetime_ist),
        "violation_type": violation_type if violation_type is not None else ["WRONG PARKING"],
        "location": location,
        **kwargs,
    }


def test_peak_hour_factor_all_peak() -> None:
    """All records at IST hour 8 (peak) → peak_fraction = 1.0 → factor = 1.5.

    Validates: Requirements 3.4
    """
    rows = [
        _cis_group_row(created_datetime_ist="2026-01-15 08:00:00"),
        _cis_group_row(created_datetime_ist="2026-01-15 08:30:00"),
        _cis_group_row(created_datetime_ist="2026-01-15 08:45:00"),
    ]
    result = compute_cis(_make_cis_group(rows))
    assert result["peak_hour_factor"] == pytest.approx(1.5)


def test_peak_hour_factor_none_peak() -> None:
    """All records at IST hour 12 (non-peak) → peak_fraction = 0.0 → factor = 1.0.

    Validates: Requirements 3.4
    """
    rows = [
        _cis_group_row(created_datetime_ist="2026-01-15 12:00:00"),
        _cis_group_row(created_datetime_ist="2026-01-15 13:00:00"),
        _cis_group_row(created_datetime_ist="2026-01-15 14:00:00"),
    ]
    result = compute_cis(_make_cis_group(rows))
    assert result["peak_hour_factor"] == pytest.approx(1.0)


def test_junction_factor_with_junction() -> None:
    """At least one row with a real junction → junction_factor = 1.3, junction_flag = True.

    Validates: Requirements 3.3
    """
    rows = [
        _cis_group_row(junction_name="No Junction"),
        _cis_group_row(junction_name="Anna Nagar Junction"),
    ]
    result = compute_cis(_make_cis_group(rows))
    assert result["junction_factor"] == pytest.approx(1.3)
    assert result["junction_flag"] is True


def test_junction_factor_without_junction() -> None:
    """All rows with 'No Junction' → junction_factor = 1.0, junction_flag = False.

    Validates: Requirements 3.3
    """
    rows = [
        _cis_group_row(junction_name="No Junction"),
        _cis_group_row(junction_name="No Junction"),
        _cis_group_row(junction_name="No Junction"),
    ]
    result = compute_cis(_make_cis_group(rows))
    assert result["junction_factor"] == pytest.approx(1.0)
    assert result["junction_flag"] is False


def test_cis_normalized_single_hotspot() -> None:
    """A station DataFrame with a single hotspot → cis_normalized == 100.0.

    When min == max (only one hotspot), the sentinel value 100.0 is returned.

    Validates: Requirements 3.6
    """
    station_df = pd.DataFrame([
        {
            "police_station": "Anna Nagar",
            "h3_index": "891f1d48177ffff",
            "cis": 42.5,
        }
    ])
    result = normalize_cis(station_df)
    assert result["cis_normalized"].iloc[0] == pytest.approx(100.0)
