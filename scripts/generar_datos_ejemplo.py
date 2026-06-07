"""Genera localmente data/example_ficticio.xlsx con datos ficticios."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.datos_ejemplo import datos_ejemplo_ficticios  # noqa: E402


def main() -> None:
    salida = ROOT / "data" / "example_ficticio.xlsx"
    salida.parent.mkdir(parents=True, exist_ok=True)
    datos_ejemplo_ficticios().to_excel(salida, index=False, sheet_name="datos_ficticios")
    print(f"Excel ficticio generado en {salida}")


if __name__ == "__main__":
    main()
