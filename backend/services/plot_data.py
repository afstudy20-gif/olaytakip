"""Generate Plotly-compatible chart data for Olay Takip."""
from typing import Literal, Optional

import pandas as pd

from services.olay_analiz import add_derived_columns, distribution


def _hex_palette() -> list:
    return ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316"]


def pie_chart_data(series: pd.Series, title: str, top_n: Optional[int] = 12) -> dict:
    dist = distribution(series, top_n=top_n)
    labels = [d["value"] for d in dist]
    values = [d["count"] for d in dist]
    return {
        "type": "pie",
        "title": title,
        "data": [{"labels": labels, "values": values, "type": "pie", "hole": 0.35}],
        "layout": {"showlegend": True},
    }


def bar_chart_data(series: pd.Series, title: str, orientation: Literal["v", "h"] = "v") -> dict:
    dist = distribution(series)
    labels = [d["value"] for d in dist]
    values = [d["count"] for d in dist]
    trace = {"x": labels, "y": values, "type": "bar", "marker": {"color": _hex_palette()[:len(labels)]}}
    if orientation == "h":
        trace = {"y": labels, "x": values, "type": "bar", "orientation": "h", "marker": {"color": _hex_palette()[:len(labels)]}}
    return {
        "type": "bar",
        "title": title,
        "data": [trace],
        "layout": {"xaxis": {"title": "Sayı" if orientation == "h" else ""}, "yaxis": {"title": "" if orientation == "h" else "Sayı"}},
    }


def trend_chart_data(df: pd.DataFrame, granularity: str = "monthly") -> dict:
    if "gelis_tarihi" not in df.columns:
        return {"type": "line", "title": "Geliş trendi", "data": [], "layout": {}}
    g = pd.to_datetime(df["gelis_tarihi"], errors="coerce")
    period = g.dt.to_period("D" if granularity == "daily" else "M")
    counts = period.value_counts().sort_index()
    labels = [str(p) for p in counts.index]
    values = [int(c) for c in counts.values]
    return {
        "type": "line",
        "title": "Günlük Geliş Trendi" if granularity == "daily" else "Aylık Geliş Trendi",
        "data": [{"x": labels, "y": values, "type": "scatter", "mode": "lines+markers", "line": {"color": "#6366f1"}}],
        "layout": {"xaxis": {"title": "Tarih"}, "yaxis": {"title": "Kayıt Sayısı"}},
    }


def grouped_bar_chart_data(
    df: pd.DataFrame,
    x_col: str,
    group_col: str,
    title: str,
    xaxis_title: str = "",
    top_n: int = 10,
    orientation: str = "v",
) -> dict:
    if x_col not in df.columns or group_col not in df.columns:
        return {"type": "bar", "title": title, "data": [], "layout": {}}
    subset = df[[x_col, group_col]].dropna().copy()
    subset[x_col] = subset[x_col].astype(str).str.strip()
    subset[group_col] = subset[group_col].astype(str).str.strip()
    top_x = subset[x_col].value_counts().head(top_n).index.tolist()
    subset = subset[subset[x_col].isin(top_x)]
    groups = sorted(subset[group_col].unique())
    palette = _hex_palette()
    traces = []
    for i, g in enumerate(groups):
        counts = subset[subset[group_col] == g][x_col].value_counts().reindex(top_x, fill_value=0)
        color = palette[i % len(palette)]
        if orientation == "h":
            traces.append(
                {"y": top_x, "x": counts.tolist(), "name": g, "type": "bar", "orientation": "h", "marker": {"color": color}}
            )
        else:
            traces.append({"x": top_x, "y": counts.tolist(), "name": g, "type": "bar", "marker": {"color": color}})
    layout = {"barmode": "group"}
    if orientation == "h":
        layout["xaxis"] = {"title": "Sayı"}
        layout["yaxis"] = {"title": xaxis_title}
    else:
        layout["xaxis"] = {"title": xaxis_title}
        layout["yaxis"] = {"title": "Sayı"}
    return {"type": "bar", "title": title, "data": traces, "layout": layout}


def monthly_topic_chart_data(df: pd.DataFrame, top_n: int = 5) -> dict:
    if "gelis_tarihi" not in df.columns or "konu" not in df.columns:
        return {"type": "line", "title": "Aylık Konu Trendi", "data": [], "layout": {}}
    subset = df[["gelis_tarihi", "konu"]].copy()
    subset["tarih"] = pd.to_datetime(subset["gelis_tarihi"], errors="coerce").dt.to_period("M")
    subset["konu"] = subset["konu"].astype(str).str.strip()
    subset = subset.dropna(subset=["tarih", "konu"])
    top_konu = subset["konu"].value_counts().head(top_n).index.tolist()
    subset = subset[subset["konu"].isin(top_konu)]
    periods = sorted(subset["tarih"].unique())
    palette = _hex_palette()
    traces = []
    for i, konu in enumerate(top_konu):
        counts = subset[subset["konu"] == konu].groupby("tarih").size().reindex(periods, fill_value=0)
        traces.append(
            {
                "x": [str(p) for p in periods],
                "y": counts.tolist(),
                "name": konu,
                "type": "scatter",
                "mode": "lines+markers",
                "line": {"color": palette[i % len(palette)]},
            }
        )
    return {
        "type": "line",
        "title": "Aylık Konu Trendi",
        "data": traces,
        "layout": {"xaxis": {"title": "Ay"}, "yaxis": {"title": "Kayıt Sayısı"}},
    }


def compute_all_charts(df: pd.DataFrame) -> dict:
    enriched = add_derived_columns(df)
    charts = {
        "cinsiyet": pie_chart_data(enriched["_cinsiyet"], "Cinsiyet Dağılımı"),
        "yas_grubu": bar_chart_data(enriched["_yas_grubu"], "Yaş Grubu Dağılımı"),
        "aylik_trend": trend_chart_data(df, "monthly"),
        "cinsiyet_yas": grouped_bar_chart_data(
            enriched, "_yas_grubu", "_cinsiyet", "Yaş Grubuna Göre Cinsiyet", xaxis_title="Yaş Grubu"
        ),
    }
    if "konu" in df.columns:
        charts["konu"] = bar_chart_data(df["konu"].astype(str).str.strip(), "Konu Dağılımı", orientation="h")
        charts["konu_cinsiyet"] = grouped_bar_chart_data(
            enriched, "konu", "_cinsiyet", "Konuya Göre Cinsiyet", xaxis_title="Konu", top_n=8, orientation="h"
        )
        charts["konu_yas"] = grouped_bar_chart_data(
            enriched, "konu", "_yas_grubu", "Konuya Göre Yaş Grubu", xaxis_title="Konu", top_n=8, orientation="h"
        )
        if "gelis_tarihi" in df.columns:
            charts["aylik_konu"] = monthly_topic_chart_data(df, top_n=5)
    if "ikamet_il" in df.columns:
        charts["il"] = bar_chart_data(df["ikamet_il"].astype(str).str.strip(), "İl Dağılımı", orientation="h")
        charts["il_yas"] = grouped_bar_chart_data(
            enriched, "ikamet_il", "_yas_grubu", "İle Göre Yaş Grubu", xaxis_title="İl", top_n=10, orientation="h"
        )
    if "ikamet_ilce" in df.columns:
        charts["ilce"] = bar_chart_data(df["ikamet_ilce"].astype(str).str.strip(), "İlçe Dağılımı", orientation="h")
    return charts
