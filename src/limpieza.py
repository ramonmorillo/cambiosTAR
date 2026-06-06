"""Funciones de limpieza y normalización para el Excel histórico de cambios TAR."""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable

import pandas as pd

from .pseudonimizacion import seudonimizar_historia

COLUMNAS_REQUERIDAS = [
    "Marca temporal",
    "Número de historia clínico",
    "TAR antiguo",
    "TAR nuevo",
    "Motivo",
]

BLOQUES_MOTIVO = [
    "Optimización",
    "Efecto adverso",
    "Interacción",
    "Fracaso virológico",
    "Otro",
]

COLUMNAS_EXPORTACION = [
    "fecha",
    "año",
    "mes",
    "ID seudonimizado",
    "TAR antiguo",
    "TAR nuevo",
    "transición TAR",
    "motivo_normalizado",
    "motivo_original",
]

COLUMNAS_SEGURAS = [
    "fecha",
    "año",
    "mes",
    "ID seudonimizado",
    "TAR antiguo",
    "TAR nuevo",
    "transición TAR",
    "motivo_normalizado",
    "motivo_original",
]


def _normalizar_nombre_columna(nombre: object) -> str:
    return str(nombre).strip()


def _texto_basico(texto: object) -> str:
    texto = "" if pd.isna(texto) else str(texto).strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return re.sub(r"\s+", " ", texto)


def _texto_limpio(valor: object) -> str:
    if pd.isna(valor):
        return ""
    return re.sub(r"\s+", " ", str(valor)).strip()


def ignorar_columnas_duplicadas(df: pd.DataFrame) -> pd.DataFrame:
    """Elimina columnas duplicadas generadas por Excel como 'Número de historia clínico.1'."""
    df = df.copy()
    df.columns = [_normalizar_nombre_columna(columna) for columna in df.columns]
    columnas_a_eliminar: list[str] = []
    for columna in df.columns:
        base = re.sub(r"\.\d+$", "", columna)
        if columna != base and base in COLUMNAS_REQUERIDAS:
            columnas_a_eliminar.append(columna)
    return df.drop(columns=columnas_a_eliminar, errors="ignore")


def validar_columnas(df: pd.DataFrame, columnas_requeridas: Iterable[str] = COLUMNAS_REQUERIDAS) -> None:
    faltantes = [columna for columna in columnas_requeridas if columna not in df.columns]
    if faltantes:
        raise ValueError("Faltan columnas obligatorias: " + ", ".join(faltantes))


def clasificar_motivo(motivo: object) -> str:
    """Clasifica texto libre de forma conservadora en uno de los 5 bloques permitidos."""
    texto = _texto_basico(motivo)
    if not texto:
        return "Otro"

    if any(palabra in texto for palabra in ["fracaso", "rebote", "viremia", "resistencia", "carga viral detectable", "virolog"]):
        return "Fracaso virológico"
    if any(palabra in texto for palabra in ["interaccion", "ddi", "interacciones", "comedicacion", "medicacion concomitante"]):
        return "Interacción"
    if any(
        palabra in texto
        for palabra in [
            "efecto adverso",
            "advers",
            "toxic",
            "intoler",
            "renal",
            "osea",
            "digestivo",
            "neuropsiquiatr",
            "diarrea",
            "rash",
            "nause",
        ]
    ):
        return "Efecto adverso"
    if any(
        palabra in texto
        for palabra in [
            "optimiz",
            "simplific",
            "biterapia",
            "mejora",
            "switch",
            "toxicidad preventiva",
            "comodidad",
            "preferencia",
            "actualizacion",
        ]
    ):
        return "Optimización"

    equivalencias_directas = {
        _texto_basico("Optimización"): "Optimización",
        _texto_basico("Efecto adverso"): "Efecto adverso",
        _texto_basico("Interacción"): "Interacción",
        _texto_basico("Fracaso virológico"): "Fracaso virológico",
        _texto_basico("Otro"): "Otro",
    }
    return equivalencias_directas.get(texto, "Otro")


def limpiar_excel(df: pd.DataFrame, clave_secreta: str) -> pd.DataFrame:
    """Prepara un DataFrame seudonimizado sin exponer el número de historia clínica."""
    if df.empty:
        raise ValueError("El Excel está vacío. Cargue un archivo con registros de cambios TAR.")

    df = ignorar_columnas_duplicadas(df)
    validar_columnas(df)

    trabajo = df[COLUMNAS_REQUERIDAS].copy()
    avisos: list[str] = []

    duplicados = int(trabajo.duplicated().sum())
    if duplicados:
        trabajo = trabajo.drop_duplicates().copy()
        avisos.append(f"Se eliminaron {duplicados} registros duplicados exactos.")

    historia_vacia = trabajo["Número de historia clínico"].isna() | (trabajo["Número de historia clínico"].astype(str).str.strip() == "")
    if historia_vacia.any():
        avisos.append(f"Se excluyeron {int(historia_vacia.sum())} registros sin número de historia clínica.")
        trabajo = trabajo.loc[~historia_vacia].copy()

    if trabajo.empty:
        raise ValueError("No quedan registros válidos tras excluir filas sin número de historia clínica.")

    trabajo["fecha"] = pd.to_datetime(trabajo["Marca temporal"], errors="coerce", dayfirst=True)
    fechas_invalidas = int(trabajo["fecha"].isna().sum())
    if fechas_invalidas:
        avisos.append(f"Hay {fechas_invalidas} registros con fecha no interpretable; no aparecerán en análisis temporales.")

    trabajo["TAR antiguo"] = trabajo["TAR antiguo"].apply(_texto_limpio).replace("", "No informado")
    trabajo["TAR nuevo"] = trabajo["TAR nuevo"].apply(_texto_limpio).replace("", "No informado")
    tar_antiguo_vacio = int((trabajo["TAR antiguo"] == "No informado").sum())
    tar_nuevo_vacio = int((trabajo["TAR nuevo"] == "No informado").sum())
    if tar_antiguo_vacio:
        avisos.append(f"Hay {tar_antiguo_vacio} registros con TAR antiguo vacío marcados como 'No informado'.")
    if tar_nuevo_vacio:
        avisos.append(f"Hay {tar_nuevo_vacio} registros con TAR nuevo vacío marcados como 'No informado'.")

    trabajo["motivo_original"] = trabajo["Motivo"].apply(_texto_limpio)
    motivos_vacios = int((trabajo["motivo_original"] == "").sum())
    if motivos_vacios:
        avisos.append(f"Hay {motivos_vacios} registros con motivo vacío clasificados como 'Otro'.")

    trabajo["ID seudonimizado"] = trabajo["Número de historia clínico"].apply(lambda valor: seudonimizar_historia(valor, clave_secreta))
    trabajo["motivo_normalizado"] = trabajo["Motivo"].apply(clasificar_motivo)
    trabajo["año"] = trabajo["fecha"].dt.year.astype("Int64")
    trabajo["mes"] = trabajo["fecha"].dt.to_period("M").astype(str).replace("NaT", pd.NA)
    trabajo["transición TAR"] = trabajo["TAR antiguo"] + " → " + trabajo["TAR nuevo"]

    seguro = trabajo[COLUMNAS_SEGURAS].sort_values(["fecha", "ID seudonimizado"], na_position="last").reset_index(drop=True)
    seguro.attrs["avisos"] = avisos
    seguro.attrs["registros_originales"] = int(len(df))
    seguro.attrs["duplicados_eliminados"] = duplicados
    return seguro


def preparar_exportacion(df: pd.DataFrame) -> pd.DataFrame:
    """Devuelve solo las columnas seudonimizadas autorizadas para descarga."""
    exportable = df[COLUMNAS_EXPORTACION].copy()
    exportable["fecha"] = pd.to_datetime(exportable["fecha"], errors="coerce").dt.strftime("%Y-%m-%d")
    return exportable
