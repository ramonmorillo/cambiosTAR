# cambiosTAR

**cambiosTAR** es una aplicación web estática para registrar, analizar y generar informes de cambios de tratamiento antirretroviral (TAR). Funciona sin backend y está pensada para publicarse directamente en GitHub Pages:

<https://ramonmorillo.github.io/cambiosTAR/>

La herramienta permite registrar cambios diarios, importar un histórico previo desde Excel, consultar una base acumulada en el navegador, analizar tendencias, generar informes y exportar copias de seguridad en Excel, CSV y JSON.

## Funcionamiento sin backend

cambiosTAR funciona como una aplicación web estática sin backend. Los datos se almacenan localmente en el navegador/equipo del usuario.

- No requiere instalación ni servicios en segundo plano.
- No requiere servidores ni bases de datos externas.
- No envía registros ni archivos a servidores externos.
- Usa IndexedDB para persistencia local en el navegador y localStorage como respaldo si IndexedDB no estuviera disponible.
- Puede desplegarse como HTML, CSS y JavaScript estático en GitHub Pages.

## Variables de entrada

La aplicación solo solicita cinco variables manuales:

1. Fecha o marca temporal.
2. Número de historia clínica.
3. TAR antiguo.
4. TAR nuevo.
5. Motivo.

No añade variables clínicas manuales adicionales.

## Variables derivadas automáticamente

Al guardar o importar registros, la aplicación calcula automáticamente:

- ID seudonimizado del paciente (`patient_id`).
- Año.
- Mes.
- Trimestre.
- Transición TAR (`TAR antiguo → TAR nuevo`).
- Motivo normalizado.
- Motivo original.
- Origen del registro (`histórico importado` o `registro manual`).
- Fecha de creación del registro.

## Normalización de motivos

El texto original del motivo se conserva siempre en `motivo_original`. Además, se clasifica automáticamente en uno de estos grupos:

- Optimización.
- Efecto adverso.
- Interacción.
- Fracaso virológico.
- Otro.

La clasificación se basa en reglas de texto conservadoras y debe interpretarse como apoyo analítico, no como codificación clínica definitiva.

## Seudonimización y protección de datos

Antes de guardar un registro, el número de historia clínica se transforma en un `patient_id` seudonimizado mediante SHA-256 con Web Crypto API cuando está disponible. El número de historia clínica no se guarda en claro.

La interfaz permite configurar una clave local de seudonimización. Esta clave:

- Se usa para generar identificadores estables.
- Puede guardarse solo en el navegador si el usuario lo decide.
- No se incluye en exportaciones.
- Debe conservarse de forma segura: si se pierde o cambia, el mismo número de historia puede generar identificadores diferentes.

Avisos importantes:

- No introduzca nombres, DNI, teléfonos, direcciones ni identificadores directos en campos de texto libre.
- No suba archivos reales al repositorio GitHub.
- No use la herramienta como historia clínica ni como sustituto de sistemas corporativos.
- Si se borra la caché, se cambia de navegador o se usa otro equipo, los datos pueden perderse si no se han exportado backups.

### Pruebas manuales de clave local

- Configurar una clave sin marcar **Guardar la clave solo en este navegador** y registrar un cambio sin recargar la página.
- Configurar una clave marcando **Guardar la clave solo en este navegador**, recargar la página y registrar un cambio.
- Pulsar **Olvidar clave** y comprobar que vuelve a mostrarse el aviso de falta de clave y se bloquea el registro real.
- Intentar registrar un cambio sin clave y comprobar que la aplicación lo bloquea antes de guardar.
- Revisar los registros/exportaciones y comprobar que el número de historia clínica no se guarda en claro.

## Módulos de la aplicación

### Inicio

Muestra el objetivo de la herramienta, el aviso de almacenamiento local y accesos rápidos para registrar cambios, importar histórico, abrir dashboard, generar informes y exportar copias de seguridad.

### Configuración de seguridad

Incluye la configuración de clave local de seudonimización, comprobación de clave, avisos de protección de datos y borrado completo de datos locales con doble confirmación.

### Registrar nuevo cambio

Formulario diario con fecha, número de historia clínica, TAR antiguo, TAR nuevo y motivo. Al guardar:

- Valida campos obligatorios.
- Genera `patient_id` seudonimizado.
- Elimina el número de historia en claro tras generar el identificador.
- Normaliza el motivo.
- Crea la transición TAR.
- Guarda el registro localmente.
- Actualiza la base, filtros, dashboard y trayectoria por paciente.

### Importar histórico Excel

Permite cargar un archivo `.xlsx` desde el navegador. La aplicación no sube el archivo a ningún servidor.

Funciones incluidas:

- Lectura local del Excel.
- Validación de columnas.
- Mapeo de columnas si los nombres no coinciden exactamente.
- Previsualización antes de importar.
- Conteo de registros detectados, errores y posibles duplicados.
- Importación de registros validados con origen `histórico importado`.
- Prevención de duplicados exactos por `patient_id + fecha + TAR antiguo + TAR nuevo + motivo_original`.

### Base de registros

Tabla interactiva con todos los registros guardados. Incluye filtros por rango de fechas, año, mes, motivo normalizado, TAR antiguo, TAR nuevo, origen y patient_id. Permite editar, eliminar con confirmación y exportar la tabla filtrada en Excel o CSV.

### Dashboard

Incluye tarjetas resumen y gráficos de análisis:

- Total de cambios registrados.
- Total de pacientes seudonimizados.
- Cambios del mes actual.
- Cambios del año actual.
- Motivo más frecuente.
- TAR nuevo más frecuente.
- Transición más frecuente.
- Último registro guardado.
- Cambios por año y mes.
- Evolución acumulada.
- Distribución de motivos.
- Motivos por año.
- Top TAR antiguos, nuevos y transiciones.
- Transiciones por motivo.
- Sankey TAR antiguo → TAR nuevo cuando Plotly está disponible.

### Trayectoria por paciente

Permite seleccionar un `patient_id` seudonimizado y visualizar número de cambios, línea temporal, secuencia TAR, motivos de cada cambio, exportación individual a Excel/CSV e informe individual seudonimizado.

### Informes

Genera informes mensuales, trimestrales, anuales o por rango personalizado. Incluye periodo analizado, número total de cambios, número de pacientes, distribución de motivos, principales transiciones, evolución temporal resumida, top TAR antiguos, top TAR nuevos y comentario interpretativo automático.

Acciones disponibles:

- Copiar resumen.
- Imprimir informe.
- Exportar informe en HTML.
- Exportar datos del informe en Excel.
- Exportar datos del informe en CSV.

### Copias y exportación

Permite:

- Exportar todos los registros a Excel.
- Exportar todos los registros a CSV.
- Exportar todos los registros a JSON.
- Exportar backup completo JSON.
- Importar backup JSON.
- Exportar registros filtrados.
- Exportar registros de un periodo.
- Descargar plantilla Excel para carga histórica.

Se recomienda exportar periódicamente un backup JSON y una copia Excel/CSV.

## Plantilla Excel

La plantilla para carga histórica contiene estas columnas:

- Fecha.
- Número de historia clínico.
- TAR antiguo.
- TAR nuevo.
- Motivo.

La plantilla indica que no debe subirse a GitHub ni compartirse con datos reales.

## Despliegue en GitHub Pages

1. Publique el repositorio en GitHub.
2. Active GitHub Pages desde la rama principal y la raíz del repositorio.
3. Acceda a la URL pública del proyecto.

No se necesita compilar ni instalar dependencias. Los archivos principales son:

- `index.html`.
- `styles.css`.
- `app.js`.
- `storage.js`.
- `crypto.js`.
- `import_export.js`.
- `reports.js`.
- `charts.js`.

## Limitaciones

- La persistencia local depende del navegador y de la configuración del equipo.
- La normalización de motivos utiliza reglas heurísticas.
- Las librerías Chart.js, Plotly.js y SheetJS se cargan desde CDN para mantener el repositorio como aplicación estática simple.
- La herramienta no reemplaza procedimientos institucionales de protección de datos, revisión clínica ni sistemas corporativos.

## Autoría

Herramienta desarrollada por Ramón Morillo para el registro y análisis local en navegador de cambios de tratamiento antirretroviral.

**2026 · cambiosTAR**
