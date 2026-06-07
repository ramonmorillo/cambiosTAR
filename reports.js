(function () {
  function countBy(records, key) {
    return records.reduce((acc, r) => { const value = r[key] || 'Sin dato'; acc[value] = (acc[value] || 0) + 1; return acc; }, {});
  }

  function topValue(records, key) {
    const entries = Object.entries(countBy(records, key)).sort((a, b) => b[1] - a[1]);
    return entries[0] || ['Sin datos', 0];
  }

  function filterPeriod(records, { from, to }) {
    return records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to));
  }

  function periodFromControls(type, year, month, quarter, customFrom, customTo) {
    const y = Number(year) || new Date().getFullYear();
    if (type === 'monthly') return { label: `${String(month).padStart(2, '0')}/${y}`, from: `${y}-${String(month).padStart(2, '0')}-01`, to: new Date(y, Number(month), 0).toISOString().slice(0, 10) };
    if (type === 'quarterly') {
      const startMonth = (Number(quarter) - 1) * 3 + 1;
      return { label: `T${quarter} ${y}`, from: `${y}-${String(startMonth).padStart(2, '0')}-01`, to: new Date(y, startMonth + 2, 0).toISOString().slice(0, 10) };
    }
    if (type === 'annual') return { label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
    return { label: `${customFrom || 'inicio'} a ${customTo || 'fin'}`, from: customFrom, to: customTo };
  }

  function previousPeriod(period) {
    if (!period.from || !period.to) return null;
    const from = new Date(`${period.from}T00:00:00`);
    const to = new Date(`${period.to}T00:00:00`);
    const days = Math.round((to - from) / 86400000) + 1;
    const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
    return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
  }

  function generateReport(records, period) {
    const selected = filterPeriod(records, period);
    const patients = new Set(selected.map((r) => r.patient_id)).size;
    const [reason, reasonCount] = topValue(selected, 'motivo_normalizado');
    const [transition, transitionCount] = topValue(selected, 'transicion_tar');
    const prev = previousPeriod(period);
    let comparison = 'no existen datos suficientes para comparar con el periodo previo';
    if (prev) {
      const prevCount = filterPeriod(records, prev).length;
      if (prevCount || selected.length) {
        const diff = selected.length - prevCount;
        comparison = diff > 0 ? `se observa un aumento de ${diff} cambios respecto al periodo previo` : diff < 0 ? `se observa una disminución de ${Math.abs(diff)} cambios respecto al periodo previo` : 'se observa estabilidad respecto al periodo previo';
      }
    }
    const comment = `Durante el periodo analizado se registraron ${selected.length} cambios de TAR en ${patients} pacientes. El motivo más frecuente fue ${reason} (${reasonCount}). La transición más frecuente fue ${transition} (${transitionCount}). En comparación con el periodo previo, ${comparison}.`;
    return { period, records: selected, total: selected.length, patients, reasons: countBy(selected, 'motivo_normalizado'), transitions: countBy(selected, 'transicion_tar'), oldTar: countBy(selected, 'tar_antiguo'), newTar: countBy(selected, 'tar_nuevo'), comment };
  }

  function tableFromObject(title, obj) {
    const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    return `<h4>${title}</h4><table><thead><tr><th>Variable</th><th>N</th></tr></thead><tbody>${rows || '<tr><td>Sin datos</td><td>0</td></tr>'}</tbody></table>`;
  }

  function renderReport(report) {
    return `<article class="report-card"><h3>Informe cambiosTAR · ${report.period.label}</h3><p><strong>Periodo analizado:</strong> ${report.period.from || 'inicio'} a ${report.period.to || 'fin'}</p><div class="metric-grid compact-metrics"><div class="metric"><span>Total cambios</span><strong>${report.total}</strong></div><div class="metric"><span>Pacientes</span><strong>${report.patients}</strong></div></div><p class="interpretation">${report.comment}</p>${tableFromObject('Distribución de motivos', report.reasons)}${tableFromObject('Principales transiciones', report.transitions)}${tableFromObject('Top TAR antiguos', report.oldTar)}${tableFromObject('Top TAR nuevos', report.newTar)}</article>`;
  }

  window.CambiosReports = { countBy, topValue, filterPeriod, periodFromControls, generateReport, renderReport };
}());
