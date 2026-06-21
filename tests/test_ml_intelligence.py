import pytest
import pandas as pd
import numpy as np
from ml_intelligence import validate_hotspots_dbscan, compute_anomaly_flags

def test_dbscan_tight_cluster():
    # 5 points tightly packed in one station & one H3 cell
    df = pd.DataFrame({
        "police_station": ["StationA"] * 5,
        "h3_index": ["H3_1"] * 5,
        "latitude": [13.0, 13.0001, 13.0002, 13.0001, 13.0],
        "longitude": [80.0, 80.0001, 80.0002, 80.0001, 80.0]
    })
    # These are very close, should form a cluster
    res = validate_hotspots_dbscan(df, eps_meters=200, min_samples=3)
    assert res[("StationA", "H3_1")] is True


def test_dbscan_widely_scattered():
    # 5 points widely scattered, > 200m apart
    # 1 degree of lat is ~111km, 0.01 deg is ~1.1km
    df = pd.DataFrame({
        "police_station": ["StationA"] * 5,
        "h3_index": ["H3_1"] * 5,
        "latitude": [13.0, 13.01, 13.02, 13.03, 13.04],
        "longitude": [80.0, 80.01, 80.02, 80.03, 80.04]
    })
    res = validate_hotspots_dbscan(df, eps_meters=200, min_samples=3)
    # Should not form a cluster
    assert res[("StationA", "H3_1")] is False


def test_dbscan_station_isolation():
    # StationA has 2 points (too few, should be False)
    # StationB has 5 packed points (should be True)
    df = pd.DataFrame({
        "police_station": ["StationA", "StationA", "StationB", "StationB", "StationB", "StationB", "StationB"],
        "h3_index": ["H3_A", "H3_A", "H3_B", "H3_B", "H3_B", "H3_B", "H3_B"],
        "latitude": [13.0, 13.0001, 14.0, 14.0001, 14.0002, 14.0001, 14.0],
        "longitude": [80.0, 80.0001, 81.0, 81.0001, 81.0002, 81.0001, 81.0]
    })
    res = validate_hotspots_dbscan(df, eps_meters=200, min_samples=3)
    assert res[("StationA", "H3_A")] is False
    assert res[("StationB", "H3_B")] is True


def test_dbscan_empty():
    df = pd.DataFrame(columns=["police_station", "h3_index", "latitude", "longitude"])
    res = validate_hotspots_dbscan(df)
    assert res == {}


def test_anomaly_flags():
    # Need at least 8 hotspots to fit the model
    # We create 7 "normal" high-volume low-severity hotspots, and 1 "anomalous" low-volume high-severity hotspot
    data = []
    for i in range(15):
        data.append({
            "police_station": "StationA",
            "h3_index": f"H3_{i}",
            "violation_count": 100 + i,
            "weighted_severity_mean": 1.0,
            "junction_factor": 1.0,
            "peak_hour_factor": 1.0,
            "cis": (100+i)*1.0*1.0*1.0
        })
    # The anomaly
    data.append({
        "police_station": "StationA",
        "h3_index": "H3_ANOMALY",
        "violation_count": 5, # very low
        "weighted_severity_mean": 3.0, # high severity
        "junction_factor": 1.3,
        "peak_hour_factor": 1.5,
        "cis": 5*3.0*1.3*1.5
    })
    
    df = pd.DataFrame(data)
    out_df = compute_anomaly_flags(df, contamination=0.1)
    
    assert "ai_anomaly_score" in out_df.columns
    assert "ai_risk_flag" in out_df.columns
    
    # Original shouldn't be mutated
    assert "ai_risk_flag" not in df.columns
    
    anomaly_row = out_df[out_df["h3_index"] == "H3_ANOMALY"].iloc[0]
    assert anomaly_row["ai_risk_flag"] is True or anomaly_row["ai_risk_flag"] == True # Could be numpy bool
    
    # Dtypes
    assert out_df["ai_risk_flag"].dtype == bool
    assert out_df["ai_anomaly_score"].dtype == float


def test_anomaly_too_few_hotspots():
    data = []
    for i in range(5): # < 8
        data.append({
            "police_station": "StationA",
            "h3_index": f"H3_{i}",
            "violation_count": 100,
            "weighted_severity_mean": 1.0,
            "junction_factor": 1.0,
            "peak_hour_factor": 1.0,
            "cis": 100.0
        })
    df = pd.DataFrame(data)
    out_df = compute_anomaly_flags(df)
    
    assert "ai_anomaly_score" in out_df.columns
    assert "ai_risk_flag" in out_df.columns
    
    # Check default values
    assert (out_df["ai_anomaly_score"] == 0.0).all()
    assert (out_df["ai_risk_flag"] == False).all()


def test_anomaly_empty():
    df = pd.DataFrame(columns=["police_station", "violation_count", "weighted_severity_mean", "junction_factor", "peak_hour_factor", "cis"])
    out_df = compute_anomaly_flags(df)
    assert out_df.empty
    assert "ai_risk_flag" in out_df.columns
