"""
ml_intelligence.py — Unsupervised ML validations for ParkSentinel

This module applies genuine, unsupervised machine learning techniques to validate the
deterministic heuristic formulas used in preprocess.py.

1. DBSCAN (Density-Based Spatial Clustering of Applications with Noise)
   Why: The H3 hex grid is an arbitrary geometric overlay. A high violation count in an
   H3 cell might just be scattered noise that happened to fall inside the boundaries.
   DBSCAN independently searches for *actual* spatial density without grid bias. If
   DBSCAN fails to find a real cluster among the cell's points, we flag the cell as
   unconfirmed.

2. IsolationForest
   Why: The deterministic Congestion Impact Score (CIS) formula is heavily weighted by
   raw volume. An emerging, highly severe hotspot (e.g. blocking an emergency lane
   during peak hours) might rank low simply because it only has 5 violations so far.
   IsolationForest evaluates the holistic profile (severity, junction proximity, peak
   hours) against the station's own peers to flag anomalies that "punch above their
   weight."
"""

import logging
import warnings

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

try:
    from sklearn.cluster import DBSCAN
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


def validate_hotspots_dbscan(
    df: pd.DataFrame, eps_meters: float = 200.0, min_samples: int = 3
) -> dict[tuple[str, str], bool]:
    """Validate if H3 cells represent genuine spatial density clusters using DBSCAN.

    Runs DBSCAN independently per police_station using the haversine distance metric.
    An H3 cell (hotspot) is validated (True) if at least 50% of the raw points inside it
    are part of any actual DBSCAN cluster (i.e. not classified as -1/noise).
    Dynamically adjusts `eps` based on the spatial spread of the station.

    Args:
        df: Raw validated records containing `police_station`, `h3_index`, `latitude`,
            and `longitude`.
        eps_meters: The fallback maximum distance between two samples.
        min_samples: The number of samples in a neighborhood for a point to be
            considered as a core point.

    Returns:
        A dictionary mapping `(police_station, h3_index)` tuples to a boolean flag.
        If sklearn is not installed, returns an empty dictionary.
    """
    if not SKLEARN_AVAILABLE:
        logger.warning(
            "scikit-learn is not installed. Skipping DBSCAN validation. "
            "Install with `pip install scikit-learn`."
        )
        return {}

    if df.empty:
        return {}

    EARTH_RADIUS_METERS = 6371000.0

    results: dict[tuple[str, str], bool] = {}

    grouped = df.groupby("police_station")
    for station, group in grouped:
        if len(group) < min_samples:
            # Cannot form a cluster, so all cells for this station are invalid
            for h3_idx in group["h3_index"].unique():
                if pd.notna(h3_idx):
                    results[(str(station), str(h3_idx))] = False
            continue

        # Convert to radians for haversine
        coords = group[["latitude", "longitude"]].values
        coords_rad = np.radians(coords)
        
        # Dynamically calculate EPS based on standard deviation of coordinates
        lat_std = coords[:, 0].std()
        lon_std = coords[:, 1].std()
        # Approximate degrees to meters (1 degree ~ 111,320 meters at equator)
        lat_meters = lat_std * 111320.0
        lon_meters = lon_std * 111320.0 * np.cos(np.radians(coords[:, 0].mean()))
        
        spread_meters = np.sqrt(lat_meters**2 + lon_meters**2)
        # Clamp between 50m and 300m
        dynamic_eps_meters = float(np.clip(spread_meters, 50.0, 300.0))
        
        eps_radians = dynamic_eps_meters / EARTH_RADIUS_METERS

        dbscan = DBSCAN(eps=eps_radians, min_samples=min_samples, metric="haversine")
        labels = dbscan.fit_predict(coords_rad)

        cluster_count = len(set(labels)) - (1 if -1 in labels else 0)
        noise_count = (labels == -1).sum()
        logger.info(
            "DBSCAN [%s]: %d points -> %d real clusters found, %d noise points. (Dynamic eps: %.1fm)",
            station, len(group), cluster_count, noise_count, dynamic_eps_meters
        )

        group_with_labels = group.copy()
        group_with_labels["is_clustered"] = labels != -1

        h3_groups = group_with_labels.groupby("h3_index")
        for h3_idx, h3_group in h3_groups:
            clustered_ratio = h3_group["is_clustered"].mean()
            # Validated if >= 50% of points are part of a real density cluster
            is_valid = bool(clustered_ratio >= 0.5)
            results[(str(station), str(h3_idx))] = is_valid

    return results


def compute_anomaly_flags(
    cis_df: pd.DataFrame, contamination: float = 0.1, random_state: int = 42
) -> pd.DataFrame:
    """Identify 'emerging risk' hotspots using IsolationForest.

    Runs an IsolationForest model independently per police_station. A hotspot is
    anomalous if its severity profile diverges significantly from its peers, which
    catches low-volume but highly-disruptive hotspots that the linear CIS formula misses.

    Args:
        cis_df: A DataFrame of grouped hotspot records (one row per hotspot).
        contamination: The expected proportion of outliers in the data set.
        random_state: Seed for reproducibility.

    Returns:
        A copy of `cis_df` with two new columns: `ai_anomaly_score` (float) and
        `ai_risk_flag` (bool).
    """
    out_df = cis_df.copy()
    out_df["ai_anomaly_score"] = 0.0
    out_df["ai_risk_flag"] = False

    if not SKLEARN_AVAILABLE:
        logger.warning(
            "scikit-learn is not installed. Skipping IsolationForest anomalies. "
        )
        return out_df

    if out_df.empty:
        return out_df

    features = [
        "violation_count",
        "weighted_severity_mean",
        "junction_factor",
        "peak_hour_factor",
        "cis",
    ]

    grouped = out_df.groupby("police_station")
    for station, group in grouped:
        if len(group) < 8:
            logger.info(
                "IsolationForest [%s]: Only %d hotspots. Using threshold fallback.",
                station, len(group)
            )
            # Threshold fallback for small stations
            cis_values = group["cis"].values
            mean_cis = cis_values.mean()
            std_cis = cis_values.std()
            threshold = mean_cis + 2 * std_cis if std_cis > 0 else float('inf')
            preds = np.where(cis_values > threshold, -1, 1)
            # Mock score: negative distance from threshold (lower = more anomalous)
            scores = -np.abs(cis_values - mean_cis)
            
            out_df.loc[group.index, "ai_anomaly_score"] = scores
            out_df.loc[group.index, "ai_risk_flag"] = preds == -1
            
            flagged_count = (preds == -1).sum()
            logger.info(
                "Fallback [%s]: Evaluated %d hotspots -> flagged %d as anomalous risks.",
                station, len(group), flagged_count
            )
            continue

        X = group[features].fillna(0).values

        model = IsolationForest(
            contamination=contamination, random_state=random_state
        )
        model.fit(X)

        # decision_function: lower means more anomalous
        scores = model.decision_function(X)
        # predict: -1 for anomaly, 1 for normal
        preds = model.predict(X)

        out_df.loc[group.index, "ai_anomaly_score"] = scores
        out_df.loc[group.index, "ai_risk_flag"] = preds == -1

        flagged_count = (preds == -1).sum()
        logger.info(
            "IsolationForest [%s]: Evaluated %d hotspots -> flagged %d as anomalous risks.",
            station, len(group), flagged_count
        )

    return out_df
