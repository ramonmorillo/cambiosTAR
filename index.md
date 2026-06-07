# cambiosTAR

**Aplicación local de uso diario para registrar, importar y analizar cambios de tratamiento antirretroviral.**

cambiosTAR permite importar un histórico previo desde Excel, registrar nuevos cambios diariamente y analizar la evolución acumulada en el tiempo en una base local SQLite seudonimizada.

> **Importante:** esta página de GitHub Pages es solo una landing/documentación pública. No procesa datos, no permite cargar datos reales y no debe utilizarse como aplicación operativa. La aplicación real se ejecuta en local con Streamlit.

## App local vs GitHub Pages

| Componente | Finalidad | Datos reales |
| --- | --- | --- |
| GitHub Pages | Landing y documentación pública | No procesa datos |
| Streamlit (`app.py`) | Registro diario, importación, análisis e informes | Solo en el equipo local |
| SQLite (`cambiosTAR_local.db`) | Base acumulada persistente | Local e ignorada por Git |

## Carga inicial del histórico

El Excel histórico previo se importa una vez para crear o ampliar la base acumulada local:

1. Ejecutar `streamlit run app.py`.
2. Abrir **Importar histórico**.
3. Cargar el Excel.
4. Mapear columnas si sus nombres no coinciden.
5. Revisar previsualización, errores y duplicados.
6. Importar registros válidos seudonimizados.

## Uso diario

1. Registrar un nuevo cambio desde **Nuevo cambio**.
2. Consultar el **Dashboard**.
3. Analizar evolución temporal, motivos, transiciones y trayectorias.
4. Generar informe mensual, trimestral, anual o por rango personalizado.

## Variables necesarias

La aplicación utiliza únicamente:

- `Marca temporal` o `Fecha`.
- `Número de historia clínico`.
- `TAR antiguo`.
- `TAR nuevo`.
- `Motivo`.

No añade variables clínicas manuales. Genera solo variables derivadas: fecha, año, mes, transición TAR, paciente seudonimizado, motivo normalizado, origen y fecha de creación.

## Privacidad

- No se envían datos a internet.
- No se usan APIs externas.
- El número de historia clínica original nunca se guarda en claro.
- La seudonimización se realiza con SHA-256 y `SECRET_KEY` en `.env`.
- `.env`, bases SQLite, Excel, CSV, exportaciones y datos reales deben permanecer fuera de Git.

## Instalación local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app.py
```

En Windows:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
streamlit run app.py
```

Edite `.env` y configure una clave local segura en `SECRET_KEY` antes de procesar datos reales.

## Autoría

cambiosTAR · Herramienta local de análisis longitudinal de cambios TAR · Ramón Morillo
