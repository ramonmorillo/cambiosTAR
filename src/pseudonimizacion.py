"""Utilidades para seudonimizar identificadores clínicos en local."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(".env")
SECRET_ENV_VAR = "SECRET_KEY"
PLACEHOLDER_SECRET = "CAMBIAR_ESTA_CLAVE_POR_UNA_CLAVE_LOCAL_SEGURA"


def cargar_clave_secreta(env_path: Path = ENV_PATH) -> str:
    """Carga la clave local de seudonimización desde el archivo .env."""
    load_dotenv(env_path)
    clave = os.getenv(SECRET_ENV_VAR, "").strip()
    if not clave:
        raise RuntimeError("Debe configurar SECRET_KEY en el archivo .env antes de procesar datos reales.")
    if clave == PLACEHOLDER_SECRET:
        raise RuntimeError(
            "La clave de .env sigue siendo la de ejemplo. Cámbiela por una clave local privada antes de procesar datos reales."
        )
    return clave


def seudonimizar_historia(numero_historia: object, clave_secreta: str) -> str:
    """Devuelve un ID estable seudonimizado con SHA-256 y una clave local."""
    valor = "" if numero_historia is None else str(numero_historia).strip()
    payload = f"{clave_secreta}:{valor}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]
