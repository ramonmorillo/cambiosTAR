from __future__ import annotations

from datetime import date

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from database import dashboard_metrics, delete_record, init_db, insert_record, insert_records, load_records, update_record
from reports import comentario_automatico, filter_period, report_to_excel, report_to_html
from utils import (
    DB_PATH,
    EXPORT_COLUMNS,
    INPUT_COLUMNS,
    MOTIVO_CATEGORIAS,
    cargar_clave_secreta,
    dataframe_desde_excel_mapeado,
    dataframe_to_excel_bytes,
    detectar_mapeo_columnas,
    normalizar_motivo,
    preparar_registro,
    validar_dataframe_importacion,
)

st.set_page_config(page_title="cambiosTAR local", page_icon="💊", layout="wide")

st.markdown(
    """
    <style>
    .block-container {max-width: 1320px; padding-top: 1.4rem;}
    .privacy-box {background: linear-gradient(90deg,#0f766e,#0e7490); color: white; padding: 1rem 1.2rem; border-radius: .85rem; font-weight: 600; margin-bottom: 1rem;}
    .soft-box {border: 1px solid #d9e2ec; background: #fff; border-radius: .85rem; padding: 1rem 1.2rem; margin-bottom: 1rem;}
    [data-testid="stMetricValue"] {font-size: 1.6rem;}
    </style>
    """,
    unsafe_allow_html=True,
)

init_db()


def aviso_privacidad() -> None:
    st.markdown(
        "<div class='privacy-box'>Aplicación local: GitHub Pages solo documenta el proyecto. "
        "El número de historia clínica se seudonimiza con SHA-256 + SECRET_KEY antes de guardarse. "
        "La app no envía datos a internet y no guarda identificadores en claro.</div>",
        unsafe_allow_html=True,
    )


@st.cache_data(show_spinner=False)
def excel_bytes(df: pd.DataFrame, sheet: str = "cambiosTAR") -> bytes:
    return dataframe_to_excel_bytes(df, sheet)


def require_secret() -> str | None:
    try:
        return cargar_clave_secreta()
    except RuntimeError as exc:
        st.error(str(exc))
        st.warning("Cree un archivo `.env` desde `.env.example` y configure `SECRET_KEY` antes de procesar datos reales.")
        return None


def data_actual() -> pd.DataFrame:
    return load_records()


def empty_state(df: pd.DataFrame) -> bool:
    if df.empty:
        st.info("Todavía no hay registros en la base local. Importe el histórico o registre un nuevo cambio para empezar.")
        return True
    return False


def fig_empty(texto: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(text=texto, showarrow=False)
    fig.update_layout(height=320)
    return fig


def filtrar_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    trabajo = df.copy()
    trabajo["fecha"] = pd.to_datetime(trabajo["fecha"], errors="coerce")
    with st.expander("Filtros", expanded=True):
        c1, c2, c3 = st.columns(3)
        min_fecha = trabajo["fecha"].min().date()
        max_fecha = trabajo["fecha"].max().date()
        rango = c1.date_input("Rango de fechas", value=(min_fecha, max_fecha), min_value=min_fecha, max_value=max_fecha)
        anios = sorted([int(x) for x in trabajo["anio"].dropna().unique()])
        anio = c2.multiselect("Año", anios, default=[])
        motivo = c3.multiselect("Motivo normalizado", MOTIVO_CATEGORIAS, default=[])
        c4, c5, c6 = st.columns(3)
        tar_antiguo = c4.multiselect("TAR antiguo", sorted(trabajo["tar_antiguo"].dropna().unique()), default=[])
        tar_nuevo = c5.multiselect("TAR nuevo", sorted(trabajo["tar_nuevo"].dropna().unique()), default=[])
        origen = c6.multiselect("Origen", ["historico", "registro_manual"], default=[])
        paciente = st.text_input("Paciente seudonimizado contiene")

    if isinstance(rango, tuple) and len(rango) == 2:
        trabajo = trabajo[(trabajo["fecha"].dt.date >= rango[0]) & (trabajo["fecha"].dt.date <= rango[1])]
    if anio:
        trabajo = trabajo[trabajo["anio"].isin(anio)]
    if motivo:
        trabajo = trabajo[trabajo["motivo_normalizado"].isin(motivo)]
    if tar_antiguo:
        trabajo = trabajo[trabajo["tar_antiguo"].isin(tar_antiguo)]
    if tar_nuevo:
        trabajo = trabajo[trabajo["tar_nuevo"].isin(tar_nuevo)]
    if origen:
        trabajo = trabajo[trabajo["origen"].isin(origen)]
    if paciente:
        trabajo = trabajo[trabajo["paciente_id"].str.contains(paciente, case=False, na=False)]
    return trabajo


def dashboard() -> None:
    st.header("Inicio / Dashboard")
    metrics = dashboard_metrics()
    filas = [
        ("Total cambios", metrics["total_cambios"]),
        ("Pacientes seudonimizados", metrics["total_pacientes"]),
        ("Cambios año actual", metrics["cambios_anio_actual"]),
        ("Cambios mes actual", metrics["cambios_mes_actual"]),
    ]
    cols = st.columns(4)
    for col, (label, value) in zip(cols, filas):
        col.metric(label, value)
    cols = st.columns(4)
    cols[0].metric("Motivo más frecuente", metrics["motivo_frecuente"])
    cols[1].metric("TAR nuevo más frecuente", metrics["tar_nuevo_frecuente"])
    cols[2].metric("Transición más frecuente", metrics["transicion_frecuente"])
    cols[3].metric("Última fecha registrada", metrics["ultima_fecha"])

    df = data_actual()
    if empty_state(df):
        return
    c1, c2 = st.columns(2)
    anual = df.groupby("anio", as_index=False).size().rename(columns={"size": "cambios"})
    motivos = df.groupby("motivo_normalizado", as_index=False).size().rename(columns={"size": "cambios"})
    c1.plotly_chart(px.bar(anual, x="anio", y="cambios", title="Cambios por año"), use_container_width=True)
    c2.plotly_chart(px.pie(motivos, names="motivo_normalizado", values="cambios", title="Distribución de motivos"), use_container_width=True)


def nuevo_cambio() -> None:
    st.header("Nuevo cambio")
    clave = require_secret()
    if not clave:
        st.stop()
    with st.form("form_nuevo_cambio", clear_on_submit=True):
        c1, c2 = st.columns(2)
        fecha = c1.date_input("Fecha del cambio", value=date.today())
        historia = c2.text_input("Número de historia clínico", type="password", help="Solo se usa para crear el hash; no se guarda en claro.")
        tar_antiguo = st.text_input("TAR antiguo")
        tar_nuevo = st.text_input("TAR nuevo")
        motivo = st.text_area("Motivo")
        guardar = st.form_submit_button("Guardar cambio", type="primary")
    if guardar:
        try:
            record = preparar_registro(fecha, historia, tar_antiguo, tar_nuevo, motivo, "registro_manual", clave)
            inserted = insert_record(record)
        except Exception as exc:  # noqa: BLE001
            st.error(str(exc))
        else:
            if inserted:
                st.success("Cambio guardado en SQLite con paciente seudonimizado.")
            else:
                st.warning("No se insertó porque ya existe un duplicado exacto.")


def importar_historico() -> None:
    st.header("Importar histórico")
    clave = require_secret()
    if not clave:
        st.stop()
    archivo = st.file_uploader("Seleccione Excel histórico", type=["xlsx", "xls"])
    if archivo is None:
        st.info("El Excel se importa una vez para crear o ampliar la base acumulada local.")
        return
    df_raw = pd.read_excel(archivo)
    st.subheader("Mapeo de columnas")
    sugerido = detectar_mapeo_columnas(df_raw.columns)
    opciones = [""] + [str(c) for c in df_raw.columns]
    mapeo: dict[str, str] = {}
    cols = st.columns(2)
    for i, (campo, etiqueta) in enumerate(INPUT_COLUMNS.items()):
        valor = sugerido.get(campo) or ""
        index = opciones.index(valor) if valor in opciones else 0
        elegido = cols[i % 2].selectbox(etiqueta, opciones, index=index, key=f"map_{campo}")
        if elegido:
            mapeo[campo] = elegido
    if len(mapeo) < len(INPUT_COLUMNS):
        st.warning("Mapee todos los campos obligatorios para validar la importación.")
        return

    try:
        df_mapeado = dataframe_desde_excel_mapeado(df_raw, mapeo)
        validos, errores = validar_dataframe_importacion(df_mapeado, clave)
    except Exception as exc:  # noqa: BLE001
        st.error(str(exc))
        return

    duplicados_excel = int(validos.duplicated(subset=["paciente_id", "fecha", "tar_antiguo", "tar_nuevo", "motivo_original"]).sum()) if not validos.empty else 0
    st.subheader("Previsualización y validación")
    c1, c2, c3 = st.columns(3)
    c1.metric("Registros detectados", len(df_raw))
    c2.metric("Registros con errores", len(errores))
    c3.metric("Posibles duplicados en Excel", duplicados_excel)
    st.dataframe(validos.head(25), use_container_width=True)
    if not errores.empty:
        st.warning("Revise los registros con errores; no se importarán.")
        st.dataframe(errores, use_container_width=True)
    if st.button("Importar registros válidos", type="primary", disabled=validos.empty):
        dedup = validos.drop_duplicates(subset=["paciente_id", "fecha", "tar_antiguo", "tar_nuevo", "motivo_original"])
        insertados, duplicados_db = insert_records(dedup.to_dict(orient="records"))
        st.success(f"Importación finalizada: {insertados} registros insertados.")
        if duplicados_db or duplicados_excel:
            st.info(f"Duplicados omitidos: {duplicados_db + duplicados_excel}.")


def explorar_registros() -> None:
    st.header("Explorar registros")
    df = data_actual()
    if empty_state(df):
        return
    filtrado = filtrar_df(df)
    st.metric("Registros filtrados", len(filtrado))
    st.dataframe(filtrado, use_container_width=True, hide_index=True)
    st.download_button("Descargar tabla filtrada en Excel", excel_bytes(filtrado[EXPORT_COLUMNS], "filtrado"), "cambiosTAR_filtrado.xlsx")

    st.subheader("Editar registro")
    ids = filtrado["id"].tolist()
    if ids:
        seleccionado = st.selectbox("ID a editar", ids)
        fila = filtrado[filtrado["id"] == seleccionado].iloc[0]
        with st.form("editar"):
            fecha = st.date_input("Fecha", value=pd.to_datetime(fila["fecha"]).date())
            tar_antiguo = st.text_input("TAR antiguo", value=fila["tar_antiguo"])
            tar_nuevo = st.text_input("TAR nuevo", value=fila["tar_nuevo"])
            motivo = st.text_area("Motivo original", value=fila["motivo_original"])
            origen = st.selectbox("Origen", ["historico", "registro_manual"], index=["historico", "registro_manual"].index(fila["origen"]))
            guardar = st.form_submit_button("Guardar edición")
        if guardar:
            fecha_ts = pd.to_datetime(fecha)
            update_record(
                int(seleccionado),
                {
                    "fecha": fecha_ts.date().isoformat(),
                    "anio": int(fecha_ts.year),
                    "mes": int(fecha_ts.month),
                    "tar_antiguo": tar_antiguo,
                    "tar_nuevo": tar_nuevo,
                    "transicion_tar": f"{tar_antiguo} → {tar_nuevo}",
                    "motivo_original": motivo,
                    "motivo_normalizado": normalizar_motivo(motivo),
                    "origen": origen,
                },
            )
            st.success("Registro actualizado.")
            st.rerun()

        st.subheader("Eliminar registro")
        confirmar = st.checkbox(f"Confirmo eliminar el registro ID {seleccionado}")
        if st.button("Eliminar registro seleccionado", disabled=not confirmar):
            delete_record(int(seleccionado))
            st.success("Registro eliminado.")
            st.rerun()


def analisis_temporal() -> None:
    st.header("Análisis temporal")
    df = data_actual()
    if empty_state(df):
        return
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    anual = df.groupby("anio", as_index=False).size().rename(columns={"size": "cambios"})
    mensual = df.groupby(["anio", "mes"], as_index=False).size().rename(columns={"size": "cambios"})
    mensual["periodo"] = mensual["anio"].astype(str) + "-" + mensual["mes"].astype(str).str.zfill(2)
    mensual = mensual.sort_values(["anio", "mes"])
    mensual["acumulado"] = mensual["cambios"].cumsum()
    motivo_anio = df.groupby(["anio", "motivo_normalizado"], as_index=False).size().rename(columns={"size": "cambios"})
    motivo_mes = df.groupby(["periodo", "motivo_normalizado"], as_index=False).size().rename(columns={"size": "cambios"}) if "periodo" in df else pd.DataFrame()
    df["periodo"] = df["fecha"].dt.to_period("M").astype(str)
    motivo_mes = df.groupby(["periodo", "motivo_normalizado"], as_index=False).size().rename(columns={"size": "cambios"})
    st.plotly_chart(px.bar(anual, x="anio", y="cambios", title="Cambios por año"), use_container_width=True)
    st.plotly_chart(px.line(mensual, x="periodo", y="cambios", markers=True, title="Cambios por mes"), use_container_width=True)
    st.plotly_chart(px.line(mensual, x="periodo", y="acumulado", markers=True, title="Evolución acumulada"), use_container_width=True)
    st.plotly_chart(px.bar(motivo_anio, x="anio", y="cambios", color="motivo_normalizado", title="Cambios por motivo y año"), use_container_width=True)
    st.plotly_chart(px.line(motivo_mes, x="periodo", y="cambios", color="motivo_normalizado", markers=True, title="Cambios por motivo y mes"), use_container_width=True)


def analisis_motivo() -> None:
    st.header("Análisis por motivo")
    df = data_actual()
    if empty_state(df):
        return
    df["periodo"] = pd.to_datetime(df["fecha"], errors="coerce").dt.to_period("M").astype(str)
    distribucion = df.groupby("motivo_normalizado", as_index=False).size().rename(columns={"size": "cambios"})
    evolucion = df.groupby(["periodo", "motivo_normalizado"], as_index=False).size().rename(columns={"size": "cambios"})
    comparacion = df.groupby(["motivo_original", "motivo_normalizado"], as_index=False).size().rename(columns={"size": "registros"})
    st.plotly_chart(px.pie(distribucion, names="motivo_normalizado", values="cambios", title="Distribución global de motivos"), use_container_width=True)
    st.plotly_chart(px.line(evolucion, x="periodo", y="cambios", color="motivo_normalizado", title="Evolución de cada motivo"), use_container_width=True)
    st.plotly_chart(px.bar(comparacion.head(40), x="motivo_original", y="registros", color="motivo_normalizado", title="Motivo original vs normalizado"), use_container_width=True)
    st.subheader("Tabla de auditoría de motivos originales reclasificados")
    st.dataframe(comparacion.sort_values("registros", ascending=False), use_container_width=True)


def transiciones_tar() -> None:
    st.header("Transiciones TAR")
    df = data_actual()
    if empty_state(df):
        return
    top = df.groupby("transicion_tar", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False)
    por_anio = df.groupby(["anio", "transicion_tar"], as_index=False).size().rename(columns={"size": "cambios"})
    por_motivo = df.groupby(["motivo_normalizado", "transicion_tar"], as_index=False).size().rename(columns={"size": "cambios"})
    antiguos = df.groupby("tar_antiguo", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False)
    nuevos = df.groupby("tar_nuevo", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False)
    st.plotly_chart(px.bar(top.head(20), x="cambios", y="transicion_tar", orientation="h", title="Top transiciones"), use_container_width=True)
    st.plotly_chart(px.bar(por_anio[por_anio["transicion_tar"].isin(top.head(10)["transicion_tar"])], x="anio", y="cambios", color="transicion_tar", title="Transiciones por año"), use_container_width=True)
    st.plotly_chart(px.bar(por_motivo[por_motivo["transicion_tar"].isin(top.head(10)["transicion_tar"])], x="motivo_normalizado", y="cambios", color="transicion_tar", title="Transiciones por motivo"), use_container_width=True)
    c1, c2 = st.columns(2)
    c1.plotly_chart(px.bar(antiguos.head(15), x="cambios", y="tar_antiguo", orientation="h", title="TAR antiguos más frecuentes"), use_container_width=True)
    c2.plotly_chart(px.bar(nuevos.head(15), x="cambios", y="tar_nuevo", orientation="h", title="TAR nuevos más frecuentes"), use_container_width=True)
    try:
        nodos = sorted(set(df["tar_antiguo"]).union(set(df["tar_nuevo"])))
        idx = {n: i for i, n in enumerate(nodos)}
        flujos = df.groupby(["tar_antiguo", "tar_nuevo"], as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False).head(25)
        fig = go.Figure(data=[go.Sankey(node={"label": nodos}, link={"source": flujos["tar_antiguo"].map(idx), "target": flujos["tar_nuevo"].map(idx), "value": flujos["cambios"]})])
        fig.update_layout(title="Sankey de transiciones TAR")
        st.plotly_chart(fig, use_container_width=True)
    except Exception:  # noqa: BLE001
        st.info("Sankey no disponible en este entorno; revise las tablas de transiciones.")
    st.dataframe(top, use_container_width=True)


def trayectoria_paciente() -> None:
    st.header("Trayectoria por paciente")
    df = data_actual()
    if empty_state(df):
        return
    paciente = st.selectbox("Paciente seudonimizado", sorted(df["paciente_id"].unique()))
    sub = df[df["paciente_id"] == paciente].sort_values("fecha")
    st.metric("Número de cambios", len(sub))
    st.dataframe(sub[["fecha", "tar_antiguo", "tar_nuevo", "transicion_tar", "motivo_original", "motivo_normalizado"]], use_container_width=True)
    sub_plot = sub.copy()
    sub_plot["orden"] = range(1, len(sub_plot) + 1)
    st.plotly_chart(px.scatter(sub_plot, x="fecha", y="orden", hover_data=["transicion_tar", "motivo_normalizado"], title="Línea temporal de cambios"), use_container_width=True)
    st.markdown("**Secuencia TAR**")
    st.write(" → ".join([str(sub.iloc[0]["tar_antiguo"])] + sub["tar_nuevo"].astype(str).tolist()) if not sub.empty else "—")
    st.download_button("Exportación individual seudonimizada", excel_bytes(sub[EXPORT_COLUMNS], "paciente"), f"cambiosTAR_paciente_{paciente[:8]}.xlsx")


def informes() -> None:
    st.header("Informes")
    df = data_actual()
    if empty_state(df):
        return
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    tipo = st.selectbox("Tipo de periodo", ["Mensual", "Trimestral", "Anual", "Rango personalizado"])
    min_fecha = df["fecha"].min().date()
    max_fecha = df["fecha"].max().date()
    if tipo == "Mensual":
        periodo = st.selectbox("Mes", sorted(df["fecha"].dt.to_period("M").astype(str).unique(), reverse=True))
        inicio = pd.Period(periodo).start_time
        fin = pd.Period(periodo).end_time
        etiqueta = periodo
    elif tipo == "Trimestral":
        periodos = sorted(df["fecha"].dt.to_period("Q").astype(str).unique(), reverse=True)
        periodo = st.selectbox("Trimestre", periodos)
        inicio = pd.Period(periodo, freq="Q").start_time
        fin = pd.Period(periodo, freq="Q").end_time
        etiqueta = periodo
    elif tipo == "Anual":
        anio = st.selectbox("Año", sorted(df["anio"].dropna().unique(), reverse=True))
        inicio = pd.Timestamp(int(anio), 1, 1)
        fin = pd.Timestamp(int(anio), 12, 31)
        etiqueta = str(anio)
    else:
        rango = st.date_input("Rango personalizado", value=(min_fecha, max_fecha), min_value=min_fecha, max_value=max_fecha)
        inicio, fin = rango if isinstance(rango, tuple) and len(rango) == 2 else (min_fecha, max_fecha)
        etiqueta = f"{inicio} a {fin}"
    sub = filter_period(df, inicio, fin)
    st.subheader(f"Informe: {etiqueta}")
    c1, c2 = st.columns(2)
    c1.metric("Cambios", len(sub))
    c2.metric("Pacientes", sub["paciente_id"].nunique() if not sub.empty else 0)
    st.write(comentario_automatico(sub))
    if not sub.empty:
        motivos = sub.groupby("motivo_normalizado", as_index=False).size().rename(columns={"size": "cambios"})
        trans = sub.groupby("transicion_tar", as_index=False).size().rename(columns={"size": "cambios"}).sort_values("cambios", ascending=False).head(10)
        temporal = sub.groupby(["anio", "mes"], as_index=False).size().rename(columns={"size": "cambios"})
        st.plotly_chart(px.pie(motivos, names="motivo_normalizado", values="cambios", title="Distribución de motivos"), use_container_width=True)
        st.plotly_chart(px.bar(trans, x="cambios", y="transicion_tar", orientation="h", title="Principales transiciones"), use_container_width=True)
        st.plotly_chart(px.line(temporal, x="mes", y="cambios", markers=True, title="Evolución temporal"), use_container_width=True)
        st.dataframe(sub[EXPORT_COLUMNS], use_container_width=True)
    c1, c2, c3 = st.columns(3)
    c1.download_button("Exportar informe Excel", report_to_excel(sub), f"informe_cambiosTAR_{etiqueta}.xlsx")
    c2.download_button("Exportar informe HTML", report_to_html(sub, etiqueta), f"informe_cambiosTAR_{etiqueta}.html", mime="text/html")
    c3.info("PDF no se activa para evitar dependencias pesadas; exporte HTML y conviértalo a PDF si lo necesita.")


def exportacion() -> None:
    st.header("Exportación")
    df = data_actual()
    if empty_state(df):
        return
    filtrado = filtrar_df(df)
    st.download_button("Exportar base completa seudonimizada", excel_bytes(df[EXPORT_COLUMNS], "base_completa"), "cambiosTAR_base_completa.xlsx")
    st.download_button("Exportar datos filtrados", excel_bytes(filtrado[EXPORT_COLUMNS], "filtrado"), "cambiosTAR_filtrado.xlsx")
    st.info("Los gráficos pueden descargarse desde el menú de cada visualización Plotly cuando estén visibles en pantalla.")


st.title("cambiosTAR")
st.caption(f"Base SQLite local: `{DB_PATH}`")
aviso_privacidad()

with st.sidebar:
    st.header("Módulos")
    pagina = st.radio(
        "Seleccione sección",
        [
            "Inicio / Dashboard",
            "Nuevo cambio",
            "Importar histórico",
            "Explorar registros",
            "Análisis temporal",
            "Análisis por motivo",
            "Transiciones TAR",
            "Trayectoria por paciente",
            "Informes",
            "Exportación",
        ],
    )
    st.divider()
    st.caption("Variables de entrada permitidas")
    st.write("Fecha · número de historia · TAR antiguo · TAR nuevo · motivo")

PAGES = {
    "Inicio / Dashboard": dashboard,
    "Nuevo cambio": nuevo_cambio,
    "Importar histórico": importar_historico,
    "Explorar registros": explorar_registros,
    "Análisis temporal": analisis_temporal,
    "Análisis por motivo": analisis_motivo,
    "Transiciones TAR": transiciones_tar,
    "Trayectoria por paciente": trayectoria_paciente,
    "Informes": informes,
    "Exportación": exportacion,
}

PAGES[pagina]()
