import io

import pandas as pd
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_upload_csv():
    df = pd.DataFrame({
        "ADI": ["Ali", "Ayşe"],
        "SOYADI": ["Yılmaz", "Demir"],
        "TC": ["12345678901", "98765432102"],
        "DOĞUM TARİHİ": ["01.01.1990", "15.06.1985"],
        "GELİŞ TARİHİ": ["01.01.2024", "02.01.2024"],
        "İKAMET İLÇE": ["Kadıköy", "Üsküdar"],
        "KONU": ["Şikayet", "Başvuru"],
    })
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    response = client.post("/api/upload", files={"file": ("data.csv", buf, "text/csv")})
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["rows"] == 2
    names = {c["name"] for c in data["columns"]}
    assert "adi" in names
    assert "soyadi" in names
    assert "tc" in names
    assert "gelis_tarihi" in names


def test_upload_xlsx():
    df = pd.DataFrame({
        "adi": ["Ali"],
        "soyadi": ["Yılmaz"],
        "tc": ["12345678901"],
        "gelis_tarihi": ["2024-01-01"],
        "konu": ["Test"],
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)
    response = client.post("/api/upload", files={"file": ("data.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert response.status_code == 200
    data = response.json()
    assert data["rows"] == 1


def test_blank_session():
    response = client.post("/api/upload/blank")
    assert response.status_code == 200
    data = response.json()
    assert data["rows"] == 5
    assert "tc" in {c["name"] for c in data["columns"]}
