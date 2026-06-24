from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from models.predictive_hotspots import get_top_forecasts, predict_hotspot_risk

router = APIRouter()

@router.get("/forecast", summary="Get predicted high‑risk hotspots", response_description="Array of forecasted hotspot records")
async def forecast(top_n: int = 10) -> List[Dict[str, Any]]:
    """Return the top N predicted hotspots.

    The response contains fields:
        - h3_index
        - station
        - predicted_risk (NORMAL, MODERATE, HIGH, CRITICAL)
        - confidence (float 0‑1)
        - predicted_cis (float)
        - time_horizon (string)
    """
    try:
        results = get_top_forecasts(top_n)
        return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/forecast/{h3_cell}", summary="Predict risk for a single H3 cell")
async def forecast_single(h3_cell: str) -> Dict[str, Any]:
    """Return prediction for a specific hotspot cell.

    Example response:
    {
        "predicted_risk": "HIGH",
        "confidence": 0.91,
        "predicted_cis": 92.4,
        "time_horizon": "next hour"
    }
    """
    try:
        return predict_hotspot_risk(h3_cell)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
