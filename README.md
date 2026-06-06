# cambiosTAR

cambiosTAR es una herramienta local, sencilla y segura para registrar, seudonimizar y analizar cambios de tratamiento antirretroviral (TAR) a partir de un Excel histórico ya existente.

La aplicación no añade nuevas variables manuales: trabaja únicamente con estas columnas del Excel:

- `Marca temporal`
- `Número de historia clínico`
- `TAR antiguo`
- `TAR nuevo`
- `Motivo`

Puede generar variables derivadas automáticamente, como el año, el mes, la transición TAR y el ID seudonimizado.

## Privacidad y seguridad

- La aplicación funciona completamente en local con Streamlit.
- No utiliza APIs externas ni envía datos a la nube.
- El `Número de historia clínico` no se muestra ni se exporta.
- El identificador clínico se transforma en un ID seudonimizado estable mediante SHA-256 y una clave secreta local guardada en `.env`.
- No incluyas nunca Excel reales, CSV exportados, bases de datos ni archivos `.env` en GitHub.
- El repositorio no versiona archivos Excel binarios. El Excel de ejemplo se genera localmente con datos completamente ficticios desde la app o con `python scripts/generar_datos_ejemplo.py`.

## Módulos incluidos

- Carga del Excel histórico.
- Dashboard general.
- Cambios por año.
- Cambios por mes.
- Distribución por motivo.
- Motivos por año.
- Transiciones `TAR antiguo → TAR nuevo`.
- Ranking de transiciones más frecuentes.
- Gráfico Sankey de los principales flujos de cambio.
- Trayectoria longitudinal por paciente seudonimizado.
- Exportación de CSV seudonimizado.

## Normalización del motivo

El campo `Motivo` se normaliza de forma conservadora en uno de estos 5 bloques:

1. Optimización
2. Efecto adverso
3. Interacción
4. Fracaso virológico
5. Otro

Si el motivo llega como texto libre, la app lo reclasifica automáticamente y conserva el texto original en `motivo_original` para facilitar la auditoría.

## Instalación

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app.py
```

En Windows, activa el entorno con:

```bat
.venv\Scripts\activate
```

Después de copiar `.env.example` a `.env`, cambia el valor de `PSEUDONYM_SECRET_KEY` por una clave local larga, privada y única antes de procesar datos reales.

## Uso

1. Ejecuta la app con `streamlit run app.py`.
2. Carga un Excel con las columnas requeridas.
3. Revisa los paneles de análisis.
4. Exporta el CSV seudonimizado si lo necesitas.

Puedes probar la app descargando el Excel ficticio desde la pantalla inicial o generándolo localmente con `python scripts/generar_datos_ejemplo.py`. El archivo resultante se crea como `diccionarios/datos_ejemplo_ficticios.xlsx`, queda ignorado por Git y no contiene datos reales.

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

## Archivo ficticio de ejemplo

Para evitar problemas con archivos binarios en GitHub, `diccionarios/datos_ejemplo_ficticios.xlsx` no se versiona. Se puede crear localmente de dos formas:

1. Desde la app, con el botón **Descargar Excel ficticio de prueba**.
2. Desde terminal, con `python scripts/generar_datos_ejemplo.py`.

## Aviso

La herramienta funciona en local. El número de historia se transforma en un ID seudonimizado. No subas datos reales a GitHub.

---

cambiosTAR · Herramienta local de análisis de cambios de TAR · Ramón Morillo
