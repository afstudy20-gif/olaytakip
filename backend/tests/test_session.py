import io

import pandas as pd
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _upload_sample():
    df = pd.DataFrame({
        "ADI": ["Ali", "Ayşe"],
        "SOYADI": ["Yılmaz", "Demir"],
        "TC": ["12345678901", "98765432102"],
        "GELİŞ TARİHİ": ["01.01.2024", "02.01.2024"],
        "KONU": ["Şikayet", "Başvuru"],
    })
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    r = client.post("/api/upload", files={"file": ("data.csv", buf, "text/csv")})
    return r.json()["session_id"]


def test_get_session():
    sid = _upload_sample()
    r = client.get(f"/api/sessions/{sid}")
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 2


def test_update_cell():
    sid = _upload_sample()
    r = client.patch(f"/api/sessions/{sid}/cell", json={"row_index": 0, "column": "adi", "value": "Mehmet"})
    assert r.status_code == 200
    data = r.json()
    assert data["value"] == "Mehmet"


def test_delete_row():
    sid = _upload_sample()
    r = client.delete(f"/api/sessions/{sid}/row/0")
    assert r.status_code == 200
    assert r.json()["rows"] == 1


def test_add_row():
    sid = _upload_sample()
    r = client.post(f"/api/sessions/{sid}/row", json={"data": {"adi": "Fatma"}})
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 3
    assert data["preview"][-1]["adi"] == "Fatma"


def test_add_row_empty():
    sid = _upload_sample()
    r = client.post(f"/api/sessions/{sid}/row", json={})
    assert r.status_code == 200
    assert r.json()["rows"] == 3


def test_add_column():
    sid = _upload_sample()
    r = client.post(f"/api/sessions/{sid}/column", json={"name": "notlar", "default_value": "yeni"})
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 2
    assert any(c["name"] == "notlar" for c in data["columns"])
    assert data["preview"][0]["notlar"] == "yeni"


def test_add_column_duplicate():
    sid = _upload_sample()
    r = client.post(f"/api/sessions/{sid}/column", json={"name": "adi"})
    assert r.status_code == 400


def test_export_xlsx():
    sid = _upload_sample()
    r = client.get(f"/api/sessions/{sid}/export?fmt=xlsx")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def test_duplicate_row():
    sid = _upload_sample()
    r = client.post(f"/api/sessions/{sid}/row/0/duplicate")
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 3
    assert data["preview"][0]["adi"] == data["preview"][2]["adi"]


def test_delete_row_goes_to_trash():
    sid = _upload_sample()
    r = client.delete(f"/api/sessions/{sid}/row/0")
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 1
    assert data["trash_counts"]["rows"] == 1

    trash = client.get(f"/api/sessions/{sid}/trash").json()
    assert len(trash["rows"]) == 1

    restored = client.post(f"/api/sessions/{sid}/trash/restore_row", json={"trash_index": 0}).json()
    assert restored["rows"] == 2
    assert restored["trash_counts"]["rows"] == 0


def test_delete_column_goes_to_trash():
    sid = _upload_sample()
    r = client.delete(f"/api/sessions/{sid}/column/adi")
    assert r.status_code == 200
    data = r.json()
    assert not any(c["name"] == "adi" for c in data["columns"])
    assert data["trash_counts"]["columns"] == 1

    restored = client.post(f"/api/sessions/{sid}/trash/restore_column", json={"trash_index": 0}).json()
    assert any(c["name"] == "adi" for c in restored["columns"])
    assert restored["trash_counts"]["columns"] == 0


def test_undo_redo():
    sid = _upload_sample()
    r = client.delete(f"/api/sessions/{sid}/row/0")
    assert r.json()["rows"] == 1

    r = client.post(f"/api/sessions/{sid}/undo")
    assert r.status_code == 200
    assert r.json()["rows"] == 2
    assert r.json()["undo_depth"] == 0

    r = client.post(f"/api/sessions/{sid}/redo")
    assert r.status_code == 200
    assert r.json()["rows"] == 1
    assert r.json()["redo_depth"] == 0
