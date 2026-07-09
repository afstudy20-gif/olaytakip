"""Analysis helpers for the Olay Takip incident tracking dataset."""
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd


def _today() -> datetime:
    return datetime.now()


def extract_cinsiyet(df: pd.DataFrame) -> pd.Series:
    """Return a cinsiyet series: explicit column wins, else TC last digit."""
    if "cinsiyet" in df.columns:
        s = df["cinsiyet"].astype(str).str.strip().str.lower()
        mapped = s.map({"e": "Erkek", "erkek": "Erkek", "k": "Kadın", "kadın": "Kadın", "kadin": "Kadın"})
        return mapped.fillna("Belirtilmemiş")
    if "tc" not in df.columns:
        return pd.Series(["Belirtilmemiş"] * len(df), index=df.index)
    tc = df["tc"].astype(str).str.strip()
    last = tc.str[-1:]
    # Odd -> male, even -> female in Turkish ID convention.
    def map_digit(d):
        if d in "13579":
            return "Erkek"
        if d in "02468":
            return "Kadın"
        return "Belirtilmemiş"
    return last.apply(map_digit)


def extract_yas(df: pd.DataFrame, reference_date: Optional[datetime] = None) -> pd.Series:
    """Calculate age from dogum_tarihi."""
    if "dogum_tarihi" not in df.columns:
        return pd.Series([np.nan] * len(df), index=df.index)
    ref = reference_date or _today()
    dob = pd.to_datetime(df["dogum_tarihi"], errors="coerce")
    age = (ref - dob).dt.days / 365.2425
    return age


def yas_grubu(age: float) -> str:
    if pd.isna(age):
        return "Bilinmiyor"
    age = int(age)
    if age < 18:
        return "0-17"
    if age <= 24:
        return "18-24"
    if age <= 34:
        return "25-34"
    if age <= 44:
        return "35-44"
    if age <= 54:
        return "45-54"
    if age <= 64:
        return "55-64"
    return "65+"


def extract_yas_grubu(df: pd.DataFrame, reference_date: Optional[datetime] = None) -> pd.Series:
    return extract_yas(df, reference_date).apply(yas_grubu)


def extract_mahalle(df: pd.DataFrame) -> pd.Series:
    """Return explicit mahalle if present; otherwise try splitting ikamet_ilce."""
    if "mahalle" in df.columns:
        return df["mahalle"].astype(str).str.strip().replace(["nan", "", "None"], np.nan)
    # With separate ikamet_il/ikamet_ilce columns we can no longer derive mahalle.
    if "ikamet_il" in df.columns:
        return pd.Series([np.nan] * len(df), index=df.index)
    if "ikamet_ilce" not in df.columns:
        return pd.Series([np.nan] * len(df), index=df.index)
    parts = df["ikamet_ilce"].astype(str).str.split(",", n=1, expand=True)
    # If value has a comma, second part may be neighbourhood (legacy format).
    if parts.shape[1] > 1:
        mahalle = parts[1].str.strip().replace(["", "nan", "None"], np.nan)
        return mahalle
    return pd.Series([np.nan] * len(df), index=df.index)


def add_derived_columns(df: pd.DataFrame, reference_date: Optional[datetime] = None) -> pd.DataFrame:
    """Return a copy with derived cinsiyet, yas, yas_grubu, mahalle, giris_no."""
    out = df.copy()
    out["_cinsiyet"] = extract_cinsiyet(out)
    out["_yas"] = extract_yas(out, reference_date)
    out["_yas_grubu"] = extract_yas_grubu(out, reference_date)
    out["_mahalle"] = extract_mahalle(out)
    out["_giris_no"] = 1
    if "tc" in out.columns:
        tc_clean = out["tc"].astype(str).str.strip()
        out["_giris_no"] = tc_clean.groupby(tc_clean).cumcount() + 1
    return out


def _infer_kind(s: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(s):
        return "date"
    if pd.api.types.is_numeric_dtype(s):
        return "numeric"
    # Try numeric conversion on string values to detect numeric-like columns stored as object.
    if s.dtype == object:
        cleaned = s.astype(str).str.replace(",", ".", regex=False)
        converted = pd.to_numeric(cleaned, errors="coerce")
        if converted.notna().sum() / max(len(s) - s.isna().sum(), 1) > 0.8:
            return "numeric"
    return "categorical"


def _histogram(series: pd.Series, bins: int = 10) -> list:
    vals = series.dropna()
    if vals.empty:
        return []
    mn = float(vals.min())
    mx = float(vals.max())
    if mn == mx:
        return [{"bin": f"{mn:.2f}", "count": int(len(vals)), "range": [mn, mx]}]
    edges = np.linspace(mn, mx, bins + 1)
    counts, _ = np.histogram(vals, bins=edges)
    out = []
    for i, c in enumerate(counts):
        lo = float(edges[i])
        hi = float(edges[i + 1])
        out.append({"bin": f"{lo:.2f} - {hi:.2f}", "count": int(c), "range": [lo, hi]})
    return out


def column_summary(series: pd.Series, kind: Optional[str] = None) -> dict:
    if kind is None:
        kind = _infer_kind(series)
    s = series.copy()
    total = len(s)
    missing = int(s.isna().sum())
    if s.dtype == object:
        missing += int(s.astype(str).str.strip().isin(["", "nan", "None", "NaN"]).sum())
    non_null = max(total - missing, 0)
    unique = int(s.dropna().astype(str).str.strip().nunique())
    result = {
        "name": str(series.name),
        "kind": kind,
        "count": total,
        "missing": missing,
        "unique": unique,
    }
    if kind == "numeric":
        nums = pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")
        clean = nums.dropna()
        if not clean.empty:
            result["min"] = float(clean.min())
            result["max"] = float(clean.max())
            result["mean"] = float(clean.mean())
            result["median"] = float(clean.median())
            result["std"] = float(clean.std())
            result["histogram"] = _histogram(clean, bins=10)
    elif kind == "date":
        ds = pd.to_datetime(s, errors="coerce")
        clean = ds.dropna()
        if not clean.empty:
            result["min"] = str(clean.min())
            result["max"] = str(clean.max())
            result["distribution"] = distribution(ds.dt.strftime("%Y-%m"), top_n=12)
    else:
        result["top_values"] = distribution(s, top_n=10)
    return result


def distribution(series: pd.Series, top_n: Optional[int] = None, dropna: bool = True) -> list:
    s = series.copy()
    if dropna:
        s = s.dropna()
    s = s.astype(str).str.strip().replace(["nan", "None", ""], np.nan).dropna()
    counts = s.value_counts()
    if top_n:
        counts = counts.head(top_n)
    total = counts.sum()
    return [
        {"value": val, "count": int(cnt), "percent": round(100 * cnt / total, 2) if total else 0}
        for val, cnt in counts.items()
    ]


def compute_summary(df: pd.DataFrame, reference_date: Optional[datetime] = None) -> dict:
    enriched = add_derived_columns(df, reference_date)
    total = len(enriched)
    unique_people = enriched["tc"].nunique() if "tc" in enriched.columns else total
    repeated = 0
    if "tc" in enriched.columns:
        tc_counts = enriched["tc"].value_counts()
        repeated = int((tc_counts > 1).sum())

    out = {
        "total_records": total,
        "unique_people": int(unique_people),
        "repeated_people": int(repeated),
        "cinsiyet": distribution(enriched["_cinsiyet"]),
        "yas_grubu": distribution(enriched["_yas_grubu"]),
    }
    if "ikamet_il" in enriched.columns:
        out["il"] = distribution(enriched["ikamet_il"].astype(str).str.strip(), top_n=20)
    if "ikamet_ilce" in enriched.columns:
        out["ilce"] = distribution(enriched["ikamet_ilce"].astype(str).str.strip(), top_n=20)
    if "_mahalle" in enriched.columns:
        mahalle = enriched["_mahalle"].dropna()
        if len(mahalle):
            out["mahalle"] = distribution(mahalle, top_n=20)
    if "konu" in enriched.columns:
        out["konu"] = distribution(enriched["konu"].astype(str).str.strip(), top_n=20)
    if "gelis_tarihi" in enriched.columns:
        g = pd.to_datetime(enriched["gelis_tarihi"], errors="coerce")
        monthly = g.dt.to_period("M").value_counts().sort_index()
        out["aylik_gelis"] = [
            {"ay": str(p), "count": int(c)} for p, c in monthly.items()
        ]
    out["columns"] = [column_summary(df[col]) for col in df.columns]
    return out
