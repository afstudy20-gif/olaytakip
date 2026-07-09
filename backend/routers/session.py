"""Session management: editing, export, save/load."""
import io
import json
import time
import uuid
from typing import Any, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from services import store
from routers.upload import _detect_kind, _build_preview, _build_columns, coerce_numeric_objects, _ensure_record_date

router = APIRouter()


class CellUpdate(BaseModel):
    row_index: int
    column: str
    value: Optional[Any] = None


class RenameRequest(BaseModel):
    filename: str


class ColumnMetadataRequest(BaseModel):
    columns: dict


class AddColumnRequest(BaseModel):
    name: str
    default_value: Optional[Any] = None


class InsertColumnRequest(BaseModel):
    name: str
    reference_column: str
    position: str  # 'left' or 'right'
    default_value: Optional[Any] = None


class RenameColumnRequest(BaseModel):
    new_name: str


class ReorderColumnsRequest(BaseModel):
    column_order: list[str]


class RestoreTrashRequest(BaseModel):
    trash_index: int


class RowData(BaseModel):
    data: dict[str, Any] = {}


@router.get("/{session_id}")
async def get_session_info(session_id: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    original_cols = list(df.columns)
    df = _ensure_record_date(df)
    if list(df.columns) != original_cols:
        store.save(session_id, df)
    return {
        "session_id": session_id,
        "filename": store.get_filename(session_id) or f"session_{session_id[:8]}",
        "rows": len(df),
        "columns": _build_columns(df),
        "preview": _build_preview(df),
    }


@router.patch("/{session_id}/cell")
async def update_cell(session_id: str, body: CellUpdate):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{body.column}' not found")
    if body.row_index < 0 or body.row_index >= len(df):
        raise HTTPException(status_code=400, detail="Row index out of range")

    col_dtype = df[body.column].dtype
    val = body.value
    if val is not None and val != "":
        try:
            if col_dtype.kind in ("i", "u"):
                val = int(float(str(val)))
            elif col_dtype.kind == "f":
                val = float(str(val))
            elif np.issubdtype(col_dtype, np.datetime64):
                val = pd.to_datetime(str(val), dayfirst=True, errors="coerce")
                if pd.isna(val):
                    val = np.nan
        except (ValueError, TypeError):
            pass
    else:
        val = np.nan

    df = df.copy()
    df.at[body.row_index, body.column] = val
    store.save(session_id, df)

    stored = df.at[body.row_index, body.column]
    if hasattr(stored, "item"):
        stored = stored.item()
    try:
        if isinstance(stored, float) and (np.isnan(stored) or np.isinf(stored)):
            stored = None
    except (TypeError, ValueError):
        pass
    return {"row_index": body.row_index, "column": body.column, "value": stored}


@router.delete("/{session_id}/row/{row_index}")
async def delete_row(session_id: str, row_index: int):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if row_index < 0 or row_index >= len(df):
        raise HTTPException(status_code=400, detail="Invalid row index")
    row_data = df.iloc[row_index].to_dict()
    trash_index = store.trash_row(session_id, row_index, row_data)
    new_df = df.drop(df.index[row_index]).reset_index(drop=True)
    store.save(session_id, new_df)
    resp = _session_response(new_df, session_id)
    resp["trash_index"] = trash_index
    return resp


@router.post("/{session_id}/row")
async def add_row(session_id: str, body: RowData | None = None):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    df = _ensure_record_date(df)
    row_data = body.data if body else {}
    new_row = {col: row_data.get(col) for col in df.columns}
    if "kayit_tarihi" in new_row and (new_row["kayit_tarihi"] is None or new_row["kayit_tarihi"] == ""):
        new_row["kayit_tarihi"] = pd.Timestamp.now()
    new_df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.post("/{session_id}/row/{row_index}/duplicate")
async def duplicate_row(session_id: str, row_index: int):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if row_index < 0 or row_index >= len(df):
        raise HTTPException(status_code=400, detail="Invalid row index")
    row_data = df.iloc[row_index].to_dict()
    new_df = pd.concat([df, pd.DataFrame([row_data])], ignore_index=True)
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.post("/{session_id}/column")
async def add_column(session_id: str, body: AddColumnRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Column name cannot be empty")
    if name in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{name}' already exists")
    new_df = df.copy()
    new_df[name] = body.default_value
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.post("/{session_id}/column/insert")
async def insert_column(session_id: str, body: InsertColumnRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Column name cannot be empty")
    if name in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{name}' already exists")
    if body.reference_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Reference column '{body.reference_column}' not found")
    new_df = df.copy()
    loc = new_df.columns.get_loc(body.reference_column)
    insert_at = int(loc) + (1 if body.position == "right" else 0)
    new_df.insert(insert_at, name, body.default_value)
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.delete("/{session_id}/column/{column_name}")
async def delete_column(session_id: str, column_name: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found")
    trash_index = store.trash_column(session_id, column_name, df[column_name])
    new_df = df.drop(columns=[column_name])
    store.save(session_id, new_df)
    resp = _session_response(new_df, session_id)
    resp["trash_index"] = trash_index
    return resp


@router.patch("/{session_id}/column/{column_name}/rename")
async def rename_column(session_id: str, column_name: str, body: RenameColumnRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found")
    new_name = (body.new_name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Column name cannot be empty")
    if new_name in df.columns and new_name != column_name:
        raise HTTPException(status_code=400, detail=f"Column '{new_name}' already exists")
    new_df = df.rename(columns={column_name: new_name})
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.post("/{session_id}/column/{column_name}/duplicate")
async def duplicate_column(session_id: str, column_name: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column_name}' not found")
    base = f"{column_name}_kopya"
    new_name = base
    suffix = 1
    while new_name in df.columns:
        new_name = f"{base}_{suffix}"
        suffix += 1
    new_df = df.copy()
    loc = df.columns.get_loc(column_name)
    new_df.insert(loc + 1, new_name, df[column_name])
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.patch("/{session_id}/columns/order")
async def reorder_columns(session_id: str, body: ReorderColumnsRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if set(body.column_order) != set(df.columns):
        raise HTTPException(status_code=400, detail="Provided column order does not match existing columns")
    new_df = df[body.column_order]
    store.save(session_id, new_df)
    return _session_response(new_df, session_id)


@router.get("/{session_id}/export")
async def export_dataset(
    session_id: str,
    fmt: str = Query("xlsx", pattern="^(csv|xlsx)$"),
    filename: str = Query("data"),
):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    base = filename.rsplit(".", 1)[0] if "." in filename else filename

    if fmt == "csv":
        buf = io.StringIO()
        df.to_csv(buf, index=False)
        content = buf.getvalue().encode("utf-8-sig")
        return Response(content=content, media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{base}.csv"'})

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Data")
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{base}.xlsx"'},
    )


@router.get("/{session_id}/save_session")
async def save_session(session_id: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    payload = {
        "version": "1.0",
        "filename": store.get_filename(session_id) or f"session_{session_id[:8]}.json",
        "created": time.time(),
        "columns": _build_columns(df),
        "col_metadata": store.get_metadata(session_id),
        "data": json.loads(df.replace([np.inf, -np.inf], np.nan).to_json(orient="records", date_format="iso", default_handler=str)),
    }
    content = json.dumps(payload, allow_nan=False, default=str).encode("utf-8")
    safe_name = f"session_{session_id[:8]}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.post("/load_session")
async def load_session(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    if "data" not in payload:
        raise HTTPException(status_code=400, detail="Missing 'data' key")
    df = pd.DataFrame(payload["data"])
    df = coerce_numeric_objects(df)
    df = _ensure_record_date(df)
    new_session_id = str(uuid.uuid4())
    store.save(new_session_id, df)
    if payload.get("col_metadata"):
        store.save_metadata(new_session_id, payload["col_metadata"])
    if payload.get("filename"):
        store.set_filename(new_session_id, payload["filename"])
    return {
        "session_id": new_session_id,
        "filename": payload.get("filename", file.filename),
        "rows": len(df),
        "columns": _build_columns(df),
        "preview": _build_preview(df),
    }


@router.post("/{session_id}/rename")
async def rename_session(session_id: str, body: RenameRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    name = (body.filename or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="filename cannot be empty")
    store.set_filename(session_id, name)
    return {"status": "ok", "filename": name}


@router.post("/{session_id}/metadata")
async def save_metadata(session_id: str, body: ColumnMetadataRequest):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    store.save_metadata(session_id, body.columns)
    return {"status": "ok", "columns_updated": list(body.columns.keys())}


@router.get("/{session_id}/audit")
async def get_audit(session_id: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return store.get_audit(session_id)


@router.post("/{session_id}/undo")
async def undo_action(session_id: str):
    restored = store.undo(session_id)
    if restored is None:
        raise HTTPException(status_code=400, detail="Nothing to undo")
    return _session_response(restored, session_id)


@router.post("/{session_id}/redo")
async def redo_action(session_id: str):
    restored = store.redo(session_id)
    if restored is None:
        raise HTTPException(status_code=400, detail="Nothing to redo")
    return _session_response(restored, session_id)


@router.get("/{session_id}/trash")
async def get_trash(session_id: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return store.list_trash(session_id)


@router.post("/{session_id}/trash/restore_row")
async def restore_trash_row(session_id: str, body: RestoreTrashRequest):
    df = store.restore_row(session_id, body.trash_index)
    if df is None:
        raise HTTPException(status_code=400, detail="Invalid trash index")
    return _session_response(df, session_id)


@router.post("/{session_id}/trash/restore_column")
async def restore_trash_column(session_id: str, body: RestoreTrashRequest):
    df = store.restore_column(session_id, body.trash_index)
    if df is None:
        raise HTTPException(status_code=400, detail="Invalid trash index")
    return _session_response(df, session_id)


@router.delete("/{session_id}/trash")
async def empty_trash(session_id: str):
    df = store.get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    store.empty_trash(session_id)
    return {"status": "ok"}


def _session_response(df: pd.DataFrame, session_id: str) -> dict:
    trash = store.list_trash(session_id)
    return {
        "rows": len(df),
        "columns": _build_columns(df),
        "preview": _build_preview(df),
        "undo_depth": store.undo_depth(session_id),
        "redo_depth": store.redo_depth(session_id),
        "trash_counts": {"rows": len(trash["rows"]), "columns": len(trash["columns"])},
    }
