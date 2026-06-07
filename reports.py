"""Generación de informes seudonimizados de cambiosTAR."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import pandas as pd

from utils import dataframe_to_excel_bytes


@dataclass(frozen=True)
class ReportPeriod:
    label: str
    start: pd.Timestamp | None
    end: pd.Timestamp | None


def filter_period(df: pd.DataFrame, start: object | None, end: object | None) -> pd.DataFrame:
    if df.empty:
        return df.copy()
    trabajo = df.copy()
    trabajo["fecha"] = pd.to_datetime(trabajo["fecha"], errors="coerce")
    if start is not None:
        trabajo = trabajo[trabajo["fecha"] >= pd.to_datetime(start)]
    if end is not None:
        trabajo = trabajo[trabajo["fecha"] <= pd.to_datetime(end)]
    return trabajo


def comentario_automatico(df: pd.DataFrame) -> str:
    if df.empty:
        return "No hay cambios registrados en el periodo seleccionado."
    motivo = df["motivo_normalizado"].value_counts().idxmax()
    transicion = df["transicion_tar"].value_counts().idxmax()
    pacientes = df["paciente_id"].nunique()
    return (
        f"En el periodo analizado se registraron {len(df)} cambios en {pacientes} pacientes seudonimizados. "
        f"El motivo predominante fue {motivo} y la transición más frecuente fue {transicion}."
    )


def build_report_tables(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    resumen = pd.DataFrame(
        [
            {"indicador": "Cambios", "valor": int(len(df))},
            {"indicador": "Pacientes seudonimizados", "valor": int(df["paciente_id"].nunique()) if not df.empty else 0},
        ]
    )
    if df.empty:
        vacio = pd.DataFrame()
        return {"resumen": resumen, "motivos": vacio, "transiciones": vacio, "temporal": vacio, "registros": df}
    motivos = df.groupby("motivo_normalizado", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False)
    transiciones = df.groupby("transicion_tar", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False)
    temporal = df.groupby(["anio", "mes"], as_index=False).size().rename(columns={"size": "cambios"}).sort_values(["anio", "mes"])
    return {"resumen": resumen, "motivos": motivos, "transiciones": transiciones, "temporal": temporal, "registros": df}


def report_to_excel(df: pd.DataFrame) -> bytes:
    tables = build_report_tables(df)
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for sheet, table in tables.items():
            table.to_excel(writer, index=False, sheet_name=sheet[:31])
    return buffer.getvalue()


def report_to_html(df: pd.DataFrame, periodo: str) -> bytes:
    tables = build_report_tables(df)
    parts = [
        "<html><head><meta charset='utf-8'><title>Informe cambiosTAR</title>",
        "<style>body{font-family:Arial,sans-serif;margin:2rem} table{border-collapse:collapse;margin-bottom:1.5rem} td,th{border:1px solid #ddd;padding:.4rem} th{background:#eef}</style>",
        "</head><body>",
        f"<h1>Informe cambiosTAR</h1><p><strong>Periodo:</strong> {periodo}</p>",
        f"<p>{comentario_automatico(df)}</p>",
    ]
    for name, table in tables.items():
        parts.append(f"<h2>{name.title()}</h2>")
        parts.append(table.to_html(index=False))
    parts.append("</body></html>")
    return "\n".join(parts).encode("utf-8")


def safe_export(df: pd.DataFrame) -> bytes:
    return dataframe_to_excel_bytes(df, "exportacion")
