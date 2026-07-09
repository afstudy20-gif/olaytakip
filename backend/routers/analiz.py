"""Analysis endpoints for Olay Takip."""
import json
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services import store
from services.olay_analiz import compute_summary
from services.z_raporu import compute_z_report
from services.plot_data import compute_all_charts

router = APIRouter()


def _apply_filters(df: pd.DataFrame, filters_json: Optional[str]) -> pd.DataFrame:
    if not filters_json:
        return df
    try:
        filters = json.loads(filters_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid filters JSON") from exc
    active = {k: str(v).strip() for k, v in (filters or {}).items() if str(v).strip()}
    if not active:
        return df
    mask = pd.Series(True, index=df.index)
    for col, query in active.items():
        if col not in df.columns:
            continue
        mask &= df[col].astype(str).str.lower().str.contains(query.lower(), na=False)
    return df[mask]


class SummaryResponse(BaseModel):
    total_records: int
    unique_people: int
    repeated_people: int
    cinsiyet: list
    yas_grubu: list
    columns: list


@router.get("/summary")
async def summary(
    session_id: str = Query(...),
    filters: Optional[str] = Query(None),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _apply_filters(df, filters)
    return compute_summary(df)


@router.get("/zreport")
async def zreport(
    session_id: str = Query(...),
    granularity: Literal["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] = Query("monthly"),
    filters: Optional[str] = Query(None),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _apply_filters(df, filters)
    return {"granularity": granularity, "rows": compute_z_report(df, granularity=granularity)}


@router.get("/charts")
async def charts(
    session_id: str = Query(...),
    filters: Optional[str] = Query(None),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _apply_filters(df, filters)
    return compute_all_charts(df)
