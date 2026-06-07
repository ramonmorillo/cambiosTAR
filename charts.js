(function () {
  const charts = {};
  const colors = ['#0f766e', '#0284c7', '#7c3aed', '#ea580c', '#dc2626', '#64748b', '#14b8a6', '#2563eb'];

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
  function sortedEntries(obj, limit) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit || 99); }
  function makeChart(id, type, labels, data, label) {
    const canvas = document.getElementById(id); if (!canvas || !window.Chart) return;
    destroy(id);
    charts[id] = new Chart(canvas, { type, data: { labels, datasets: [{ label, data, backgroundColor: colors, borderColor: '#075985', borderWidth: 2, tension: 0.32, fill: type === 'line' }] }, options: { responsive: true, plugins: { legend: { display: type === 'doughnut' } }, scales: type === 'doughnut' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }

  function byMonth(records) {
    return records.reduce((acc, r) => { const key = `${r.anio}-${String(r.mes).padStart(2, '0')}`; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  }

  function cumulative(records) {
    let total = 0;
    return Object.entries(byMonth(records)).sort(([a], [b]) => a.localeCompare(b)).reduce((acc, [k, v]) => { total += v; acc[k] = total; return acc; }, {});
  }

  function renderCharts(records) {
    const countBy = window.CambiosReports.countBy;
    let entries = Object.entries(countBy(records, 'anio')).sort(([a], [b]) => Number(a) - Number(b));
    makeChart('chart-year', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Cambios');
    entries = Object.entries(byMonth(records)).sort(([a], [b]) => a.localeCompare(b));
    makeChart('chart-month', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Cambios');
    entries = Object.entries(cumulative(records));
    makeChart('chart-cumulative', 'line', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Acumulado');
    entries = sortedEntries(countBy(records, 'motivo_normalizado'));
    makeChart('chart-reasons', 'doughnut', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Motivos');
    entries = sortedEntries(countBy(records.map((r) => ({ key: `${r.anio} · ${r.motivo_normalizado}` })), 'key'), 12);
    makeChart('chart-reasons-year', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Motivos por año');
    entries = sortedEntries(countBy(records, 'tar_antiguo_normalizado'), 10); makeChart('chart-old', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'TAR antiguos');
    entries = sortedEntries(countBy(records, 'tar_nuevo_normalizado'), 10); makeChart('chart-new', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'TAR nuevos');
    entries = sortedEntries(countBy(records, 'transicion_tar_normalizada'), 10); makeChart('chart-transitions', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Transiciones');
    entries = sortedEntries(countBy(records.map((r) => ({ key: `${r.motivo_normalizado}: ${r.transicion_tar_normalizada || r.transicion_tar}` })), 'key'), 12); makeChart('chart-transition-reason', 'bar', entries.map((e) => e[0]), entries.map((e) => e[1]), 'Transiciones por motivo');
    renderSankey(records);
  }

  function renderSankey(records) {
    const el = document.getElementById('sankey-chart'); if (!el) return;
    if (!window.Plotly) { el.textContent = 'Sankey no disponible: Plotly no se ha cargado.'; return; }
    const pairs = sortedEntries(window.CambiosReports.countBy(records, 'transicion_tar_normalizada'), 20);
    const labels = Array.from(new Set(pairs.flatMap(([k]) => k.split(' → '))));
    const source = pairs.map(([k]) => labels.indexOf(k.split(' → ')[0]));
    const target = pairs.map(([k]) => labels.indexOf(k.split(' → ')[1]));
    const value = pairs.map(([, v]) => v);
    Plotly.react(el, [{ type: 'sankey', orientation: 'h', node: { label: labels, pad: 15, thickness: 14 }, link: { source, target, value } }], { margin: { l: 8, r: 8, t: 8, b: 8 }, font: { size: 11 } }, { displayModeBar: false, responsive: true });
  }

  window.CambiosCharts = { renderCharts };
}());
