"""In-memory dataframe store keyed by session id with automatic cleanup.

Adapted from uSTAT; trimmed to the subset needed for Olay Takip.
"""
import json
import os
import tempfile
import threading
import time
from typing import Dict, Optional

import pandas as pd
from fastapi import HTTPException

MAX_SESSION_CELLS = int(os.environ.get("MAX_SESSION_CELLS", str(20_000_000)))
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", str(1800)))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", "20"))
AUTOSAVE_INTERVAL_SECONDS = int(os.environ.get("AUTOSAVE_INTERVAL_SECONDS", "20"))
SESSION_CACHE_DIR = os.environ.get(
    "SESSION_CACHE_DIR",
    "/app/backend/session_cache" if os.path.isdir("/app/backend") else
    os.path.join(tempfile.gettempdir(), "olaylar_session_cache"),
)
MAX_UNDO = 30

_store: Dict[str, dict] = {}
_metadata: Dict[str, dict] = {}
_filenames: Dict[str, str] = {}
_undo: Dict[str, list] = {}
_redo: Dict[str, list] = {}
_audit: Dict[str, list] = {}
_trash_rows: Dict[str, list] = {}
_trash_columns: Dict[str, list] = {}
_lock = threading.Lock()
_dirty: set = set()
_last_cleanup = time.time()


def _cache_paths(session_id: str) -> tuple:
    base = os.path.join(SESSION_CACHE_DIR, session_id)
    return base + ".pkl", base + ".meta.json"


def _delete_disk_snapshot(session_id: str) -> None:
    for p in _cache_paths(session_id):
        try:
            os.remove(p)
        except OSError:
            pass


def _purge_locked(session_id: str) -> None:
    _store.pop(session_id, None)
    _metadata.pop(session_id, None)
    _filenames.pop(session_id, None)
    _undo.pop(session_id, None)
    _redo.pop(session_id, None)
    _audit.pop(session_id, None)
    _trash_rows.pop(session_id, None)
    _trash_columns.pop(session_id, None)
    _dirty.discard(session_id)
    _delete_disk_snapshot(session_id)


def _mark_dirty(session_id: str) -> None:
    with _lock:
        _dirty.add(session_id)


def _atomic_write_pickle(df: pd.DataFrame, path: str) -> None:
    tmp = path + ".tmp"
    df.to_pickle(tmp)
    os.replace(tmp, path)


def _flush_dirty_to_disk() -> None:
    with _lock:
        pending = list(_dirty)
        _dirty.clear()
        snapshot = {}
        for sid in pending:
            entry = _store.get(sid)
            if entry is not None:
                snapshot[sid] = (entry["df"], entry["timestamp"])
    if not snapshot:
        return
    try:
        os.makedirs(SESSION_CACHE_DIR, exist_ok=True)
    except OSError:
        return
    for sid, (df, ts) in snapshot.items():
        df_path, meta_path = _cache_paths(sid)
        try:
            _atomic_write_pickle(df, df_path)
            meta = {
                "timestamp": ts,
                "filename": _filenames.get(sid),
                "metadata": _metadata.get(sid, {}),
            }
            with open(meta_path + ".tmp", "w") as f:
                json.dump(meta, f, default=str)
            os.replace(meta_path + ".tmp", meta_path)
        except OSError:
            continue


def _autosave_worker() -> None:
    while True:
        time.sleep(AUTOSAVE_INTERVAL_SECONDS)
        try:
            _flush_dirty_to_disk()
        except Exception:
            pass


_autosave_thread = threading.Thread(target=_autosave_worker, daemon=True)
_autosave_thread.start()


def load_persisted_sessions() -> None:
    if not os.path.isdir(SESSION_CACHE_DIR):
        return
    now = time.time()
    try:
        names = [f[:-4] for f in os.listdir(SESSION_CACHE_DIR) if f.endswith(".pkl")]
    except OSError:
        return
    for sid in names:
        df_path, meta_path = _cache_paths(sid)
        try:
            mtime = os.path.getmtime(df_path)
        except OSError:
            continue
        if now - mtime > SESSION_TTL_SECONDS:
            _delete_disk_snapshot(sid)
            continue
        try:
            df = pd.read_pickle(df_path)
            meta = {}
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    meta = json.load(f)
        except Exception:
            _delete_disk_snapshot(sid)
            continue
        with _lock:
            _store[sid] = {"df": df, "timestamp": meta.get("timestamp", mtime)}
            if meta.get("filename"):
                _filenames[sid] = meta["filename"]
            if meta.get("metadata"):
                _metadata[sid] = meta["metadata"]


def _cleanup_old_sessions() -> None:
    global _last_cleanup
    now = time.time()
    if now - _last_cleanup < 60:
        return
    _last_cleanup = now
    with _lock:
        expired = [sid for sid, entry in _store.items() if now - entry["timestamp"] > SESSION_TTL_SECONDS]
        for sid in expired:
            _purge_locked(sid)
        if len(_store) > MAX_SESSIONS:
            sorted_sids = sorted(_store.items(), key=lambda x: x[1]["timestamp"])
            for sid, _ in sorted_sids[:len(_store) - MAX_SESSIONS]:
                _purge_locked(sid)


def save(session_id: str, df: pd.DataFrame, track_undo: bool = True) -> None:
    _cleanup_old_sessions()
    n_cells = int(df.shape[0]) * int(df.shape[1])
    if n_cells > MAX_SESSION_CELLS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Dataset too large: {df.shape[0]:,} rows × {df.shape[1]:,} cols "
                f"= {n_cells:,} cells (limit {MAX_SESSION_CELLS:,})."
            ),
        )
    with _lock:
        if track_undo and session_id in _store:
            old_df = _store[session_id]["df"]
            _undo.setdefault(session_id, []).append(old_df.copy())
            if len(_undo[session_id]) > MAX_UNDO:
                _undo[session_id] = _undo[session_id][-MAX_UNDO:]
            _redo.pop(session_id, None)
        _store[session_id] = {"df": df, "timestamp": time.time()}
        _dirty.add(session_id)
    log_action(session_id, "data_updated")


def get(session_id: str) -> Optional[pd.DataFrame]:
    with _lock:
        entry = _store.get(session_id)
        if entry is None:
            return None
        entry["timestamp"] = time.time()
        return entry["df"]


def delete(session_id: str) -> None:
    with _lock:
        _purge_locked(session_id)


def list_sessions() -> list:
    _cleanup_old_sessions()
    with _lock:
        return list(_store.keys())


def undo(session_id: str) -> Optional[pd.DataFrame]:
    with _lock:
        stack = _undo.get(session_id, [])
        if not stack:
            return None
        prev_df = stack.pop()
        if session_id in _store:
            _redo.setdefault(session_id, []).append(_store[session_id]["df"].copy())
            if len(_redo[session_id]) > MAX_UNDO:
                _redo[session_id] = _redo[session_id][-MAX_UNDO:]
        _store[session_id] = {"df": prev_df, "timestamp": time.time()}
        _dirty.add(session_id)
    log_action(session_id, "undo")
    return prev_df


def redo(session_id: str) -> Optional[pd.DataFrame]:
    with _lock:
        stack = _redo.get(session_id, [])
        if not stack:
            return None
        next_df = stack.pop()
        if session_id in _store:
            _undo.setdefault(session_id, []).append(_store[session_id]["df"].copy())
            if len(_undo[session_id]) > MAX_UNDO:
                _undo[session_id] = _undo[session_id][-MAX_UNDO:]
        _store[session_id] = {"df": next_df, "timestamp": time.time()}
        _dirty.add(session_id)
    log_action(session_id, "redo")
    return next_df


def undo_depth(session_id: str) -> int:
    return len(_undo.get(session_id, []))


def redo_depth(session_id: str) -> int:
    return len(_redo.get(session_id, []))


def trash_row(session_id: str, row_index: int, row_data: dict) -> int:
    with _lock:
        items = _trash_rows.setdefault(session_id, [])
        items.append({
            "row_index": row_index,
            "data": row_data,
            "deleted_at": time.time(),
        })
        return len(items) - 1


def trash_column(session_id: str, column_name: str, series: pd.Series) -> int:
    with _lock:
        items = _trash_columns.setdefault(session_id, [])
        items.append({
            "name": column_name,
            "data": json.loads(series.to_json(orient="records", date_format="iso", date_unit="s")),
            "deleted_at": time.time(),
        })
        return len(items) - 1


def list_trash(session_id: str) -> dict:
    with _lock:
        return {
            "rows": _trash_rows.get(session_id, []),
            "columns": _trash_columns.get(session_id, []),
        }


def restore_row(session_id: str, trash_index: int) -> Optional[pd.DataFrame]:
    with _lock:
        rows = _trash_rows.get(session_id, [])
        if trash_index < 0 or trash_index >= len(rows):
            return None
        entry = rows.pop(trash_index)
        entry_df = _store.get(session_id)
        if entry_df is None:
            return None
        df = entry_df["df"].copy()
        df = pd.concat([df, pd.DataFrame([entry["data"]])], ignore_index=True)
    save(session_id, df)
    return df


def restore_column(session_id: str, trash_index: int) -> Optional[pd.DataFrame]:
    with _lock:
        cols = _trash_columns.get(session_id, [])
        if trash_index < 0 or trash_index >= len(cols):
            return None
        entry = cols.pop(trash_index)
        entry_df = _store.get(session_id)
        if entry_df is None:
            return None
        df = entry_df["df"].copy()
        df[entry["name"]] = entry["data"]
    save(session_id, df)
    return df


def empty_trash(session_id: str) -> None:
    with _lock:
        _trash_rows.pop(session_id, None)
        _trash_columns.pop(session_id, None)


def log_action(session_id: str, action: str, params: Optional[dict] = None) -> None:
    entry = {"action": action, "params": params, "timestamp": time.time()}
    _audit.setdefault(session_id, []).append(entry)


def get_audit(session_id: str) -> list:
    return _audit.get(session_id, [])


def set_filename(session_id: str, name: str) -> None:
    if name:
        _filenames[session_id] = str(name)
        _mark_dirty(session_id)


def get_filename(session_id: str) -> Optional[str]:
    return _filenames.get(session_id)


def save_metadata(session_id: str, meta: dict) -> None:
    cur = dict(_metadata.get(session_id, {}))
    for col, m in (meta or {}).items():
        if isinstance(m, dict):
            prev = dict(cur.get(col, {}) or {})
            prev.update(m)
            cur[col] = prev
        else:
            cur[col] = m
    _metadata[session_id] = cur
    _mark_dirty(session_id)


def get_metadata(session_id: str) -> dict:
    return _metadata.get(session_id, {})


def get_df(session_id: str) -> pd.DataFrame:
    df = get(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return df
