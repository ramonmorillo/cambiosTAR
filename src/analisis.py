"""Cálculos agregados para el dashboard de cambiosTAR."""

from __future__ import annotations

import pandas as pd


def resumen_general(df: pd.DataFrame) -> dict[str, int]:
    return {
        "cambios": int(len(df)),
        "pacientes": int(df["id_paciente"].nunique()),
        "tar_antiguos": int(df["tar_antiguo"].nunique()),
        "tar_nuevos": int(df["tar_nuevo"].nunique()),
    }


def cambios_por_anio(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(subset=["anio"]).groupby("anio", as_index=False).size().rename(columns={"size": "cambios"})


def cambios_por_mes(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(subset=["mes"]).groupby("mes", as_index=False).size().rename(columns={"size": "cambios"})


def distribucion_motivo(df: pd.DataFrame) -> pd.DataFrame:
    return df.groupby("motivo_bloque", as_index=False).size().rename(columns={"size": "cambios"})


def motivos_por_anio(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.dropna(subset=["anio"])
        .groupby(["anio", "motivo_bloque"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
    )


def ranking_transiciones(df: pd.DataFrame, limite: int = 20) -> pd.DataFrame:
    return (
        df.groupby(["tar_antiguo", "tar_nuevo", "transicion"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
        .sort_values("cambios", ascending=False)
        .head(limite)
    )


def trayectoria_paciente(df: pd.DataFrame, id_paciente: str) -> pd.DataFrame:
    return df[df["id_paciente"] == id_paciente].sort_values("marca_temporal")
