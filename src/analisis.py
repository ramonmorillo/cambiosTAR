"""Cálculos agregados para el dashboard de cambiosTAR."""

from __future__ import annotations

import pandas as pd


def resumen_general(df: pd.DataFrame) -> dict[str, object]:
    cambios = int(len(df))
    pacientes = int(df["ID seudonimizado"].nunique())
    cambios_por_paciente = round(cambios / pacientes, 2) if pacientes else 0

    por_anio = cambios_por_año(df)
    por_motivo = distribucion_motivo(df)
    por_tar_nuevo = ranking_tar_nuevo(df, limite=1)
    por_transicion = ranking_transiciones(df, limite=1)

    return {
        "cambios": cambios,
        "pacientes": pacientes,
        "cambios_por_paciente": cambios_por_paciente,
        "año_mas_cambios": "—" if por_anio.empty else int(por_anio.sort_values("cambios", ascending=False).iloc[0]["año"]),
        "motivo_frecuente": "—" if por_motivo.empty else str(por_motivo.iloc[0]["motivo_normalizado"]),
        "tar_nuevo_frecuente": "—" if por_tar_nuevo.empty else str(por_tar_nuevo.iloc[0]["TAR nuevo"]),
        "transicion_frecuente": "—" if por_transicion.empty else str(por_transicion.iloc[0]["transición TAR"]),
    }


def cambios_por_año(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(subset=["año"]).groupby("año", as_index=False).size().rename(columns={"size": "cambios"})


def cambios_por_mes(df: pd.DataFrame) -> pd.DataFrame:
    return df.dropna(subset=["mes"]).groupby("mes", as_index=False).size().rename(columns={"size": "cambios"})


def evolucion_mensual_acumulada(df: pd.DataFrame) -> pd.DataFrame:
    mensual = cambios_por_mes(df).sort_values("mes")
    if mensual.empty:
        return mensual.assign(acumulado=[])
    mensual["acumulado"] = mensual["cambios"].cumsum()
    return mensual


def distribucion_motivo(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby("motivo_normalizado", as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
        .sort_values("cambios", ascending=False)
    )


def motivos_por_año(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.dropna(subset=["año"])
        .groupby(["año", "motivo_normalizado"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
    )


def auditoria_motivos(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby(["motivo_original", "motivo_normalizado"], dropna=False, as_index=False)
        .size()
        .rename(columns={"size": "registros"})
        .sort_values(["motivo_normalizado", "registros"], ascending=[True, False])
    )


def ranking_tar_antiguo(df: pd.DataFrame, limite: int = 10) -> pd.DataFrame:
    return (
        df.groupby("TAR antiguo", as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
        .sort_values("cambios", ascending=False)
        .head(limite)
    )


def ranking_tar_nuevo(df: pd.DataFrame, limite: int = 10) -> pd.DataFrame:
    return (
        df.groupby("TAR nuevo", as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
        .sort_values("cambios", ascending=False)
        .head(limite)
    )


def ranking_transiciones(df: pd.DataFrame, limite: int = 20) -> pd.DataFrame:
    return (
        df.groupby(["TAR antiguo", "TAR nuevo", "transición TAR"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
        .sort_values("cambios", ascending=False)
        .head(limite)
    )


def transiciones_por_año(df: pd.DataFrame, limite: int = 15) -> pd.DataFrame:
    principales = ranking_transiciones(df, limite=limite)["transición TAR"]
    return (
        df[df["transición TAR"].isin(principales)]
        .dropna(subset=["año"])
        .groupby(["año", "transición TAR"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
    )


def transiciones_por_motivo(df: pd.DataFrame, limite: int = 15) -> pd.DataFrame:
    principales = ranking_transiciones(df, limite=limite)["transición TAR"]
    return (
        df[df["transición TAR"].isin(principales)]
        .groupby(["motivo_normalizado", "transición TAR"], as_index=False)
        .size()
        .rename(columns={"size": "cambios"})
    )


def trayectoria_paciente(df: pd.DataFrame, id_paciente: str) -> pd.DataFrame:
    columnas = ["fecha", "TAR antiguo", "TAR nuevo", "motivo_normalizado", "motivo_original", "transición TAR"]
    return df[df["ID seudonimizado"] == id_paciente].sort_values("fecha")[columnas]
