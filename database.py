"""Gestión de la base SQLite local persistente de cambiosTAR."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from utils import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS cambios_tar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    anio INTEGER,
    mes INTEGER,
    paciente_id TEXT NOT NULL,
    tar_antiguo TEXT NOT NULL,
    tar_nuevo TEXT NOT NULL,
    transicion_tar TEXT NOT NULL,
    motivo_original TEXT NOT NULL,
    motivo_normalizado TEXT NOT NULL,
    origen TEXT NOT NULL CHECK (origen IN ('historico', 'registro_manual')),
    fecha_creacion TEXT NOT NULL,
    UNIQUE (paciente_id, fecha, tar_antiguo, tar_nuevo, motivo_original)
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        conn.execute(SCHEMA)
        conn.commit()


def insert_record(record: dict[str, Any], db_path: Path = DB_PATH) -> bool:
    init_db(db_path)
    payload = dict(record)
    payload["fecha_creacion"] = datetime.now().isoformat(timespec="seconds")
    columnas = [
        "fecha",
        "anio",
        "mes",
        "paciente_id",
        "tar_antiguo",
        "tar_nuevo",
        "transicion_tar",
        "motivo_original",
        "motivo_normalizado",
        "origen",
        "fecha_creacion",
    ]
    with get_connection(db_path) as conn:
        cursor = conn.execute(
            f"INSERT OR IGNORE INTO cambios_tar ({', '.join(columnas)}) VALUES ({', '.join(['?'] * len(columnas))})",
            [payload[col] for col in columnas],
        )
        conn.commit()
        return cursor.rowcount > 0


def insert_records(records: Iterable[dict[str, Any]], db_path: Path = DB_PATH) -> tuple[int, int]:
    insertados = 0
    duplicados = 0
    for record in records:
        if insert_record(record, db_path):
            insertados += 1
        else:
            duplicados += 1
    return insertados, duplicados


def load_records(db_path: Path = DB_PATH) -> pd.DataFrame:
    init_db(db_path)
    with get_connection(db_path) as conn:
        df = pd.read_sql_query("SELECT * FROM cambios_tar ORDER BY fecha, id", conn)
    if not df.empty:
        df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    return df


def dashboard_metrics(db_path: Path = DB_PATH) -> dict[str, Any]:
    df = load_records(db_path)
    if df.empty:
        return {
            "total_cambios": 0,
            "total_pacientes": 0,
            "cambios_anio_actual": 0,
            "cambios_mes_actual": 0,
            "motivo_frecuente": "—",
            "tar_nuevo_frecuente": "—",
            "transicion_frecuente": "—",
            "ultima_fecha": "—",
        }
    hoy = datetime.now()
    anio_actual = int(hoy.year)
    mes_actual = int(hoy.month)

    def moda(columna: str) -> str:
        serie = df[columna].dropna()
        return "—" if serie.empty else str(serie.value_counts().index[0])

    ultima = pd.to_datetime(df["fecha"], errors="coerce").max()
    return {
        "total_cambios": int(len(df)),
        "total_pacientes": int(df["paciente_id"].nunique()),
        "cambios_anio_actual": int((df["anio"] == anio_actual).sum()),
        "cambios_mes_actual": int(((df["anio"] == anio_actual) & (df["mes"] == mes_actual)).sum()),
        "motivo_frecuente": moda("motivo_normalizado"),
        "tar_nuevo_frecuente": moda("tar_nuevo"),
        "transicion_frecuente": moda("transicion_tar"),
        "ultima_fecha": "—" if pd.isna(ultima) else ultima.date().isoformat(),
    }


def update_record(record_id: int, fields: dict[str, Any], db_path: Path = DB_PATH) -> None:
    permitidas = {"fecha", "anio", "mes", "tar_antiguo", "tar_nuevo", "transicion_tar", "motivo_original", "motivo_normalizado", "origen"}
    updates = {k: v for k, v in fields.items() if k in permitidas}
    if not updates:
        return
    with get_connection(db_path) as conn:
        conn.execute(
            f"UPDATE cambios_tar SET {', '.join(f'{k} = ?' for k in updates)} WHERE id = ?",
            [*updates.values(), record_id],
        )
        conn.commit()


def delete_record(record_id: int, db_path: Path = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM cambios_tar WHERE id = ?", (record_id,))
        conn.commit()
