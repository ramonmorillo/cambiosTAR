# cambiosTAR

**cambiosTAR** es una herramienta local, sencilla y segura para registrar, seudonimizar y analizar cambios de tratamiento antirretroviral (TAR) a partir de un Excel histórico ya existente.

La filosofía del proyecto es deliberadamente simple: **no pedir más variables clínicas al usuario**. La potencia debe venir de la limpieza, la seudonimización y el análisis automático de un registro histórico sencillo.

> **Aviso de privacidad:** la herramienta real se ejecuta en local con Streamlit. No subas datos reales a GitHub. El número de historia clínica se seudonimiza y no se muestra ni se exporta.

## Columnas obligatorias del Excel

La aplicación trabaja únicamente con estas columnas manuales:

- `Marca temporal`
- `Número de historia clínico`
- `TAR antiguo`
- `TAR nuevo`
- `Motivo`

A partir de ellas genera automáticamente:

- `fecha`
- `año`
- `mes`
- `ID seudonimizado`
- `transición TAR`
- `motivo_normalizado`
- `motivo_original`

## Qué permite hacer

- Cargar un Excel histórico.
- Validar columnas obligatorias y detectar errores frecuentes.
- Limpiar y normalizar fechas, TAR y motivos.
- Seudonimizar el número de historia clínica con SHA-256 y una clave local.
- Analizar cambios por año, mes, motivo y transición TAR.
- Visualizar la trayectoria longitudinal de cada paciente seudonimizado.
- Generar y descargar un Excel ficticio de prueba.
- Exportar un CSV seudonimizado sin el número de historia clínica original.

## Privacidad y protección de datos

- Funciona completamente en local.
- No usa APIs externas.
- No envía datos a internet.
- No guarda datos reales en GitHub.
- El `Número de historia clínico` solo se lee para generar un identificador seudonimizado estable.
- El número original no se muestra en pantalla, no aparece en gráficos y no se exporta.
- La seudonimización usa SHA-256 con `PSEUDONYM_SECRET_KEY`, definida en un archivo `.env` local.
- `.env`, Excel reales, CSV exportados, bases de datos y ficheros generados están ignorados por Git.

## Instalación

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

Después de copiar `.env.example` a `.env`, cambia el valor de `PSEUDONYM_SECRET_KEY` por una clave local larga, privada y única antes de procesar datos reales.

## Uso

1. Ejecuta la app con `streamlit run app.py`.
2. Carga un Excel con las 5 columnas obligatorias.
3. Revisa el panel de validación.
4. Consulta el dashboard temporal, por motivos, transiciones y trayectoria longitudinal.
5. Exporta el CSV seudonimizado si necesitas una base limpia para análisis local.

## Datos ficticios de prueba

Puedes probar la herramienta sin datos reales de dos formas:

1. Desde la app, usando el botón **Descargar Excel ficticio de prueba**.
2. Desde terminal:

```bash
python scripts/generar_datos_ejemplo.py
```

El archivo se genera localmente en:

```text
diccionarios/datos_ejemplo_ficticios.xlsx
```

Este Excel está ignorado por Git y contiene solo pacientes y números de historia ficticios.

## Análisis incluidos

### Dashboard general

- Total de cambios.
- Pacientes seudonimizados.
- Cambios por paciente.
- Año con más cambios.
- Motivo más frecuente.
- Transición más frecuente.

### Análisis temporal

- Cambios por año.
- Cambios por mes.
- Evolución mensual acumulada.
- Distribución anual por motivo.

### Análisis por motivo

El campo `Motivo` se normaliza de forma conservadora en 5 bloques:

1. Optimización
2. Efecto adverso
3. Interacción
4. Fracaso virológico
5. Otro

El texto original se conserva siempre en `motivo_original` para auditoría.

### Transiciones TAR

La app crea automáticamente:

```text
transición TAR = TAR antiguo + " → " + TAR nuevo
```

Incluye ranking de transiciones, transiciones por año, transiciones por motivo, Sankey de flujos principales y tabla filtrable.

### Trayectoria longitudinal

Permite seleccionar un `ID seudonimizado` y revisar la secuencia temporal de cambios, sin mostrar nunca el número de historia clínica.

## Exportación

El CSV exportado incluye únicamente:

- `fecha`
- `año`
- `mes`
- `ID seudonimizado`
- `TAR antiguo`
- `TAR nuevo`
- `transición TAR`
- `motivo_normalizado`
- `motivo_original`

Nunca incluye `Número de historia clínico`.

## GitHub Pages

La página publicada en GitHub Pages debe entenderse como **landing/documentación**. No es un entorno para subir datos. La aplicación real se ejecuta localmente con Streamlit mediante `streamlit run app.py`.

## Estructura del proyecto

```text
cambiosTAR/
├── app.py
├── src/
│   ├── pseudonimizacion.py
│   ├── limpieza.py
│   ├── analisis.py
│   └── datos_ejemplo.py
├── data/
│   └── .gitkeep
├── exports/
│   └── .gitkeep
├── diccionarios/
│   └── .gitkeep
├── scripts/
│   └── generar_datos_ejemplo.py
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

cambiosTAR · Herramienta local de análisis de cambios de TAR · Ramón Morillo
