from __future__ import annotations

from datetime import datetime
from io import BytesIO

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.analisis import (
    auditoria_motivos,
    cambios_por_año,
    cambios_por_mes,
    distribucion_motivo,
    evolucion_mensual_acumulada,
    motivos_por_año,
    ranking_tar_antiguo,
    ranking_tar_nuevo,
    ranking_transiciones,
    resumen_general,
    trayectoria_paciente,
    transiciones_por_año,
    transiciones_por_motivo,
)
from src.datos_ejemplo import NOMBRE_EXCEL_EJEMPLO, excel_ejemplo_en_memoria
from src.limpieza import BLOQUES_MOTIVO, COLUMNAS_REQUERIDAS, limpiar_excel, preparar_exportacion
from src.pseudonimizacion import cargar_clave_secreta

st.set_page_config(page_title="cambiosTAR", page_icon="💊", layout="wide", initial_sidebar_state="expanded")

st.markdown(
    """
    <style>
    .main {background: #f7f9fc;}
    .block-container {padding-top: 2rem; max-width: 1280px;}
    .privacy-box {
        background: linear-gradient(90deg, #0f766e, #0e7490);
        color: white;
        padding: 1rem 1.25rem;
        border-radius: 0.9rem;
        font-weight: 600;
        box-shadow: 0 6px 18px rgba(15, 118, 110, 0.20);
        margin-bottom: 1rem;
    }
    .soft-box {
        border: 1px solid #d9e2ec;
        background: #ffffff;
        border-radius: 0.9rem;
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
    }
    .footer {
        text-align: center;
        margin-top: 2.5rem;
        padding-top: 1.25rem;
        border-top: 1px solid #d9e2ec;
        color: #52616b;
        font-size: 0.95rem;
    }
    [data-testid="stMetricValue"] {font-size: 1.8rem; color: #0f172a;}
    </style>
    """,
    unsafe_allow_html=True,
)


def cargar_datos(uploaded_file) -> pd.DataFrame:
    clave = cargar_clave_secreta()
    df_bruto = pd.read_excel(uploaded_file)
    return limpiar_excel(df_bruto, clave)


def grafico_sankey(df: pd.DataFrame, limite: int = 15) -> go.Figure:
    flujos = ranking_transiciones(df, limite=limite)
    if flujos.empty:
        return go.Figure().add_annotation(text="No hay transiciones disponibles", showarrow=False)
    nodos = sorted(set(flujos["TAR antiguo"]).union(set(flujos["TAR nuevo"])))
    indice = {nombre: posicion for posicion, nombre in enumerate(nodos)}
    figura = go.Figure(
        data=[
            go.Sankey(
                node={"pad": 18, "thickness": 18, "line": {"color": "#94a3b8", "width": 0.5}, "label": nodos},
                link={
                    "source": flujos["TAR antiguo"].map(indice),
                    "target": flujos["TAR nuevo"].map(indice),
                    "value": flujos["cambios"],
                    "color": "rgba(14, 116, 144, 0.25)",
                },
            )
        ]
    )
    figura.update_layout(title="Flujos principales TAR antiguo → TAR nuevo", font_size=12)
    return figura


def formato_rango_temporal(df: pd.DataFrame) -> str:
    fechas = pd.to_datetime(df["fecha"], errors="coerce").dropna()
    if fechas.empty:
        return "Sin fechas válidas"
    return f"{fechas.min().date()} — {fechas.max().date()}"


def tarjeta_privacidad() -> None:
    st.markdown(
        '<div class="privacy-box">Esta herramienta funciona en local. No subas datos reales a GitHub. '
        'El número de historia clínica se seudonimiza con SHA-256 y no se muestra ni se exporta.</div>',
        unsafe_allow_html=True,
    )


st.title("cambiosTAR")
st.subheader("Registro y análisis local de cambios de tratamiento antirretroviral")
tarjeta_privacidad()

with st.sidebar:
    st.header("Carga y privacidad")
    archivo = st.file_uploader("Cargar Excel histórico", type=["xlsx", "xls"])
    st.download_button(
        "Descargar Excel ficticio de prueba",
        excel_ejemplo_en_memoria(),
        file_name=NOMBRE_EXCEL_EJEMPLO,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    st.divider()
    st.caption("Columnas obligatorias")
    for columna in COLUMNAS_REQUERIDAS:
        st.write(f"• {columna}")
    limite_transiciones = st.slider("Transiciones principales en Sankey", 5, 20, 15)

if archivo is None:
    col_a, col_b = st.columns([1.2, 1])
    with col_a:
        st.markdown('<div class="soft-box">', unsafe_allow_html=True)
        st.markdown("### Cómo empezar")
        st.write("1. Crea un archivo `.env` local con `PSEUDONYM_SECRET_KEY`.")
        st.write("2. Carga un Excel histórico con las 5 columnas obligatorias.")
        st.write("3. Revisa los análisis y exporta únicamente la base seudonimizada si la necesitas.")
        st.warning("Si no existe una clave local válida, la app detiene el procesamiento para evitar trabajar con datos reales sin seudonimización.")
        st.markdown("</div>", unsafe_allow_html=True)
    with col_b:
        st.markdown("### Variables derivadas automáticas")
        st.write("año · mes · fecha normalizada · transición TAR · ID seudonimizado · motivo normalizado · motivo_original")
    st.info("Puedes descargar el Excel ficticio desde el panel lateral para probar el flujo completo sin datos reales.")
else:
    try:
        datos = cargar_datos(archivo)
    except RuntimeError as exc:
        st.error(str(exc))
        st.error("Debe configurar PSEUDONYM_SECRET_KEY en el archivo .env antes de procesar datos reales.")
        st.stop()
    except Exception as exc:  # noqa: BLE001
        st.error(str(exc))
        st.stop()

    st.success("Excel cargado y seudonimizado correctamente. La columna original de historia clínica no está disponible en la app.")
    for aviso in datos.attrs.get("avisos", []):
        st.warning(aviso)

    st.header("Panel de carga y validación")
    v1, v2, v3, v4 = st.columns(4)
    v1.metric("Registros cargados", len(datos))
    v2.metric("Rango temporal", formato_rango_temporal(datos))
    v3.metric("Pacientes seudonimizados", datos["ID seudonimizado"].nunique())
    v4.metric("Cambios registrados", len(datos))

    resumen = resumen_general(datos)
    st.header("Dashboard general")
    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Total cambios", resumen["cambios"])
    c2.metric("Pacientes", resumen["pacientes"])
    c3.metric("Año pico", resumen["año_mas_cambios"])
    c4.metric("Motivo frecuente", resumen["motivo_frecuente"])
    c5.metric("TAR nuevo frecuente", resumen["tar_nuevo_frecuente"])
    c6.metric("Transición frecuente", resumen["transicion_frecuente"])

    tab_temporal, tab_motivo, tab_transiciones, tab_trayectoria, tab_export = st.tabs(
        ["Análisis temporal", "Análisis por motivo", "Transiciones TAR", "Trayectoria longitudinal", "Exportación"]
    )

    with tab_temporal:
        datos_año = cambios_por_año(datos)
        datos_mes = cambios_por_mes(datos)
        acumulada = evolucion_mensual_acumulada(datos)
        col_t1, col_t2 = st.columns(2)
        col_t1.plotly_chart(px.bar(datos_año, x="año", y="cambios", text="cambios", title="Cambios por año"), use_container_width=True)
        col_t2.plotly_chart(px.line(datos_mes, x="mes", y="cambios", markers=True, title="Cambios por mes"), use_container_width=True)
        st.plotly_chart(px.area(acumulada, x="mes", y="acumulado", title="Evolución mensual acumulada"), use_container_width=True)
        st.plotly_chart(
            px.bar(motivos_por_año(datos), x="año", y="cambios", color="motivo_normalizado", title="Distribución anual por motivo"),
            use_container_width=True,
        )
        col_top1, col_top2 = st.columns(2)
        col_top1.plotly_chart(
            px.bar(ranking_tar_antiguo(datos), x="cambios", y="TAR antiguo", orientation="h", title="Top TAR antiguos"),
            use_container_width=True,
        )
        col_top2.plotly_chart(
            px.bar(ranking_tar_nuevo(datos), x="cambios", y="TAR nuevo", orientation="h", title="Top TAR nuevos"),
            use_container_width=True,
        )

    with tab_motivo:
        motivos = distribucion_motivo(datos)
        motivos["motivo_normalizado"] = pd.Categorical(motivos["motivo_normalizado"], categories=BLOQUES_MOTIVO, ordered=True)
        motivos = motivos.sort_values("motivo_normalizado")
        col_m1, col_m2 = st.columns(2)
        col_m1.plotly_chart(px.pie(motivos, names="motivo_normalizado", values="cambios", title="Distribución global por motivo"), use_container_width=True)
        col_m2.plotly_chart(px.bar(motivos_por_año(datos), x="año", y="cambios", color="motivo_normalizado", title="Evolución de motivos por año"), use_container_width=True)
        st.subheader("Auditoría de motivos originales reclasificados")
        st.dataframe(auditoria_motivos(datos), use_container_width=True, hide_index=True)

    with tab_transiciones:
        ranking = ranking_transiciones(datos, limite=50)
        st.subheader("Ranking de transiciones más frecuentes")
        st.dataframe(ranking, use_container_width=True, hide_index=True)
        st.plotly_chart(
            px.bar(ranking.head(15), x="cambios", y="transición TAR", orientation="h", title="Top transiciones TAR"),
            use_container_width=True,
        )
        col_tr1, col_tr2 = st.columns(2)
        col_tr1.plotly_chart(px.bar(transiciones_por_año(datos), x="año", y="cambios", color="transición TAR", title="Transiciones por año"), use_container_width=True)
        col_tr2.plotly_chart(
            px.bar(transiciones_por_motivo(datos), x="motivo_normalizado", y="cambios", color="transición TAR", title="Transiciones por motivo"),
            use_container_width=True,
        )
        st.plotly_chart(grafico_sankey(datos, limite_transiciones), use_container_width=True)
        st.subheader("Tabla filtrable de transiciones")
        texto = st.text_input("Filtrar por TAR o transición", "")
        tabla = datos[["fecha", "año", "mes", "ID seudonimizado", "TAR antiguo", "TAR nuevo", "transición TAR", "motivo_normalizado"]]
        if texto:
            patron = texto.lower()
            tabla = tabla[tabla.apply(lambda fila: patron in " ".join(fila.astype(str)).lower(), axis=1)]
        st.dataframe(tabla, use_container_width=True, hide_index=True)

    with tab_trayectoria:
        ids = sorted(datos["ID seudonimizado"].unique())
        seleccionado = st.selectbox("ID seudonimizado", ids)
        trayectoria = trayectoria_paciente(datos, seleccionado)
        st.dataframe(trayectoria, use_container_width=True, hide_index=True)
        st.plotly_chart(
            px.scatter(
                trayectoria,
                x="fecha",
                y="transición TAR",
                color="motivo_normalizado",
                hover_data=["TAR antiguo", "TAR nuevo", "motivo_original"],
                title="Secuencia temporal de cambios del paciente seudonimizado",
            ),
            use_container_width=True,
        )

    with tab_export:
        exportable = preparar_exportacion(datos)
        st.write("Descarga un Excel seudonimizado. Se excluye siempre el número de historia clínica original.")
        buffer = BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            exportable.to_excel(writer, index=False, sheet_name="cambios_seudonimizados")
        nombre = f"cambiosTAR_seudonimizado_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        st.download_button(
            "Exportar Excel seudonimizado",
            buffer.getvalue(),
            file_name=nombre,
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        st.dataframe(exportable, use_container_width=True, hide_index=True)

st.markdown(
    '<div class="footer">cambiosTAR · Herramienta local de análisis de cambios de TAR · Ramón Morillo · 2026</div>',
    unsafe_allow_html=True,
)
