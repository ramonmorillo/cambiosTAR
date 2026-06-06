from __future__ import annotations

from datetime import datetime
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.datos_ejemplo import NOMBRE_EXCEL_EJEMPLO, excel_ejemplo_en_memoria
from src.analisis import (
    cambios_por_anio,
    cambios_por_mes,
    distribucion_motivo,
    motivos_por_anio,
    ranking_transiciones,
    resumen_general,
    trayectoria_paciente,
)
from src.limpieza import BLOQUES_MOTIVO, limpiar_excel
from src.pseudonimizacion import cargar_clave_secreta

st.set_page_config(
    page_title="cambiosTAR",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    .main {background: #f7f9fc;}
    .block-container {padding-top: 2rem;}
    .privacy-box {
        background: linear-gradient(90deg, #0f766e, #0e7490);
        color: white;
        padding: 1rem 1.25rem;
        border-radius: 0.9rem;
        font-weight: 600;
        box-shadow: 0 6px 18px rgba(15, 118, 110, 0.20);
    }
    .footer {
        text-align: center;
        margin-top: 2.5rem;
        padding-top: 1.25rem;
        border-top: 1px solid #d9e2ec;
        color: #52616b;
        font-size: 0.95rem;
    }
    [data-testid="stMetricValue"] {font-size: 2rem; color: #0f172a;}
    </style>
    """,
    unsafe_allow_html=True,
)


def cargar_datos(uploaded_file) -> pd.DataFrame:
    clave = cargar_clave_secreta()
    df_bruto = pd.read_excel(uploaded_file)
    return limpiar_excel(df_bruto, clave)


def grafico_sankey(df: pd.DataFrame, limite: int = 12) -> go.Figure:
    flujos = ranking_transiciones(df, limite=limite)
    if flujos.empty:
        return go.Figure().add_annotation(text="No hay transiciones disponibles", showarrow=False)
    nodos = sorted(set(flujos["tar_antiguo"]).union(set(flujos["tar_nuevo"])))
    indice = {nombre: posicion for posicion, nombre in enumerate(nodos)}
    return go.Figure(
        data=[
            go.Sankey(
                node={"pad": 18, "thickness": 18, "line": {"color": "#94a3b8", "width": 0.5}, "label": nodos},
                link={
                    "source": flujos["tar_antiguo"].map(indice),
                    "target": flujos["tar_nuevo"].map(indice),
                    "value": flujos["cambios"],
                    "color": "rgba(14, 116, 144, 0.25)",
                },
            )
        ]
    )


st.title("cambiosTAR")
st.subheader("Herramienta local para analizar cambios de tratamiento antirretroviral")
st.markdown(
    '<div class="privacy-box">La herramienta funciona en local. El número de historia se transforma en un ID seudonimizado. No subas datos reales a GitHub.</div>',
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("Carga del Excel histórico")
    st.caption("Columnas esperadas: Marca temporal, Número de historia clínico, TAR antiguo, TAR nuevo y Motivo.")
    archivo = st.file_uploader("Selecciona un archivo Excel", type=["xlsx", "xls"])
    st.divider()
    limite_transiciones = st.slider("Flujos principales en Sankey", 5, 30, 12)

if archivo is None:
    st.info("Carga un Excel histórico para comenzar. Puedes descargar un Excel ficticio de prueba desde esta pantalla.")
    st.download_button(
        "Descargar Excel ficticio de prueba",
        excel_ejemplo_en_memoria(),
        file_name=NOMBRE_EXCEL_EJEMPLO,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
else:
    try:
        datos = cargar_datos(archivo)
    except Exception as exc:  # noqa: BLE001
        st.error(str(exc))
        st.stop()

    resumen = resumen_general(datos)
    st.header("Dashboard general")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Cambios registrados", resumen["cambios"])
    col2.metric("Pacientes seudonimizados", resumen["pacientes"])
    col3.metric("TAR antiguos", resumen["tar_antiguos"])
    col4.metric("TAR nuevos", resumen["tar_nuevos"])

    tab_anio, tab_mes, tab_motivo, tab_transiciones, tab_trayectoria, tab_export = st.tabs(
        [
            "Cambios por año",
            "Cambios por mes",
            "Motivos",
            "Transiciones TAR",
            "Trayectoria longitudinal",
            "Exportación",
        ]
    )

    with tab_anio:
        datos_anio = cambios_por_anio(datos)
        st.plotly_chart(px.bar(datos_anio, x="anio", y="cambios", text="cambios", title="Cambios por año"), use_container_width=True)
        st.dataframe(datos_anio, use_container_width=True)

    with tab_mes:
        datos_mes = cambios_por_mes(datos)
        st.plotly_chart(px.line(datos_mes, x="mes", y="cambios", markers=True, title="Cambios por mes"), use_container_width=True)
        st.dataframe(datos_mes, use_container_width=True)

    with tab_motivo:
        col_m1, col_m2 = st.columns(2)
        motivos = distribucion_motivo(datos)
        motivos["motivo_bloque"] = pd.Categorical(motivos["motivo_bloque"], categories=BLOQUES_MOTIVO, ordered=True)
        motivos = motivos.sort_values("motivo_bloque")
        col_m1.plotly_chart(px.pie(motivos, names="motivo_bloque", values="cambios", title="Distribución por motivo"), use_container_width=True)
        col_m2.plotly_chart(px.bar(motivos_por_anio(datos), x="anio", y="cambios", color="motivo_bloque", title="Motivos por año"), use_container_width=True)
        st.dataframe(motivos, use_container_width=True)
        st.caption("El texto libre original se conserva como motivo_original para auditar la clasificación conservadora.")

    with tab_transiciones:
        ranking = ranking_transiciones(datos, limite=50)
        st.subheader("Ranking de transiciones más frecuentes")
        st.dataframe(ranking, use_container_width=True)
        st.subheader("Gráfico Sankey de los principales flujos de cambio")
        st.plotly_chart(grafico_sankey(datos, limite_transiciones), use_container_width=True)

    with tab_trayectoria:
        ids = sorted(datos["id_paciente"].unique())
        seleccionado = st.selectbox("ID seudonimizado", ids)
        trayectoria = trayectoria_paciente(datos, seleccionado)
        st.dataframe(trayectoria, use_container_width=True)
        st.plotly_chart(
            px.scatter(
                trayectoria,
                x="marca_temporal",
                y="transicion",
                color="motivo_bloque",
                hover_data=["motivo_original"],
                title="Trayectoria longitudinal por paciente seudonimizado",
            ),
            use_container_width=True,
        )

    with tab_export:
        st.write("Descarga un CSV seudonimizado. No contiene el número de historia clínica.")
        csv = datos.to_csv(index=False).encode("utf-8")
        nombre = f"cambiosTAR_seudonimizado_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
        st.download_button("Exportar CSV seudonimizado", csv, file_name=nombre, mime="text/csv")
        st.dataframe(datos, use_container_width=True)

st.markdown(
    '<div class="footer">cambiosTAR · Herramienta local de análisis de cambios de TAR · Ramón Morillo</div>',
    unsafe_allow_html=True,
)
