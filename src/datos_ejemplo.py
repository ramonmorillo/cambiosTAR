"""Datos ficticios y utilidades para crear el Excel de ejemplo en local."""

from __future__ import annotations

from io import BytesIO

import pandas as pd

NOMBRE_EXCEL_EJEMPLO = "datos_ejemplo_ficticios.xlsx"


def datos_ejemplo_ficticios() -> pd.DataFrame:
    """Devuelve datos completamente ficticios para probar cambiosTAR."""
    return pd.DataFrame(
        [
            ["2021-01-15 09:30", "FIC-0001", "TDF/FTC + DTG", "TAF/FTC/BIC", "Optimización por simplificación"],
            ["2021-03-22 11:10", "FIC-0002", "ABC/3TC/DTG", "TAF/FTC/BIC", "Efecto adverso digestivo"],
            ["2021-09-05 08:45", "FIC-0003", "TDF/FTC/EFV", "TAF/FTC/RPV", "Interacción con medicación concomitante"],
            ["2022-02-18 12:20", "FIC-0001", "TAF/FTC/BIC", "DTG/3TC", "Optimización a biterapia"],
            ["2022-06-30 10:00", "FIC-0004", "TAF/FTC/BIC", "DRV/c + TAF/FTC", "Fracaso virológico con rebote"],
            ["2022-12-12 13:15", "FIC-0005", "DTG/3TC", "TAF/FTC/BIC", "Preferencia del paciente"],
            ["2023-04-04 09:00", "FIC-0002", "TAF/FTC/BIC", "CAB/RPV LA", "Simplificación y comodidad"],
            ["2023-07-19 14:30", "FIC-0006", "DRV/c + TAF/FTC", "TAF/FTC/BIC", "Toxicidad renal sospechada"],
            ["2024-01-25 08:30", "FIC-0007", "TAF/FTC/RPV", "DTG/3TC", "Otro motivo administrativo"],
            ["2024-05-09 15:40", "FIC-0003", "TAF/FTC/RPV", "TAF/FTC/BIC", "Actualización de pauta"],
        ],
        columns=["Marca temporal", "Número de historia clínico", "TAR antiguo", "TAR nuevo", "Motivo"],
    ).assign(**{"Número de historia clínico.1": lambda df: df["Número de historia clínico"]})


def excel_ejemplo_en_memoria() -> bytes:
    """Genera el Excel ficticio en memoria para descarga local desde Streamlit."""
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        datos_ejemplo_ficticios().to_excel(writer, index=False, sheet_name="datos_ficticios")
    return buffer.getvalue()
