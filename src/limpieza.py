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


def _normalizar_nombre_columna(nombre: object) -> str:
    return str(nombre).strip()


def _texto_basico(texto: object) -> str:
    texto = "" if pd.isna(texto) else str(texto).strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return re.sub(r"\s+", " ", texto)


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
        raise ValueError("Faltan columnas requeridas: " + ", ".join(faltantes))


def clasificar_motivo(motivo: object) -> str:
    """Clasifica texto libre de forma conservadora en uno de los 5 bloques permitidos."""
    texto = _texto_basico(motivo)
    if not texto:
        return "Otro"

    if any(palabra in texto for palabra in ["fracaso", "virolog", "rebote", "viremia", "carga viral", "resistencia"]):
        return "Fracaso virológico"
    if any(palabra in texto for palabra in ["interaccion", "rifamp", "antiepilep", "contraindic", "incompat"]):
        return "Interacción"
    if any(palabra in texto for palabra in ["advers", "toxic", "intoler", "renal", "hepat", "diarrea", "rash", "nause", "efecto"]):
        return "Efecto adverso"
    if any(palabra in texto for palabra in ["optim", "simpl", "biterapia", "comod", "adher", "actualizacion", "preferencia", "reduccion", "mejora"]):
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
    df = ignorar_columnas_duplicadas(df)
    validar_columnas(df)

    limpio = df[COLUMNAS_REQUERIDAS].copy()
    limpio["id_paciente"] = limpio["Número de historia clínico"].apply(
        lambda valor: seudonimizar_historia(valor, clave_secreta)
    )
    limpio["marca_temporal"] = pd.to_datetime(limpio["Marca temporal"], errors="coerce")
    limpio["tar_antiguo"] = limpio["TAR antiguo"].astype(str).str.strip()
    limpio["tar_nuevo"] = limpio["TAR nuevo"].astype(str).str.strip()
    limpio["motivo_original"] = limpio["Motivo"].astype(str).str.strip()
    limpio["motivo_bloque"] = limpio["Motivo"].apply(clasificar_motivo)
    limpio["anio"] = limpio["marca_temporal"].dt.year
    limpio["mes"] = limpio["marca_temporal"].dt.to_period("M").astype(str).replace("NaT", pd.NA)
    limpio["transicion"] = limpio["tar_antiguo"] + " → " + limpio["tar_nuevo"]

    columnas_seguras = [
        "id_paciente",
        "marca_temporal",
        "anio",
        "mes",
        "tar_antiguo",
        "tar_nuevo",
        "transicion",
        "motivo_bloque",
        "motivo_original",
    ]
    return limpio[columnas_seguras].sort_values(["marca_temporal", "id_paciente"], na_position="last")
