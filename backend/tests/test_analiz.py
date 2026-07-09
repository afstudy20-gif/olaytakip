import io
import json

import pandas as pd
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _upload_sample():
    df = pd.DataFrame({
        "ADI": ["Ali", "Ayşe", "Ali", "Mehmet"],
        "SOYADI": ["Yılmaz", "Demir", "Yılmaz", "Kaya"],
        "TC": ["12345678901", "98765432102", "12345678901", "11111111111"],
        "DOĞUM TARİHİ": ["01.01.1990", "15.06.1985", "01.01.1990", "20.03.2000"],
        "GELİŞ TARİHİ": ["01.01.2024", "15.01.2024", "20.01.2024", "01.02.2024"],
        "İKAMET İLÇE": ["Kadıköy", "Üsküdar", "Kadıköy", "Beşiktaş"],
        "KONU": ["Şikayet", "Başvuru", "Şikayet", "Danışma"],
    })
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    r = client.post("/api/upload", files={"file": ("data.csv", buf, "text/csv")})
    return r.json()["session_id"]


def test_summary():
    sid = _upload_sample()
    r = client.get(f"/api/analiz/summary?session_id={sid}")
    assert r.status_code == 200
    data = r.json()
    assert data["total_records"] == 4
    assert data["unique_people"] == 3
    assert data["repeated_people"] == 1
    assert any(d["value"] == "Erkek" for d in data["cinsiyet"])


def test_zreport_monthly():
    sid = _upload_sample()
    r = client.get(f"/api/analiz/zreport?session_id={sid}&granularity=monthly")
    assert r.status_code == 200
    data = r.json()
    assert len(data["rows"]) == 2  # January and February


def test_zreport_granularities():
    sid = _upload_sample()
    for granularity in ["daily", "weekly", "monthly", "quarterly", "half_yearly", "yearly"]:
        r = client.get(f"/api/analiz/zreport?session_id={sid}&granularity={granularity}")
        assert r.status_code == 200, granularity
        data = r.json()
        assert len(data["rows"]) >= 1, granularity


def test_charts():
    sid = _upload_sample()
    r = client.get(f"/api/analiz/charts?session_id={sid}")
    assert r.status_code == 200
    data = r.json()
    assert "cinsiyet" in data
    assert "yas_grubu" in data
    assert "aylik_trend" in data
    assert "cinsiyet_yas" in data
    assert "konu" in data
    assert "konu_cinsiyet" in data
    assert "konu_yas" in data
    assert "aylik_konu" in data
    assert "ilce" in data


def test_summary_with_filters():
    sid = _upload_sample()
    filters = json.dumps({"konu": "Şikayet"})
    r = client.get(f"/api/analiz/summary?session_id={sid}&filters={filters}")
    assert r.status_code == 200
    data = r.json()
    assert data["total_records"] == 2


def test_charts_with_filters():
    sid = _upload_sample()
    filters = json.dumps({"konu": "Başvuru"})
    r = client.get(f"/api/analiz/charts?session_id={sid}&filters={filters}")
    assert r.status_code == 200
    data = r.json()
    assert data["konu"]["data"][0]["y"] == ["Başvuru"]
