const assert = require('assert');

global.window = { CambiosIO: { toDateString: (v) => v } };
require('../costs.js');
const C = window.CambiosCosts;

function row(codigo_tar, coste_anual_eur) {
  return { codigo_tar, nombre_tar: codigo_tar, componentes: codigo_tar, coste_anual_eur, fecha_inicio_vigencia: '2020-01-01', fecha_fin_vigencia: '', import_batch_id: 'test' };
}
function state(catalog) { return { catalog, aliases: [], activeBatchId: 'test', importedAt: '2026-01-01' }; }
function calc(tar, catalog) {
  return C.findCost(tar, '2024-06-08', catalog, []);
}

{
  const r = calc('DTG + DOR', [row('DTG', 3000), row('DOR', 2500)]);
  assert.equal(r.found, true);
  assert.equal(r.tipo_tar, 'compuesto');
  assert.equal(r.cost.coste_anual_eur, 5500);
}
{
  const r = calc('DTG + DRV/COBI/FTC/TAF', [row('DTG', 3000), row('DRV/COBI/FTC/TAF', 6500)]);
  assert.equal(r.found, true);
  assert.equal(r.tipo_tar, 'compuesto');
  assert.equal(r.cost.coste_anual_eur, 9500);
}
{
  const r = calc('DTG + DOR', [row('DTG', 3000)]);
  assert.equal(r.found, false);
  assert.deepEqual(r.componentes_no_encontrados, ['DOR']);
  assert.equal(r.code, 'componente_no_encontrado');
}
{
  const r = calc('DTG + DOR', [row('DTG + DOR', 5200), row('DTG', 3000), row('DOR', 2500)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 5200);
  assert.equal(r.match_method, 'match_exacto_tar_completo');
}
{
  const r = calc('BIC/FTC/TAF', [row('BIC/FTC/TAF', 6000)]);
  assert.equal(r.found, true);
  assert.equal(r.tipo_tar, 'simple');
  assert.equal(r.cost.coste_anual_eur, 6000);
}
{
  const result = C.calculate({ fecha: '2024-06-08', tar_antiguo: 'DTG + DOR', tar_nuevo: 'BIC/FTC/TAF' }, state([row('DTG', 3000), row('DOR', 2500), row('BIC/FTC/TAF', 6000)]));
  assert.equal(result.coste_calculable, 'si');
  assert.equal(result.coste_anual_tar_anterior_eur, 5500);
  assert.equal(result.coste_anual_tar_nuevo_eur, 6000);
  assert.equal(result.diferencia_anual_eur, -500);
  assert.equal(result.impacto_economico, 'sobrecoste');
}

console.log('costs compound tests passed');
