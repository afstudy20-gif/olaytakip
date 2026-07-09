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


def compute_z_report_detail(
    df: pd.DataFrame,
    granularity: Literal["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"] = "monthly",
    reference_date: Optional[datetime] = None,
) -> list:
    """Return one row per visit with entry number and previous visits.

    Rows are ordered by the visit date. The ``giris_no`` column indicates
    which visit this is for the person (based on ``tc``). Previous visits,
    their ``konu`` and ``olay_ozeti`` values are included as joined strings.
    """
    if "gelis_tarihi" not in df.columns:
        return []

    enriched = df.copy()
    g = pd.to_datetime(enriched["gelis_tarihi"], errors="coerce")
    enriched["_gelis_dt"] = g
    enriched["_period"] = _period_label(g, granularity)
    valid = enriched[g.notna()].copy()
    if valid.empty:
        return []

    valid["_orig_idx"] = valid.index
    valid["_gelis_str"] = g[g.notna()].dt.strftime("%Y-%m-%d")
    cols = set(df.columns)

    has_tc = "tc" in cols
    if has_tc:
        valid = valid.sort_values(["tc", "_gelis_dt", "_orig_idx"])
        valid["_giris_no"] = valid.groupby("tc").cumcount() + 1
        valid["_toplam_giris"] = valid.groupby("tc")["tc"].transform("size")
    else:
        valid = valid.sort_values(["_gelis_dt", "_orig_idx"])
        valid["_giris_no"] = 1
        valid["_toplam_giris"] = 1

    def _as_str(val) -> str:
        if pd.isna(val):
            return ""
        s = str(val).strip()
        return s if s.lower() not in {"nan", "none", ""} else ""

    rows = []
    groups = valid.groupby("tc" if has_tc else "_orig_idx", sort=False) if has_tc else [(None, valid)]
    for _key, group in groups:
        prev_dates = []
        prev_konular = []
        prev_ozetler = []
        for _, row in group.iterrows():
            record: dict = {
                "period": str(row["_period"]),
                "tc": row["tc"] if has_tc else None,
                "gelis_tarihi": row["_gelis_str"],
                "giris_no": int(row["_giris_no"]),
                "toplam_giris": int(row["_toplam_giris"]),
                "onceki_gelis_tarihleri": "; ".join(prev_dates) if prev_dates else None,
                "onceki_konular": "; ".join(prev_konular) if prev_konular else None,
                "onceki_olay_ozetleri": "; ".join(prev_ozetler) if prev_ozetler else None,
            }
            if "adi" in cols:
                record["adi"] = row["adi"]
            if "soyadi" in cols:
                record["soyadi"] = row["soyadi"]
            if "konu" in cols:
                record["konu"] = row["konu"]
            if "olay_ozeti" in cols:
                record["olay_ozeti"] = row["olay_ozeti"]
            rows.append(record)

            prev_dates.append(str(row["_gelis_str"]))
            if "konu" in cols:
                k = _as_str(row["konu"])
                if k:
                    prev_konular.append(k)
            if "olay_ozeti" in cols:
                o = _as_str(row["olay_ozeti"])
                if o:
                    prev_ozetler.append(o)

    rows.sort(key=lambda r: (r["period"], r.get("tc") or "", r["giris_no"]))
    return rows
