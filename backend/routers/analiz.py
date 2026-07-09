"""Analysis endpoints for Olay Takip."""
import io
import json
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from services import store
from services.olay_analiz import compute_summary
from services.z_raporu import compute_z_report, compute_z_report_detail
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


@router.get("/zreport/detail")
async def zreport_detail(
    session_id: str = Query(...),
    granularity: Literal["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] = Query("monthly"),
    filters: Optional[str] = Query(None),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _apply_filters(df, filters)
    return {"granularity": granularity, "rows": compute_z_report_detail(df, granularity=granularity)}


@router.get("/zreport/export")
async def zreport_export(
    session_id: str = Query(...),
    granularity: Literal["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] = Query("monthly"),
    filters: Optional[str] = Query(None),
    fmt: str = Query("xlsx", pattern="^(csv|xlsx)$"),
    columns: Optional[str] = Query(None),
    detail: bool = Query(False),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _apply_filters(df, filters)
    rows = (
        compute_z_report_detail(df, granularity=granularity)
        if detail
        else compute_z_report(df, granularity=granularity)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No Z report data to export")
    out_df = pd.DataFrame(rows)
    if columns:
        selected = [c.strip() for c in columns.split(",") if c.strip() in out_df.columns]
        if selected:
            out_df = out_df[selected]
    base = f"zreport_{'detail_' if detail else ''}{granularity}"
    if fmt == "csv":
        buf = io.StringIO()
        out_df.to_csv(buf, index=False)
        content = buf.getvalue().encode("utf-8-sig")
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base}.csv"'},
        )
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        out_df.to_excel(writer, index=False, sheet_name="ZReport")
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{base}.xlsx"'},
    )


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
