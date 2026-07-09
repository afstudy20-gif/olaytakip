"""Upload endpoints for Excel/CSV data into a session."""
import io
import json
import re
import uuid
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from services import store

router = APIRouter()


# Maps common Turkish column names to canonical snake_case names.
COLUMN_ALIASES = {
    # Names / identity
    "adi": "adi",
    "adı": "adi",
    "isim": "adi",
    "ad": "adi",
    "soyadi": "soyadi",
    "soyadı": "soyadi",
    "soyad": "soyadi",
    "tc": "tc",
    "tckn": "tc",
    "tc_kimlik_no": "tc",
    "dogum_yeri": "dogum_yeri",
    "doğum_yeri": "dogum_yeri",
    "dogumyeri": "dogum_yeri",
    # Dates
    "dogum_tarihi": "dogum_tarihi",
    "doğum_tarihi": "dogum_tarihi",
    "dogumtarihi": "dogum_tarihi",
    "dt": "dogum_tarihi",
    "gelis_tarihi": "gelis_tarihi",
    "geliş_tarihi": "gelis_tarihi",
    "gelistarihi": "gelis_tarihi",
    "geliştarihi": "gelis_tarihi",
    "g_tarihi": "gelis_tarihi",
    # Contact / residence
    "iletisim_gsm": "iletisim_gsm",
    "iletişim_gsm": "iletisim_gsm",
    "gsm": "iletisim_gsm",
    "telefon": "iletisim_gsm",
    "ikamet_ilce": "ikamet_ilce",
    "ikamet_ilçe": "ikamet_ilce",
    "ikametilce": "ikamet_ilce",
    "ilce": "ikamet_ilce",
    "ilçe": "ikamet_ilce",
    "mahalle": "mahalle",
    "mh": "mahalle",
    # Incident
    "konu": "konu",
    "konusu": "konu",
    "olay_ozeti": "olay_ozeti",
    "olay_özeti": "olay_ozeti",
    "ozet": "olay_ozeti",
    "özet": "olay_ozeti",
    # Optional explicit gender
    "cinsiyet": "cinsiyet",
    # Record timestamp
    "kayit_tarihi": "kayit_tarihi",
    "kayıt_tarihi": "kayit_tarihi",
    "kayit_tarih": "kayit_tarihi",
    "kayıt_tarih": "kayit_tarihi",
}

DATE_COLUMN_HINTS = {"dogum_tarihi", "gelis_tarihi", "kayit_tarihi"}
ID_LIKE_COLUMNS = {"tc", "iletisim_gsm"}


def _normalize_name(name: str) -> str:
    s = str(name).lower().strip()
    s = s.replace("  ", " ")
    s = re.sub(r"[^a-z0-9_çğıöşü ]", "", s, flags=re.UNICODE)
    s = s.replace(" ", "_")
    s = s.replace("ç", "c").replace("ğ", "g").replace("ı", "i")
    s = s.replace("ö", "o").replace("ş", "s").replace("ü", "u")
    return s


def _canonical_name(name: str) -> str:
    normalized = _normalize_name(name)
    return COLUMN_ALIASES.get(normalized, normalized)


def _parse_date_series(series: pd.Series) -> pd.Series:
    """Try multiple date formats; return datetime or object on failure."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    # First, try pandas mixed-format parser.
    try:
        parsed = pd.to_datetime(series.astype(str).replace("nan", pd.NaT), errors="coerce", dayfirst=True)
        if parsed.notna().sum() >= max(1, series.notna().sum() * 0.5):
            return parsed
    except Exception:
        pass
    # Try common Turkish formats explicitly.
    formats = ["%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%y", "%d/%m/%y"]
    for fmt in formats:
        try:
            parsed = pd.to_datetime(series, format=fmt, errors="coerce")
            if parsed.notna().sum() >= max(1, series.notna().sum() * 0.5):
                return parsed
        except Exception:
            continue
    return series


def _detect_kind(series: pd.Series) -> str:
    dtype = str(series.dtype)
    if "datetime" in dtype:
        return "date"
    if dtype == "bool":
        return "categorical"
    name = _normalize_name(str(series.name))
    if name in DATE_COLUMN_HINTS:
        return "date"
    if name in ID_LIKE_COLUMNS:
        return "text"
    # Try numeric
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().sum() >= series.notna().sum() * 0.8:
        unique_vals = set(numeric.dropna().unique())
        if len(unique_vals) <= 10 and len(unique_vals) > 1:
            return "categorical"
        return "numeric"
    # Categorical if few unique non-null values
    if series.notna().sum() > 0 and series.nunique(dropna=True) <= min(50, max(5, series.notna().sum() // 10)):
        return "categorical"
    return "text"


def coerce_numeric_objects(df: pd.DataFrame) -> pd.DataFrame:
    """After JSON round-trip, re-coerce object columns that are actually numeric."""
    for col in df.columns:
        if df[col].dtype == object:
            coerced = pd.to_numeric(df[col], errors="coerce")
            if coerced.notna().sum() >= df[col].notna().sum() * 0.8:
                df[col] = coerced
    return df


def _split_il_ilce(df: pd.DataFrame) -> pd.DataFrame:
    """If only 'ikamet_ilce' exists, split it into 'ikamet_il' and 'ikamet_ilce'."""
    if "ikamet_il" in df.columns or "ikamet_ilce" not in df.columns:
        return df
    s = df["ikamet_ilce"].astype(str).str.strip().replace(["nan", "None", ""], pd.NA)
    parts = s.str.split(",", n=1, expand=True)
    df = df.copy()
    df.insert(df.columns.get_loc("ikamet_ilce"), "ikamet_il", parts[0].str.strip())
    if parts.shape[1] > 1:
        df["ikamet_ilce"] = parts[1].str.strip()
    else:
        df["ikamet_ilce"] = pd.NA
    return df


def _ensure_record_date(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure a Kayıt Tarihi column exists as the left-most column."""
    if "kayit_tarihi" in df.columns:
        # Move to front if present elsewhere.
        cols = ["kayit_tarihi"] + [c for c in df.columns if c != "kayit_tarihi"]
        return df[cols]
    df = df.copy()
    df.insert(0, "kayit_tarihi", pd.NaT)
    return df


def _process_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    df = raw_df.copy()
    # Rename columns to canonical names where possible
    new_cols = {}
    for col in df.columns:
        canonical = _canonical_name(col)
        # Avoid collisions
        base = canonical
        suffix = 1
        while canonical in new_cols.values() or canonical in df.columns.drop(col, errors="ignore"):
            canonical = f"{base}_{suffix}"
            suffix += 1
        new_cols[col] = canonical
    df.rename(columns=new_cols, inplace=True)

    # Split combined il/ilce into separate columns
    df = _split_il_ilce(df)

    # Parse date columns by hint or by successful parse
    for col in df.columns:
        if _normalize_name(col) in DATE_COLUMN_HINTS:
            df[col] = _parse_date_series(df[col])
        elif _detect_kind(df[col]) == "date":
            df[col] = _parse_date_series(df[col])

    # Ensure a record-date column exists at the far left
    df = _ensure_record_date(df)
    return df


def _build_preview(df: pd.DataFrame) -> list:
    preview_df = df.head(2000).replace([np.inf, -np.inf], np.nan)
    return json.loads(
        preview_df.to_json(orient="records", default_handler=str, date_format="iso", date_unit="s")
    )


def _build_columns(df: pd.DataFrame) -> list:
    columns = []
    for col in df.columns:
        kind = _detect_kind(df[col])
        columns.append({
            "name": col,
            "original_name": None,
            "dtype": str(df[col].dtype),
            "kind": kind,
        })
    return columns


@router.post("/")
async def upload_file(file: UploadFile = File(...)):
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]
    content = await file.read()
    try:
        if ext == "csv":
            # Try comma, then semicolon, then tab
            for sep in [",", ";", "\t"]:
                try:
                    raw_df = pd.read_csv(io.BytesIO(content), sep=sep, engine="python")
                    if raw_df.shape[1] > 1:
                        break
                except Exception:
                    continue
            else:
                raw_df = pd.read_csv(io.BytesIO(content))
        elif ext in {"xlsx", "xls"}:
            raw_df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Only .csv, .xlsx, .xls files are supported")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    if raw_df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    df = _process_dataframe(raw_df)
    df = coerce_numeric_objects(df)

    session_id = str(uuid.uuid4())
    store.save(session_id, df, track_undo=False)
    store.set_filename(session_id, file.filename or "uploaded_data")

    return {
        "session_id": session_id,
        "filename": file.filename,
        "rows": len(df),
        "columns": _build_columns(df),
        "preview": _build_preview(df),
    }


@router.post("/blank")
async def create_blank_session():
    session_id = str(uuid.uuid4())
    col_names = ["kayit_tarihi", "adi", "soyadi", "tc", "dogum_tarihi", "gelis_tarihi",
                 "iletisim_gsm", "ikamet_il", "ikamet_ilce", "konu", "olay_ozeti"]
    df = pd.DataFrame({name: [None] * 5 for name in col_names})
    store.save(session_id, df, track_undo=False)
    store.set_filename(session_id, "Yeni oturum")
    return {
        "session_id": session_id,
        "filename": "Yeni oturum",
        "rows": len(df),
        "columns": _build_columns(df),
        "preview": _build_preview(df),
    }
