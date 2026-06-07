# cambiosTAR

**Registro y análisis local de cambios de tratamiento antirretroviral.**

cambiosTAR es una herramienta local para transformar un Excel histórico de cambios de TAR en un sistema de análisis longitudinal, seudonimizado y orientado a uso profesional. La aplicación operativa se ejecuta en el ordenador del usuario mediante **Streamlit**.

> [!IMPORTANT]
> La página de GitHub Pages es únicamente una landing pública/documentación. No procesa datos clínicos, no permite cargar información real y no debe usarse como aplicación operativa. Los datos reales nunca deben subirse a GitHub, al repositorio ni a una web pública.

## Qué problema resuelve

En muchos entornos clínicos, los cambios de tratamiento antirretroviral quedan registrados en hojas históricas con texto libre y estructura mínima. cambiosTAR permite:

- Validar que el Excel contiene las columnas mínimas necesarias.
- Limpiar campos básicos sin añadir variables clínicas manuales nuevas.
- Seudonimizar el número de historia clínica en local.
- Normalizar motivos de cambio en cinco bloques.
- Analizar tendencias temporales, motivos, transiciones TAR y trayectorias longitudinales.
- Exportar resultados seudonimizados cuando el usuario lo decida.

## Landing pública vs app local

| Componente | Finalidad | Datos reales |
| --- | --- | --- |
| `index.html` + `style.css` | Landing/documentación para GitHub Pages | No admite ni procesa datos |
| `app.py` | Aplicación Streamlit ejecutada en local | Solo en el equipo del usuario |

La landing pública no contiene formularios de carga ni lógica para procesar datos clínicos. La app real se lanza con `streamlit run app.py`.

## Columnas requeridas

La aplicación utiliza únicamente estas cinco columnas del Excel histórico:

1. `Marca temporal`
2. `Número de historia clínico`
3. `TAR antiguo`
4. `TAR nuevo`
5. `Motivo`

No se añaden variables clínicas manuales nuevas. Solo se generan variables derivadas internas:

- `fecha`
- `año`
- `mes`
- `transición TAR`
- `ID seudonimizado`
- `motivo_normalizado`
- `motivo_original`

## Motivos normalizados

El campo `Motivo` se conserva como `motivo_original` y se clasifica de forma conservadora en cinco bloques:

- Optimización
- Efecto adverso
- Interacción
- Fracaso virológico
- Otro

## Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/<usuario>/cambiosTAR.git
cd cambiosTAR
```

### 2. Crear y activar entorno virtual

Linux/macOS:

```bash
python -m venv .venv
source .venv/bin/activate
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Configurar clave local

```bash
cp .env.example .env
```

En Windows:

```powershell
copy .env.example .env
```

Edita `.env` y sustituye `PSEUDONYM_SECRET_KEY` por una clave larga, privada y local. Si la clave falta o sigue siendo la de ejemplo, la aplicación no procesará datos.

### 5. Ejecutar la app local

```bash
streamlit run app.py
```

## Uso con datos ficticios

Puedes probar el flujo completo sin datos reales de dos formas:

- Desde la barra lateral de la app, descarga el Excel ficticio de prueba generado en memoria.
- Genera localmente `data/example_ficticio.xlsx` con el script de ejemplo. El archivo no se versiona porque los binarios Excel están ignorados por Git.

Para generar localmente un ejemplo ficticio:

```bash
python scripts/generar_datos_ejemplo.py
```

## Uso operativo

1. Ejecuta la app con `streamlit run app.py`.
2. Comprueba que existe `.env` con una clave privada válida.
3. Carga un Excel local con las cinco columnas obligatorias.
4. Revisa los avisos de validación y limpieza.
5. Explora el dashboard, análisis temporal, motivos, transiciones, Sankey y trayectoria longitudinal.
6. Exporta el Excel seudonimizado solo si es necesario.

## Análisis incluidos

- Dashboard general.
- Evolución anual y mensual.
- Distribución de motivos.
- Comparación entre motivos originales y normalizados.
- Top de TAR antiguos y TAR nuevos.
- Transiciones TAR antiguo → TAR nuevo.
- Sankey de cambios.
- Trayectoria longitudinal por paciente seudonimizado.
- Exportación seudonimizada.

## Exportación de resultados

La exportación se realiza voluntariamente desde la app y excluye siempre el número de historia clínica original. El archivo exportado contiene columnas seudonimizadas y derivadas autorizadas para análisis.

Añade cualquier carpeta de exportación sensible a `.gitignore` y no subas esos resultados a GitHub.

## Protección de datos

- La aplicación está diseñada para ejecutarse localmente.
- No se suben datos a servidores externos desde la app.
- No se usan APIs externas para analizar datos clínicos.
- El número de historia clínica se transforma con SHA-256 y una clave local.
- La clave debe guardarse en `.env`.
- El archivo `.env` no debe subirse nunca a GitHub.
- Los datos reales, exportaciones sensibles y ficheros temporales deben permanecer fuera del repositorio.
- Los ejemplos incluidos o generados localmente deben ser siempre ficticios.
- Los archivos Excel, CSV y exportaciones no se versionan para evitar binarios o datos sensibles en pull requests.

## Estructura del repositorio

```text
index.html                  # Landing pública de GitHub Pages
style.css                   # Estilos de la landing
app.py                      # Aplicación Streamlit local
requirements.txt            # Dependencias Python
README.md                   # Documentación del proyecto
.env.example                # Plantilla de clave local, sin secretos reales
data/README.md              # Aviso sobre datos ficticios y reales
src/                        # Lógica de análisis, limpieza y seudonimización
scripts/                    # Utilidades locales
exports/                    # Salidas locales ignoradas por Git
```

## Limitaciones actuales

- La normalización de motivos se basa en reglas de texto conservadoras, no en un modelo clínico externo.
- La calidad de los análisis depende de la consistencia del Excel histórico.
- El Sankey requiere las dependencias declaradas en `requirements.txt`.
- No sustituye una revisión clínica ni un procedimiento institucional de protección de datos.

## Roadmap futuro

- Añadir tests automatizados de limpieza y clasificación.
- Incorporar perfiles configurables de normalización de motivos.
- Mejorar los informes exportables.
- Añadir documentación visual con capturas de la app local usando datos ficticios.
- Revisar accesibilidad y experiencia móvil de la landing.

## Autoría

Herramienta desarrollada por Ramón Morillo para el análisis local de cambios de tratamiento antirretroviral.

**2026 · cambiosTAR**
