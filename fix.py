import re
import sys
html_path = r'c:\Users\Laura Aires\Ollama y Claude\midstream-financiero\index.html'
js_path = r'c:\Users\Laura Aires\Ollama y Claude\midstream-financiero\app.js'

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace Hero Banner
html = html.replace('Gestión de Comercio Exterior · Barranquilla / Cartagena · Usuario Operador ZF', 'Gestión de Comercio Exterior · Palermo / Barranquilla · Modelo Inversionista (Compra)')
html = html.replace('<span class="hero-tag">📐 2,000 m²</span>', '<span class="hero-tag">📐 Lote 2,000 m² | Bodega 557 m²</span>')

# Replace Operativos Area Slider
new_area = '''<div class="sup-card-title">Operativos (Oferta PPI)</div>
              <div class="sup-row">
                <div class="sup-label">Área Bodega Techada</div>
                <div class="input-group"><input type="number" id="s_area_bodega" value="557" disabled style="background:#f3f4f6"/><span class="unit">m²</span></div>
              </div>
              <div class="sup-row">
                <div class="sup-label">Área Patio (abierto)</div>
                <div class="input-group"><input type="number" id="s_area_patio" value="1443" disabled style="background:#f3f4f6"/><span class="unit">m²</span></div>
              </div>'''

html = re.sub(r'<div class="sup-card-title">Operativos</div>\s*<div class="sup-row">\s*<div class="sup-label">Área de bodega.*?</div>\s*</div>', new_area, html, flags=re.DOTALL)

# Replace Tarifas
html = re.sub(r'<div class="sup-card-title">Tarifas · Zofranca Cartagena 2025</div>(.*?)<div class="sup-row">\s*<div class="sup-label">Tránsito DTA/operación', 
    r'''<div class="sup-card-title">Tarifas · Servicios y Almacenamiento</div>\1<div class="sup-row">
                <div class="sup-label">Tarifa Almacenamiento Patio (m²)<span id="lbl_tarifa_patio">$5,000</span></div>
                <div class="input-group"><input type="number" id="s_tarifa_patio" step="500" min="1000" max="25000" value="5000" oninput="updateLbl('tarifa_patio','',true);recalculate()" /><span class="unit">COP</span></div>
                <input type="range" class="slider" id="sl_tarifa_patio" min="1000" max="25000" step="500" value="5000" oninput="syncSlider('tarifa_patio',this.value)" />
              </div>
              <div class="sup-row">
                <div class="sup-label">Tránsito DTA/operación''', html, flags=re.DOTALL)

html = html.replace('Almacenamiento (COP/m²/mes)', 'Tarifa Almacenamiento Bodega (m²)')

# Replace CAPEX Title
html = html.replace('Modelo Operador ZF — arrendamiento de bodega + equipamiento propio', 'Modelo Inversionista — Adquisición Z.F. Palermo + Equipamiento')

# Replace JS array keys
html = html.replace("['tarifa_alm', 'tarifa_dta', 'tarifa_docs', 'tarifa_cd']", "['tarifa_alm', 'tarifa_patio', 'tarifa_dta', 'tarifa_docs', 'tarifa_cd']")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# SCENARIOS
js = js.replace('area: 2000', 'area_bodega: 557, area_patio: 1443')
js = js.replace('tarifa_alm: 15000, tarifa_dta', 'tarifa_alm: 15000, tarifa_patio: 5000, tarifa_dta')
js = js.replace('tarifa_alm: 12400, tarifa_dta', 'tarifa_alm: 12400, tarifa_patio: 3500, tarifa_dta')
js = js.replace('tarifa_alm: 23500, tarifa_dta', 'tarifa_alm: 23500, tarifa_patio: 7000, tarifa_dta')

# CAPEX_ITEMS
js = re.sub(r'const CAPEX_ITEMS = \[.*?\];', r'''const CAPEX_ITEMS = [
  { name: 'Compra Lote (2,000m²) y Bodega (557m²) ZF Palermo', qty: 1, unitCost: 1760011600, note: 'Valor Oferta PPI' },
  { name: 'Adecuaciones bodega 557 m² (racks, oficinas)', qty: 557, unitCost: 350000, note: 'COP/m²' },
  { name: 'Sistemas TI, WMS y plataforma aduanera SIZA', qty: 1, unitCost: 280000000, note: 'ERP + WMS + DIAN Integration' },
  { name: 'Montacargas y equipos logísticos', qty: 2, unitCost: 150000000, note: 'Capacidad 2.5 ton c/u — nuevos' },
  { name: 'Vehículo de operaciones logísticas', qty: 1, unitCost: 120000000, note: 'Para traslados dentro de ZF' },
  { name: 'Constitución empresa + habilitación ZF + licencias', qty: 1, unitCost: 95000000, note: 'Calificación DIAN + MinComercio' },
  { name: 'Capital de trabajo inicial (4 meses OPEX)', qty: 1, unitCost: 200000000, note: 'Cobertura operativa' }
];''', js, flags=re.DOTALL)

# OPEX_FIXED
js = re.sub(r'const OPEX_FIXED = \[.*?\];', r'''const OPEX_FIXED = [
  { name: 'Administración ZF (835 COP/m² × 2,000 m²)', monthly: 1670000, ref: 'Tarifa ZF Colombia' },
  { name: 'Usuario Operador ZF (991 COP/m² × 2,000 m²)', monthly: 1982000, ref: 'Tarifa ZF Colombia' },
  { name: 'Vigilancia 24/7 — 4 guardias (con prestaciones)', monthly: 14000000, ref: 'Min. trabajo CO' },
  { name: 'Mantenimiento inmueble + áreas externas', monthly: 2500000, ref: 'Mantenimiento' },
  { name: 'Servicios públicos (energía, agua, gas)', monthly: 4500000, ref: 'Estimado industrial' },
  { name: 'Seguros y pólizas (sobre activo)', monthly: 2000000, ref: 'Seguro inmueble' },
  { name: 'Personal administrativo (2 personas)', monthly: 8000000, ref: 'Salario + prestaciones' },
  { name: 'Personal operativo (3 personas)', monthly: 10500000, ref: 'Salario + prestaciones' }
];''', js, flags=re.DOTALL)

# readSupuestos
js = js.replace("area: getVal('s_area'),", "area_bodega: getVal('s_area_bodega'),\n    area_patio: getVal('s_area_patio'),")
js = js.replace("tarifa_dta: getVal('s_tarifa_dta'),", "tarifa_patio: getVal('s_tarifa_patio'),\n    tarifa_dta: getVal('s_tarifa_dta'),")

# calcIngresos
js = re.sub(r'const m2Ocupados = s\.area \* s\.ocupacion;\n\s*const almacenamiento = m2Ocupados \* s\.tarifa_alm;',
r'''const m2BodegaOcupados = s.area_bodega * s.ocupacion;
  const m2PatioOcupados = s.area_patio * s.ocupacion;
  const almacenamientoBodega = m2BodegaOcupados * s.tarifa_alm;
  const almacenamientoPatio = m2PatioOcupados * s.tarifa_patio;
  const almacenamiento = almacenamientoBodega + almacenamientoPatio;''', js)
js = js.replace('return { almacenamiento, dta, docs, crossDocking, valorAgregado, total };', 'return { almacenamientoBodega, almacenamientoPatio, almacenamiento, dta, docs, crossDocking, valorAgregado, total };')
js = js.replace("8% sobre almacenamiento'", "8% sobre almacenamiento total'")

# calcBreakeven
js = re.sub(r'const beM2 = opexAnual / \(s\.tarifa_alm \* 12 \* s\.area \+ ingrDTA / s\.area \+ \(s\.tarifa_cd \* 0\.4 \* s\.ops_dta \* 12\) / s\.area\);',
r'''const areaTotal = s.area_bodega + s.area_patio;
  const tarifa_eq = ((s.area_bodega * s.tarifa_alm) + (s.area_patio * s.tarifa_patio)) / areaTotal;
  const beM2 = opexAnual / (tarifa_eq * 12 * areaTotal + ingrDTA / areaTotal + (s.tarifa_cd*0.4*s.ops_dta*12)/areaTotal);''', js)
js = js.replace('calcIngresos(s).total * 12 / s.ocupacion', 'calcIngresos(s).total * 12 / (s.ocupacion||0.01)')

# renderTableCapex / Opex
js = js.replace('fmtCOP(capex / s.area)', 'fmtCOP(capex / (s.area_bodega + s.area_patio))')
js = js.replace('fmtCOP(opex.total / s.area)', 'fmtCOP(opex.total / (s.area_bodega + s.area_patio))')
js = js.replace('fmtCOP(opex.total * 12 / s.area)', 'fmtCOP(opex.total * 12 / (s.area_bodega + s.area_patio))')

# renderTableIngresos
js = re.sub(r'\{\s*name:\s*\'Almacenamiento\s*\(m²\s*ocupados\s*×\s*tarifa\/mes\)\',\s*base.*?\},',
r'''    { name: 'Almacenamiento Bodega', base: `${fmt(s.area_bodega * s.ocupacion)} m² × ${fmtCOP(s.tarifa_alm)}/m²`, mes: ing.almacenamientoBodega, anio: ing.almacenamientoBodega * 12 },
    { name: 'Almacenamiento Patio', base: `${fmt(s.area_patio * s.ocupacion)} m² × ${fmtCOP(s.tarifa_patio)}/m²`, mes: ing.almacenamientoPatio, anio: ing.almacenamientoPatio * 12 },''', js, flags=re.DOTALL)

# buildSupuestos
js = js.replace("area: sc.area,", "area_bodega: sc.area_bodega,\n    area_patio: sc.area_patio,")
js = js.replace("tarifa_dta: sc.tarifa_dta,", "tarifa_patio: sc.tarifa_patio,\n    tarifa_dta: sc.tarifa_dta,")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
print('Done!')
