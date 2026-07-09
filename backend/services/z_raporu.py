"""Z-style report generator for Olay Takip."""
from datetime import datetime
from typing import Literal, Optional

import pandas as pd

from services.olay_analiz import add_derived_columns


def _period_label(dates: pd.Series, granularity: str) -> pd.Series:
    if granularity == "daily":
        return dates.dt.strftime("%Y-%m-%d")
    if granularity == "weekly":
        return dates.dt.strftime("%G-W%V")
    if granularity == "monthly":
        return dates.dt.to_period("M").astype(str)
    if granularity == "quarterly":
        return dates.dt.to_period("Q").astype(str)
    if granularity == "half_yearly":
        return dates.dt.year.astype(str) + "-H" + ((dates.dt.month - 1) // 6 + 1).astype(str)
    if granularity == "yearly":
        return dates.dt.to_period("Y").astype(str)
    raise ValueError(f"Unsupported granularity: {granularity}")


def compute_z_report(
    df: pd.DataFrame,
    granularity: Literal["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] = "monthly",
    reference_date: Optional[datetime] = None,
) -> list:
    """Return a list of period summaries."""
    if "gelis_tarihi" not in df.columns:
        return []
    enriched = add_derived_columns(df, reference_date)
    g = pd.to_datetime(enriched["gelis_tarihi"], errors="coerce")
    period = _period_label(g, granularity)
    valid = enriched[period.notna()].copy()
    if valid.empty:
        return []
    valid["_period"] = period[period.notna()]

    rows = []
    for p in sorted(valid["_period"].unique()):
        sub = valid[valid["_period"] == p]
        row = {
            "period": str(p),
            "total": int(len(sub)),
            "unique_people": int(sub["tc"].nunique()) if "tc" in sub.columns else int(len(sub)),
        }
        # Gender counts
        cins_counts = sub["_cinsiyet"].value_counts()
        row["erkek"] = int(cins_counts.get("Erkek", 0))
        row["kadin"] = int(cins_counts.get("Kadın", 0))
        # Top topic
        if "konu" in sub.columns:
            topics = sub["konu"].astype(str).str.strip().value_counts()
            row["top_konu"] = topics.index[0] if len(topics) else None
            row["top_konu_count"] = int(topics.iloc[0]) if len(topics) else 0
        else:
            row["top_konu"] = None
            row["top_konu_count"] = 0
        # Top province / district
        if "ikamet_il" in sub.columns:
            il = sub["ikamet_il"].astype(str).str.strip().value_counts()
            row["top_il"] = il.index[0] if len(il) else None
            row["top_il_count"] = int(il.iloc[0]) if len(il) else 0
        else:
            row["top_il"] = None
            row["top_il_count"] = 0
        if "ikamet_ilce" in sub.columns:
            ilce = sub["ikamet_ilce"].astype(str).str.strip().value_counts()
            row["top_ilce"] = ilce.index[0] if len(ilce) else None
            row["top_ilce_count"] = int(ilce.iloc[0]) if len(ilce) else 0
        else:
            row["top_ilce"] = None
            row["top_ilce_count"] = 0
        # Repeated visits in period
        if "tc" in sub.columns:
            tc_counts = sub["tc"].value_counts()
            row["repeated_people"] = int((tc_counts > 1).sum())
            row["repeated_visits"] = int(tc_counts[tc_counts > 1].sum())
        else:
            row["repeated_people"] = 0
            row["repeated_visits"] = 0
        rows.append(row)
    return rows
