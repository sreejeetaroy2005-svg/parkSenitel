import os
import json
import joblib
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd
import numpy as np

# Always import sklearn (used for LabelEncoder even with XGBoost)
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import LabelEncoder

# XGBoost is optional; fallback to RandomForest if unavailable
try:
    from xgboost import XGBClassifier, XGBRegressor
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data" / "processed"
MODEL_DIR = PROJECT_ROOT / "models" / "artifacts"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

CLASSIFIER_PATH = MODEL_DIR / "forecast_classifier.pkl"
REGRESSOR_PATH = MODEL_DIR / "forecast_regressor.pkl"

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _load_hotspot_data() -> pd.DataFrame:
    """Read all hotspot JSON files produced by the preprocessing pipeline.

    Returns a DataFrame with one row per hotspot (the same shape as the original
    `HotspotRecord` plus the OSM feature columns that were added earlier.
    """
    records: List[Dict[str, Any]] = []
    for json_file in DATA_DIR.glob("*.json"):
        with json_file.open(encoding="utf-8") as f:
            data = json.load(f)
            for rec in data:
                # Attach the station name (derived from the filename) for grouping
                rec["station"] = json_file.stem.replace("_", " ")
                records.append(rec)
    if not records:
        raise FileNotFoundError(f"No hotspot JSON files found in {DATA_DIR}")
    df = pd.DataFrame.from_records(records)
    return df

def _prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create the feature matrix used by the models.

    The function expects the following columns to exist in *df*:
    - cis, violation_count, road_weight, intersection_density,
      distance_to_junction, traffic_signal_present, connectivity_score,
      ai_risk_flag (bool)
    It adds simple numeric conversions and returns a DataFrame ready for XGBoost/Sklearn.
    """
    # Ensure boolean columns are numeric
    df = df.copy()
    
    # Fill missing expected features with 0
    expected_cols = [
        "road_weight",
        "intersection_density",
        "distance_to_junction",
        "traffic_signal_present",
        "connectivity_score"
    ]
    for col in expected_cols:
        if col not in df.columns:
            df[col] = 0

    df["traffic_signal_present"] = df["traffic_signal_present"].astype(int)
    df["ai_risk_flag"] = df["ai_risk_flag"].fillna(False).astype(int)

    # Target risk label based on CIS thresholds (heuristic)
    risk_bins = [-np.inf, 30, 60, 80, np.inf]
    risk_labels = ["NORMAL", "MODERATE", "HIGH", "CRITICAL"]
    df["risk_label"] = pd.cut(df["cis"], bins=risk_bins, labels=risk_labels)

    feature_cols = [
        "cis",
        "violation_count",
        "road_weight",
        "intersection_density",
        "distance_to_junction",
        "traffic_signal_present",
        "connectivity_score",
        "ai_risk_flag",
    ]
    return df[feature_cols + ["risk_label"]]

# ---------------------------------------------------------------------------
# Model training / persistence
# ---------------------------------------------------------------------------

def train_forecast_models(overwrite: bool = False) -> None:
    """Train classification and regression models for hotspot risk forecasting.

    The function reads the historical hotspot data, builds features, fits an XGBoost
    classifier (or RandomForest fallback) and an XGBoost regressor for CIS prediction.
    Models are saved under ``MODEL_DIR``.
    """
    if CLASSIFIER_PATH.exists() and not overwrite:
        print(f"Classifier already exists at {CLASSIFIER_PATH}. Use overwrite=True to retrain.")
        return
    df = _load_hotspot_data()
    feat_df = _prepare_features(df)

    # Drop rows where target or features contain NaN
    feat_df = feat_df.dropna()
    df = df.loc[feat_df.index]

    X = feat_df.drop(columns=["risk_label"]).astype(float)
    y_cls = feat_df["risk_label"].astype(str)
    y_reg = df["cis"].astype(float)

    if XGB_AVAILABLE:
        clf = XGBClassifier(
            objective="multi:softprob",
            eval_metric="mlogloss",
            use_label_encoder=False,
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
        )
        reg = XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
        )
    else:
        clf = RandomForestClassifier(n_estimators=200, max_depth=12, random_state=42)
        reg = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42)
        # Encode labels for sklearn version
        le = LabelEncoder()
        y_cls = le.fit_transform(y_cls)
        clf.fit(X, y_cls)
        reg.fit(X, y_reg)
        # Save sklearn encoder with classifier
        joblib.dump({"model": clf, "le": le}, CLASSIFIER_PATH)
        joblib.dump(reg, REGRESSOR_PATH)
        print("Forecast models trained and saved (sklearn fallback).")
        return

    # Encode string labels for the XGBoost version
    le = LabelEncoder()
    y_cls_enc = le.fit_transform(y_cls)
    clf.fit(X, y_cls_enc)
    reg.fit(X, y_reg)

    # Persist models and encoder together
    joblib.dump({"model": clf, "le": le}, CLASSIFIER_PATH)
    joblib.dump(reg, REGRESSOR_PATH)
    print("Forecast models trained and saved.")

# ---------------------------------------------------------------------------
# Inference utilities
# ---------------------------------------------------------------------------

def _load_models():
    if not CLASSIFIER_PATH.exists() or not REGRESSOR_PATH.exists():
        raise FileNotFoundError("Forecast models not found – run train_forecast_models() first.")
    clf_bundle = joblib.load(CLASSIFIER_PATH)
    classifier = clf_bundle["model"]
    le = clf_bundle["le"]
    regressor = joblib.load(REGRESSOR_PATH)
    return classifier, le, regressor

def predict_hotspot_risk(h3_cell: str) -> Dict[str, Any]:
    """Predict risk for a single H3 cell.

    Returns a dictionary matching the specification:
    {
        "predicted_risk": "HIGH",
        "confidence": 0.91,
        "predicted_cis": 92.4,
        "time_horizon": "next hour"
    }
    """
    df = _load_hotspot_data()
    row = df[df["h3_index"] == h3_cell]
    if row.empty:
        raise ValueError(f"H3 cell {h3_cell} not found in processed data.")
    # Build feature vector
    feature_vec = _prepare_features(row).drop(columns=["risk_label"]).astype(float)
    classifier, le, regressor = _load_models()
    # Classification probabilities
    probs = classifier.predict_proba(feature_vec)[0]
    pred_idx = int(np.argmax(probs))
    pred_label = le.inverse_transform([pred_idx])[0]
    confidence = float(probs[pred_idx])
    # Regression for CIS
    predicted_cis = float(regressor.predict(feature_vec)[0])
    return {
        "predicted_risk": pred_label,
        "confidence": round(confidence, 3),
        "predicted_cis": round(predicted_cis, 2),
        "time_horizon": "next hour",
    }

def get_top_forecasts(top_n: int = 10) -> List[Dict[str, Any]]:
    """Return the *top_n* hotspots ranked by confidence and severity.

    The function runs prediction for every hotspot currently in the processed
    dataset, then sorts by a composite score (confidence × risk severity weight).
    """
    df = _load_hotspot_data()
    classifier, le, regressor = _load_models()
    feature_df = _prepare_features(df).drop(columns=["risk_label"]).astype(float)
    probs = classifier.predict_proba(feature_df)
    pred_idxs = np.argmax(probs, axis=1)
    pred_labels = le.inverse_transform(pred_idxs)
    confidences = probs[np.arange(len(probs)), pred_idxs]
    # Simple severity weighting for sorting
    severity_map = {"NORMAL": 0, "MODERATE": 1, "HIGH": 2, "CRITICAL": 3}
    severity = np.vectorize(severity_map.get)(pred_labels)
    score = confidences * (severity + 1)
    top_idx = np.argsort(score)[::-1][:top_n]
    results = []
    for idx in top_idx:
        h3 = df.iloc[idx]["h3_index"]
        results.append({
            "h3_index": h3,
            "predicted_risk": pred_labels[idx],
            "confidence": round(float(confidences[idx]), 3),
            "predicted_cis": round(float(regressor.predict(feature_df.iloc[[idx]])[0]), 2),
            "time_horizon": "next hour",
            "station": df.iloc[idx]["station"],
        })
    return results
