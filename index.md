# cambiosTAR

**Registro y análisis local de cambios de tratamiento antirretroviral**

cambiosTAR es una herramienta local, sencilla y segura para registrar, seudonimizar y analizar cambios de tratamiento antirretroviral a partir de un Excel histórico ya existente.

> **Importante:** esta página de GitHub Pages es solo una landing/documentación. No cargues datos reales aquí ni los subas al repositorio. La herramienta real se ejecuta en tu ordenador con Streamlit.

## Columnas necesarias

La aplicación utiliza únicamente:

- `Marca temporal`
- `Número de historia clínico`
- `TAR antiguo`
- `TAR nuevo`
- `Motivo`

No añade nuevas variables manuales. Solo genera variables derivadas como fecha, año, mes, transición TAR, ID seudonimizado, motivo normalizado y motivo original.

## Módulos incluidos

- Carga y validación del Excel histórico.
- Limpieza y normalización de datos.
- Seudonimización local con SHA-256 y clave `.env`.
- Dashboard general.
- Análisis temporal.
- Análisis por motivo.
- Análisis de transiciones TAR, incluyendo Sankey.
- Trayectoria longitudinal por paciente seudonimizado.
- Exportación seudonimizada.
- Generación de Excel ficticio de prueba.

## Privacidad

- No se envían datos a internet.
- No se usan APIs externas.
- El número de historia clínica original no se muestra ni se exporta.
- `.env`, Excel reales, CSV exportados, bases de datos y archivos generados están ignorados por Git.
- No subas datos reales a GitHub.

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

Edita `.env` y configura una clave privada en `PSEUDONYM_SECRET_KEY` antes de procesar datos reales.

## Datos ficticios

Para generar un Excel ficticio local:

```bash
python scripts/generar_datos_ejemplo.py
```

El archivo se crea en `diccionarios/datos_ejemplo_ficticios.xlsx` y está ignorado por Git.

## Autoría

cambiosTAR · Herramienta local de análisis de cambios de TAR · Ramón Morillo
