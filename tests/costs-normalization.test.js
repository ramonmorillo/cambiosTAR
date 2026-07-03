const assert = require('assert');

global.window = { CambiosIO: { toDateString: (v) => v } };
require('../costs.js');
const C = window.CambiosCosts;

function row(codigo_tar, coste_anual_eur) {
  return { codigo_tar, nombre_tar: codigo_tar, componentes: codigo_tar, coste_anual_eur, fecha_inicio_vigencia: '2020-01-01', fecha_fin_vigencia: '', import_batch_id: 'test' };
}
function calc(tar, catalog, aliases = []) { return C.findCost(tar, '2024-06-08', catalog, aliases); }

for (const value of ['DOR', 'dor', 'Dor', 'dOr']) {
  const r = calc(value, [row('DOR', 2011)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.codigo_tar, 'DOR');
}
{
  const r = calc('FTC/TAF/BIC', [row('BIC/FTC/TAF', 6059)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 6059);
  assert.equal(r.match_method, 'componentes_canonicos');
}
{
  const r = calc('Pifeltro (DOR), Tivicay (DTG)', [row('DOR', 2011), row('DTG', 4562)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 6573);
  assert.deepEqual(r.componentes_detectados, ['DOR', 'DTG']);
}
{
  const r = calc('Descovy (FTC/TAF), Tivicay (DTG)', [row('FTC/TAF', 3821), row('DTG', 4562)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 8383);
}
{
  const r = calc('Pifeltro (DOR), Triumeq (ABC/DTG/3TC)', [row('DOR', 2011), row('DTG/ABC/3TC', 6372)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 8383);
}
{
  const r = calc('Dovato (DTG/3TC)', [row('DTG/3TC', 5117)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.coste_anual_eur, 5117);
}
{
  const r = calc('FTC/TDF/RIL', [row('FTC/TDF/RPV', 4000)]);
  assert.equal(r.found, true);
  assert.equal(r.cost.codigo_tar, 'FTC/TDF/RPV');
}

console.log('costs normalization tests passed');
