"""Datos ficticios y utilidades para crear el Excel de ejemplo en local."""

from __future__ import annotations

from io import BytesIO

import pandas as pd

NOMBRE_EXCEL_EJEMPLO = "datos_ejemplo_ficticios.xlsx"


def datos_ejemplo_ficticios() -> pd.DataFrame:
    """Devuelve datos completamente ficticios para probar cambiosTAR."""
    registros = [
        ["2020-02-14 09:30", "FIC-1001", "TDF/FTC + DTG", "TAF/FTC/BIC", "Optimización por simplificación"],
        ["2020-06-03 10:15", "FIC-1002", "ABC/3TC/DTG", "TAF/FTC/BIC", "Efecto adverso digestivo"],
        ["2020-10-21 12:00", "FIC-1003", "TDF/FTC/EFV", "TAF/FTC/RPV", "Interacción con comedicación"],
        ["2021-01-15 09:30", "FIC-1001", "TAF/FTC/BIC", "DTG/3TC", "Switch a biterapia"],
        ["2021-03-22 11:10", "FIC-1004", "DRV/c + TAF/FTC", "TAF/FTC/BIC", "toxicidad preventiva"],
        ["2021-09-05 08:45", "FIC-1005", "TDF/FTC/EFV", "TAF/FTC/RPV", "DDI con antiepiléptico"],
        ["2022-02-18 12:20", "FIC-1006", "TAF/FTC/BIC", "DRV/c + TAF/FTC", "Fracaso virológico con rebote"],
        ["2022-06-30 10:00", "FIC-1002", "TAF/FTC/BIC", "CAB/RPV LA", "Simplificación y comodidad"],
        ["2022-12-12 13:15", "FIC-1007", "DTG/3TC", "TAF/FTC/BIC", "Preferencia del paciente"],
        ["2023-04-04 09:00", "FIC-1008", "TAF/FTC/RPV", "DTG/3TC", "Carga viral detectable"],
        ["2023-07-19 14:30", "FIC-1009", "DRV/c + TAF/FTC", "TAF/FTC/BIC", "Toxicidad renal sospechada"],
        ["2023-11-08 16:05", "FIC-1010", "TAF/FTC/BIC", "TAF/FTC/RPV", "neuropsiquiátrico"],
        ["2024-01-25 08:30", "FIC-1003", "TAF/FTC/RPV", "DTG/3TC", "Otro motivo administrativo"],
        ["2024-05-09 15:40", "FIC-1004", "TAF/FTC/BIC", "DTG/3TC", "Mejora de pauta"],
        ["2024-09-17 11:25", "FIC-1011", "ABC/3TC/DTG", "TAF/FTC/BIC", "ósea"],
        ["2025-02-07 10:10", "FIC-1012", "TAF/FTC/BIC", "CAB/RPV LA", "Optimización"],
        ["2025-06-16 13:50", "FIC-1006", "DRV/c + TAF/FTC", "TAF/FTC/BIC", "Resistencia documentada"],
        ["2025-10-03 09:05", "FIC-1013", "TAF/FTC/RPV", "TAF/FTC/BIC", "Interacciones"],
        ["2026-01-20 12:45", "FIC-1014", "DTG/3TC", "TAF/FTC/BIC", "Intolerancia"],
        ["2026-04-11 08:55", "FIC-1001", "DTG/3TC", "CAB/RPV LA", "simplificación"],
    ]
    return pd.DataFrame(registros, columns=["Marca temporal", "Número de historia clínico", "TAR antiguo", "TAR nuevo", "Motivo"])


def excel_ejemplo_en_memoria() -> bytes:
    """Genera el Excel ficticio en memoria para descarga local desde Streamlit."""
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        datos_ejemplo_ficticios().to_excel(writer, index=False, sheet_name="datos_ficticios")
    return buffer.getvalue()
