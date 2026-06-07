# cambiosTAR

**Aplicación local para registrar, importar, acumular y analizar cambios de tratamiento antirretroviral.**

cambiosTAR ya no está orientada a un análisis puntual de un Excel aislado. El objetivo operativo es disponer de una **app local de uso diario en Streamlit** con una base SQLite persistente (`cambiosTAR_local.db`) para:

- Importar una vez el histórico previo desde Excel.
- Registrar cada día nuevos cambios de TAR mediante formulario.
- Acumular los registros en una base local longitudinal.
- Analizar evolución temporal, motivos, transiciones y trayectorias por paciente seudonimizado.
- Generar informes y exportaciones seudonimizadas.

> [!IMPORTANT]
> La página de GitHub Pages (`index.html` + `style.css`) es únicamente una landing/documentación pública. **No procesa datos, no permite cargar datos reales y no debe usarse como aplicación operativa.** Todo el trabajo con datos reales se realiza en local mediante `streamlit run app.py`.

## Protección de datos

- La app no envía datos a internet ni usa APIs externas.
- El número de historia clínica **nunca se guarda en claro**.
- La seudonimización se realiza localmente con SHA-256 y `SECRET_KEY` definida en `.env`.
- Si no existe `SECRET_KEY` válida, la app bloquea el procesamiento de datos reales.
- `.env`, `cambiosTAR_local.db`, Excel, CSV, exportaciones y datos reales están ignorados por Git.
- Las exportaciones contienen únicamente datos seudonimizados.

## Variables de entrada permitidas

No se añaden nuevas variables clínicas manuales. La app solo solicita o importa:

1. Marca temporal o fecha.
2. Número de historia clínico.
3. TAR antiguo.
4. TAR nuevo.
5. Motivo.

A partir de esas variables se generan campos derivados internos: `fecha`, `anio`, `mes`, `paciente_id`, `transicion_tar`, `motivo_original`, `motivo_normalizado`, `origen` y `fecha_creacion`.

## Base de datos local

La base local persistente se llama `cambiosTAR_local.db` y contiene la tabla `cambios_tar`:

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Identificador interno del registro. |
| `fecha` | TEXT | Fecha normalizada del cambio. |
| `anio` | INTEGER | Año del cambio. |
| `mes` | INTEGER | Mes del cambio. |
| `paciente_id` | TEXT | Identificador seudonimizado SHA-256. |
| `tar_antiguo` | TEXT | TAR previo. |
| `tar_nuevo` | TEXT | TAR posterior. |
| `transicion_tar` | TEXT | `tar_antiguo → tar_nuevo`. |
| `motivo_original` | TEXT | Motivo textual original. |
| `motivo_normalizado` | TEXT | Categoría normalizada. |
| `origen` | TEXT | `historico` o `registro_manual`. |
| `fecha_creacion` | TEXT | Momento local de inserción. |

La tabla evita duplicados exactos por `paciente_id + fecha + tar_antiguo + tar_nuevo + motivo_original`.

## Motivos normalizados

El campo `Motivo` se conserva como `motivo_original` y se clasifica de forma conservadora en:

- Optimización.
- Efecto adverso.
- Interacción.
- Fracaso virológico.
- Otro.

## Arquitectura

```text
app.py                    # Aplicación principal Streamlit local
database.py               # Creación, lectura, edición y borrado en SQLite
utils.py                  # Limpieza, normalización, mapeo y seudonimización
reports.py                # Informes Excel/HTML y comentario automático
requirements.txt          # Dependencias Python
.env.example              # Plantilla de SECRET_KEY sin secreto real
.gitignore                # Exclusión de secretos, bases y datos reales
index.html                # Landing/documentación pública GitHub Pages
style.css                 # Estilos de la landing
src/                      # Funciones históricas/compatibilidad del proyecto
scripts/                  # Utilidades con datos ficticios
```

## Instalación local

```bash
git clone https://github.com/<usuario>/cambiosTAR.git
cd cambiosTAR
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app.py
```

Windows PowerShell:

```powershell
git clone https://github.com/<usuario>/cambiosTAR.git
cd cambiosTAR
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
streamlit run app.py
```

Edite `.env` y sustituya el valor de `SECRET_KEY` por una clave larga, privada y local antes de procesar datos reales.

## Carga inicial del histórico

1. Ejecute la app local con `streamlit run app.py`.
2. Abra el módulo **Importar histórico**.
3. Cargue el Excel previo.
4. Mapee columnas si los nombres no coinciden exactamente con las variables requeridas.
5. Revise la previsualización, los registros con errores y los posibles duplicados.
6. Importe los registros válidos.

El histórico se importa para crear o ampliar la base acumulada local. Los identificadores se seudonimizan antes de guardarse y los duplicados exactos se omiten.

## Uso diario

1. Abra **Nuevo cambio** y registre fecha, número de historia, TAR antiguo, TAR nuevo y motivo.
2. Consulte **Inicio / Dashboard** para ver totales, pacientes, cambios recientes y valores más frecuentes.
3. Revise **Análisis temporal**, **Análisis por motivo**, **Transiciones TAR** y **Trayectoria por paciente** para seguir la evolución acumulada.
4. Genere un informe periódico desde **Informes** con filtros mensual, trimestral, anual o por rango personalizado.

## Módulos de la aplicación

- **Inicio / Dashboard:** total de cambios, pacientes seudonimizados, cambios del año y mes actual, motivo/TAR/transición más frecuente y última fecha registrada.
- **Nuevo cambio:** formulario diario con seudonimización previa al guardado.
- **Importar histórico:** carga Excel, mapeo de columnas, validación, previsualización y omisión de duplicados.
- **Explorar registros:** filtros, descarga Excel, edición y borrado con confirmación.
- **Análisis temporal:** cambios por año, mes, acumulado y evolución por motivo.
- **Análisis por motivo:** distribución, evolución y auditoría motivo original vs normalizado.
- **Transiciones TAR:** rankings, análisis por año/motivo, TAR antiguos/nuevos frecuentes y Sankey si Plotly está disponible.
- **Trayectoria por paciente:** línea temporal, secuencia TAR, motivos y exportación individual seudonimizada.
- **Informes:** informes mensual/trimestral/anual/personalizado en Excel o HTML con comentario automático.
- **Exportación:** base completa seudonimizada y datos filtrados.

## Datos ficticios

Puede probar el flujo con datos ficticios generados localmente:

```bash
python scripts/generar_datos_ejemplo.py
```

No suba datos reales, bases SQLite ni exportaciones al repositorio.

## Limitaciones

- La normalización de motivos se basa en reglas de texto conservadoras.
- La calidad del análisis depende de la calidad de los datos importados o registrados.
- La exportación PDF se deja fuera por defecto para evitar dependencias pesadas; se puede exportar HTML y convertirlo a PDF externamente si procede.
- La herramienta no sustituye procedimientos institucionales de protección de datos ni revisión clínica.

## Autoría

Herramienta desarrollada por Ramón Morillo para el análisis local de cambios de tratamiento antirretroviral.

**2026 · cambiosTAR**
