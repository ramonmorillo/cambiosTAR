# Datos de ejemplo y datos reales

Este directorio no versiona archivos Excel, CSV ni otros datos tabulares para evitar adjuntar binarios o información sensible en pull requests.

Para probar cambiosTAR sin datos reales:

1. Ejecuta la aplicación Streamlit y descarga el Excel ficticio desde la barra lateral.
2. O genera localmente el Excel ficticio con:

```bash
python scripts/generar_datos_ejemplo.py
```

El archivo generado será `data/example_ficticio.xlsx`, queda ignorado por Git y debe considerarse solo un recurso local de prueba con datos ficticios.

Los datos reales deben permanecer siempre fuera del repositorio, preferiblemente en `data/real/`, que también está ignorado por Git.
