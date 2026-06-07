"""Utilidades locales de limpieza, normalización y seudonimización para cambiosTAR."""

from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from pathlib import Path
from typing import Iterable

import pandas as pd
from dotenv import load_dotenv

DB_PATH = Path("cambiosTAR_local.db")
ENV_PATH = Path(".env")
SECRET_ENV_VAR = "SECRET_KEY"
PLACEHOLDER_SECRET = "CAMBIAR_ESTA_CLAVE_POR_UNA_CLAVE_LOCAL_SEGURA"

INPUT_COLUMNS = {
    "fecha": "Marca temporal / Fecha",
    "historia": "Número de historia clínico",
    "tar_antiguo": "TAR antiguo",
    "tar_nuevo": "TAR nuevo",
    "motivo": "Motivo",
}

MOTIVO_CATEGORIAS = [
    "Optimización",
    "Efecto adverso",
    "Interacción",
    "Fracaso virológico",
    "Otro",
]

DB_COLUMNS = [
    "id",
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

EXPORT_COLUMNS = [
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

COLUMN_SYNONYMS = {
    "fecha": ["marca temporal", "fecha", "fecha del cambio", "timestamp", "marca de tiempo"],
    "historia": ["numero de historia clinico", "número de historia clínico", "historia", "nhc", "numero historia", "nº historia"],
    "tar_antiguo": ["tar antiguo", "tratamiento antiguo", "tar previo", "pauta previa", "tratamiento previo"],
    "tar_nuevo": ["tar nuevo", "tratamiento nuevo", "tar posterior", "nueva pauta", "pauta nueva"],
    "motivo": ["motivo", "motivo del cambio", "causa", "razon", "razón"],
}


def normalizar_texto_basico(texto: object) -> str:
    """Normaliza texto para comparaciones robustas sin conservar acentos ni mayúsculas."""
    texto = "" if pd.isna(texto) else str(texto).strip().lower()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(caracter for caracter in texto if not unicodedata.combining(caracter))
    return re.sub(r"\s+", " ", texto)


def limpiar_texto(valor: object, por_defecto: str = "") -> str:
    """Limpia espacios y devuelve un texto seguro."""
    if pd.isna(valor):
        return por_defecto
    texto = re.sub(r"\s+", " ", str(valor)).strip()
    return texto or por_defecto


def cargar_clave_secreta(env_path: Path = ENV_PATH) -> str:
    """Carga SECRET_KEY desde .env y bloquea el proceso si no existe o es la clave de ejemplo."""
    load_dotenv(env_path)
    clave = os.getenv(SECRET_ENV_VAR, "").strip()
    if not clave:
        raise RuntimeError("Debe configurar SECRET_KEY en .env antes de procesar datos reales.")
    if clave == PLACEHOLDER_SECRET:
        raise RuntimeError("SECRET_KEY sigue usando el valor de .env.example. Sustitúyala por una clave local segura.")
    return clave


def seudonimizar_historia(numero_historia: object, clave_secreta: str) -> str:
    """Seudonimiza el número de historia con SHA-256 y una clave secreta local."""
    valor = limpiar_texto(numero_historia)
    payload = f"{clave_secreta}:{valor}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def normalizar_motivo(motivo: object) -> str:
    """Clasifica el motivo libre en una de las cinco categorías permitidas."""
    texto = normalizar_texto_basico(motivo)
    if not texto:
        return "Otro"
    if any(p in texto for p in ["fracaso", "rebote", "viremia", "resistencia", "carga viral detectable", "virolog"]):
        return "Fracaso virológico"
    if any(p in texto for p in ["interaccion", "ddi", "comedicacion", "concomitante"]):
        return "Interacción"
    if any(p in texto for p in ["efecto adverso", "advers", "toxic", "intoler", "renal", "osea", "digest", "neuro", "diarrea", "rash", "nause"]):
        return "Efecto adverso"
    if any(p in texto for p in ["optimiz", "simplific", "biterapia", "mejora", "switch", "comodidad", "preferencia", "actualizacion"]):
        return "Optimización"
    directas = {normalizar_texto_basico(categoria): categoria for categoria in MOTIVO_CATEGORIAS}
    return directas.get(texto, "Otro")


def preparar_registro(fecha: object, historia: object, tar_antiguo: object, tar_nuevo: object, motivo: object, origen: str, clave_secreta: str) -> dict[str, object]:
    """Prepara un registro compatible con SQLite sin conservar el identificador original."""
    if origen not in {"historico", "registro_manual"}:
        raise ValueError("origen debe ser 'historico' o 'registro_manual'.")
    obligatorios = {
        "fecha": fecha,
        "Número de historia clínico": historia,
        "TAR antiguo": tar_antiguo,
        "TAR nuevo": tar_nuevo,
        "Motivo": motivo,
    }
    faltantes = [nombre for nombre, valor in obligatorios.items() if limpiar_texto(valor) == ""]
    if faltantes:
        raise ValueError("Faltan campos obligatorios: " + ", ".join(faltantes))

    fecha_dt = pd.to_datetime(fecha, errors="coerce", dayfirst=True)
    if pd.isna(fecha_dt):
        raise ValueError("La fecha no es válida.")
    fecha_iso = fecha_dt.date().isoformat()
    tar_antiguo_limpio = limpiar_texto(tar_antiguo)
    tar_nuevo_limpio = limpiar_texto(tar_nuevo)
    motivo_original = limpiar_texto(motivo)
    return {
        "fecha": fecha_iso,
        "anio": int(fecha_dt.year),
        "mes": int(fecha_dt.month),
        "paciente_id": seudonimizar_historia(historia, clave_secreta),
        "tar_antiguo": tar_antiguo_limpio,
        "tar_nuevo": tar_nuevo_limpio,
        "transicion_tar": f"{tar_antiguo_limpio} → {tar_nuevo_limpio}",
        "motivo_original": motivo_original,
        "motivo_normalizado": normalizar_motivo(motivo_original),
        "origen": origen,
    }


def detectar_mapeo_columnas(columnas: Iterable[object]) -> dict[str, str | None]:
    """Propone un mapeo automático entre columnas del Excel y campos requeridos."""
    columnas_lista = [str(col).strip() for col in columnas]
    normalizadas = {normalizar_texto_basico(col): col for col in columnas_lista}
    resultado: dict[str, str | None] = {}
    for campo, sinonimos in COLUMN_SYNONYMS.items():
        encontrado = None
        for sinonimo in sinonimos:
            clave = normalizar_texto_basico(sinonimo)
            if clave in normalizadas:
                encontrado = normalizadas[clave]
                break
        resultado[campo] = encontrado
    return resultado


def dataframe_desde_excel_mapeado(df: pd.DataFrame, mapeo: dict[str, str]) -> pd.DataFrame:
    """Renombra un Excel con el mapeo elegido por el usuario a los campos internos."""
    requeridos = list(INPUT_COLUMNS)
    faltantes = [campo for campo in requeridos if not mapeo.get(campo)]
    if faltantes:
        raise ValueError("Debe mapear todos los campos obligatorios antes de importar.")
    salida = pd.DataFrame({campo: df[mapeo[campo]] for campo in requeridos})
    return salida


def validar_dataframe_importacion(df: pd.DataFrame, clave_secreta: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devuelve registros válidos preparados y una tabla de errores de importación."""
    registros: list[dict[str, object]] = []
    errores: list[dict[str, object]] = []
    for indice, fila in df.iterrows():
        try:
            registros.append(
                preparar_registro(
                    fila["fecha"], fila["historia"], fila["tar_antiguo"], fila["tar_nuevo"], fila["motivo"], "historico", clave_secreta
                )
            )
        except Exception as exc:  # noqa: BLE001 - se muestra al usuario como validación de fila
            errores.append({"fila": int(indice) + 2, "error": str(exc)})
    return pd.DataFrame(registros), pd.DataFrame(errores)


def dataframe_to_excel_bytes(df: pd.DataFrame, sheet_name: str = "cambiosTAR") -> bytes:
    """Convierte un DataFrame a un archivo Excel en memoria."""
    from io import BytesIO

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
    return buffer.getvalue()
