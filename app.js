// ================================================================

// --- CONFIGURACIÓN SUPABASE ---
const SB_URL = "https://tgusgdpxpojjznxedzxl.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndXNnZHB4cG9qanpueGVkenhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjMyNjcsImV4cCI6MjA5MDczOTI2N30.eq4lIM4_b4VFAs8KYMWaHFp5HBn-sOqZgp3wPxVuPKc";
let sbClient = null;
let saveTimeout = null;

if (typeof window !== 'undefined' && window.supabase) {
  sbClient = window.supabase.createClient(SB_URL, SB_KEY);
}

// ─── ESTADO GLOBAL ────────────────────────────────────────────
const SHEET_ID = '1K4nVJBO9l32ZjPl_uIkEcRrNJQeI_NHMfhemYfDS';

const SCENARIOS = {
  base: {
    inflacion: 6.0, trm: 4100, ipp: 5.5, tasa_zf: 20,
    wacc: 13.24, margen: 12, horizonte: 10, vida_util: 20,
    area_bodega: 557, area_patio: 1443, ocupacion: 70, ops_dta: 15, rotacion: 4,
    tarifa_alm: 15000, tarifa_patio: 5000, tarifa_dta: 1500000,
    tarifa_docs: 326300, tarifa_cd: 800000
  },
  conservador: {
    inflacion: 7.0, trm: 4300, ipp: 6.5, tasa_zf: 20,
    wacc: 13.24, margen: 12, horizonte: 10, vida_util: 20,
    area_bodega: 557, area_patio: 1443, ocupacion: 50, ops_dta: 8, rotacion: 3,
    tarifa_alm: 12400, tarifa_patio: 3500, tarifa_dta: 1000000,
    tarifa_docs: 326300, tarifa_cd: 600000
  },
  optimista: {
    inflacion: 5.0, trm: 3900, ipp: 4.5, tasa_zf: 20,
    wacc: 12.0, margen: 12, horizonte: 10, vida_util: 20,
    area_bodega: 557, area_patio: 1443, ocupacion: 90, ops_dta: 25, rotacion: 6,
    tarifa_alm: 23500, tarifa_patio: 7000, tarifa_dta: 2500000,
    tarifa_docs: 326300, tarifa_cd: 1200000
  }
};

// CAPEX items (COP) 
// MODELO INVERSIONISTA: Compra Inmueble
const CAPEX_ITEMS = [
  { name: 'Compra Lote (2,000m²) y Bodega (557m²) ZF Palermo', qty: 1, unitCost: 1760011600, note: 'Valor Oferta PPI' },
  { name: 'Adecuaciones bodega 557 m² (racks, oficinas)', qty: 557, unitCost: 350000, note: 'COP/m²' },
  { name: 'Sistemas TI, WMS y plataforma aduanera SIZA', qty: 1, unitCost: 280000000, note: 'ERP + WMS + DIAN Integration' },
  { name: 'Montacargas y equipos logísticos', qty: 2, unitCost: 150000000, note: 'Capacidad 2.5 ton c/u — nuevos' },
  { name: 'Vehículo de operaciones logísticas', qty: 1, unitCost: 120000000, note: 'Para traslados dentro de ZF' },
  { name: 'Constitución empresa + habilitación ZF + licencias', qty: 1, unitCost: 95000000, note: 'Calificación DIAN + MinComercio' },
  { name: 'Capital de trabajo inicial (4 meses OPEX)', qty: 1, unitCost: 200000000, note: 'Cobertura operativa' }
];

// OPEX items (COP/mes)
const OPEX_FIXED = [
  { name: 'Administración ZF (835 COP/m² × 2,000 m²)', monthly: 1670000, ref: 'Tarifa ZF Colombia' },
  { name: 'Usuario Operador ZF (991 COP/m² × 2,000 m²)', monthly: 1982000, ref: 'Tarifa ZF Colombia' },
  { name: 'Vigilancia 24/7 — 4 guardias (con prestaciones)', monthly: 14000000, ref: 'Min. trabajo CO' },
  { name: 'Mantenimiento inmueble + áreas externas', monthly: 2500000, ref: 'Mantenimiento' },
  { name: 'Servicios públicos (energía, agua, gas)', monthly: 4500000, ref: 'Estimado industrial' },
  { name: 'Seguros y pólizas (sobre activo)', monthly: 2000000, ref: 'Seguro inmueble' },
  { name: 'Personal administrativo (2 personas)', monthly: 8000000, ref: 'Salario + prestaciones' },
  { name: 'Personal operativo (3 personas)', monthly: 10500000, ref: 'Salario + prestaciones' }
];
const OPEX_VAR = [
  { name: 'Materiales de proceso y embalaje', monthly: 1500000, ref: 'Variable con volumen' },
  { name: 'Gastos operación aduanera (Zofranca)', monthly: 2000000, ref: 'Tarifario 2025' },
  { name: 'Transporte y logística externa', monthly: 1800000, ref: 'Estimado' },
  { name: 'Honorarios y servicios externos', monthly: 1200000, ref: 'Asesores, tributos' }
];

let charts = {};
let currentScenario = 'base';

// ─── UTILIDADES ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = (n, dec = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
const fmtCOP = (n) => {
  if (Math.abs(n) >= 1e9) return '$' + fmt(n / 1e9, 1) + ' B';
  if (Math.abs(n) >= 1e6) return '$' + fmt(n / 1e6, 1) + ' M';
  return '$' + fmt(n);
};
const fmtPct = (n, dec = 1) => fmt(n, dec) + '%';
const getVal = id => parseFloat($(id)?.value ?? 0);

// ─── SINCRONIZAR SLIDERS ──────────────────────────────────────
function syncSlider(key, val) {
  const input = $('s_' + key);
  if (input) input.value = val;
  recalculate();
}

// ─── LEER SUPUESTOS ───────────────────────────────────────────
function readSupuestos() {
  return {
    inflacion: getVal('s_inflacion') / 100,
    trm: getVal('s_trm'),
    ipp: getVal('s_ipp') / 100,
    tasa_zf: getVal('s_tasa_zf') / 100,
    wacc: getVal('s_wacc') / 100,
    margen: getVal('s_margen') / 100,
    horizonte: getVal('s_horizonte'),
    vida_util: getVal('s_vida_util'),
    area_bodega: getVal('s_area_bodega'),
    area_patio: getVal('s_area_patio'),
    ocupacion: getVal('s_ocupacion') / 100,
    ops_dta: getVal('s_ops_dta'),
    rotacion: getVal('s_rotacion'),
    tarifa_alm: getVal('s_tarifa_alm'),
    tarifa_patio: getVal('s_tarifa_patio'),
    tarifa_dta: getVal('s_tarifa_dta'),
    tarifa_docs: getVal('s_tarifa_docs'),
    tarifa_cd: getVal('s_tarifa_cd')
  };
}

// ─── CALCULAR CAPEX ───────────────────────────────────────────
function calcCapex(s) {
  return CAPEX_ITEMS.reduce((sum, item) => sum + item.qty * item.unitCost, 0);
}

// ─── CALCULAR OPEX ────────────────────────────────────────────
function calcOpex(s) {
  const totalFijos = OPEX_FIXED.reduce((acc, r) => acc + r.monthly, 0);
  const totalVars = OPEX_VAR.reduce((acc, r) => acc + r.monthly, 0);
  // Escalar variables con ocupación
  const varEscalado = totalVars * (0.5 + 0.5 * s.ocupacion);
  return { totalFijos, totalVars: varEscalado, total: totalFijos + varEscalado };
}

// ─── CALCULAR INGRESOS ────────────────────────────────────────
function calcIngresos(s) {
  const m2BodegaOcupados = s.area_bodega * s.ocupacion;
  const m2PatioOcupados = s.area_patio * s.ocupacion;

  const almacenamientoBodega = m2BodegaOcupados * s.tarifa_alm;
  const almacenamientoPatio = m2PatioOcupados * s.tarifa_patio;
  const almacenamiento = almacenamientoBodega + almacenamientoPatio;

  const dta = s.ops_dta * s.tarifa_dta;
  const docs = s.ops_dta * s.tarifa_docs;
  const crossDocking = s.ops_dta * 0.4 * s.tarifa_cd; // 40% de ops incluyen CD
  const valorAgregado = almacenamiento * 0.08; // 8% sobre almacenamiento total
  const total = almacenamiento + dta + docs + crossDocking + valorAgregado;

  return { almacenamientoBodega, almacenamientoPatio, almacenamiento, dta, docs, crossDocking, valorAgregado, total };
}

// ─── PROYECCIÓN 10 AÑOS ───────────────────────────────────────
function calcProyeccion(s) {
  const capex = calcCapex(s);
  const depAnual = capex / s.vida_util;
  const rows = [];
  let fcAcum = -capex;

  for (let yr = 1; yr <= s.horizonte; yr++) {
    const inflFactor = Math.pow(1 + s.inflacion, yr - 1);
    const opex = calcOpex(s);
    const ing = calcIngresos(s);

    const ingresos = ing.total * 12 * inflFactor;
    const opexAnual = opex.total * 12 * inflFactor;
    const ebitda = ingresos - opexAnual;
    const ebit = ebitda - depAnual;
    const imp = Math.max(0, ebit * s.tasa_zf);
    const utilidadNeta = ebit - imp;
    const fcLibre = ebitda - imp; // EBITDA - impuestos (capex ya fue en año 0)
    fcAcum += fcLibre;

    rows.push({
      year: yr, ingresos, opexAnual, ebitda,
      margenEbitda: ebitda / ingresos,
      dep: depAnual, ebit, imp, utilidadNeta,
      fcLibre, fcAcum
    });
  }
  return rows;
}

// ─── VAN / TIR / PAYBACK ─────────────────────────────────────
function calcFinancials(s) {
  const capex = calcCapex(s);
  const proj = calcProyeccion(s);
  const fcs = [-capex, ...proj.map(r => r.fcLibre)];

  // VAN
  let van = -capex;
  proj.forEach((r, i) => {
    van += r.fcLibre / Math.pow(1 + s.wacc, i + 1);
  });

  // TIR — Newton-Raphson
  let tir = 0.2;
  for (let iter = 0; iter < 200; iter++) {
    let f = 0, df = 0;
    fcs.forEach((fc, t) => {
      f += fc / Math.pow(1 + tir, t);
      if (t > 0) df -= t * fc / Math.pow(1 + tir, t + 1);
    });
    const step = f / df;
    tir -= step;
    if (Math.abs(step) < 1e-10) break;
  }

  // Payback descontado
  let pb = -1, cumPV = -capex;
  for (let i = 0; i < proj.length; i++) {
    cumPV += proj[i].fcLibre / Math.pow(1 + s.wacc, i + 1);
    if (cumPV >= 0 && pb < 0) pb = i + 1;
  }

  return { van, tir, payback: pb, capex, proj };
}

// ─── BREAKEVEN ────────────────────────────────────────────────
function calcBreakeven(s) {
  const opexMes = calcOpex(s).total;
  const opexAnual = opexMes * 12;
  const areaTotal = s.area_bodega + s.area_patio;
  const tarifa_eq = ((s.area_bodega * s.tarifa_alm) + (s.area_patio * s.tarifa_patio)) / areaTotal;

  const ingrDTA = (s.ops_dta * s.tarifa_dta + s.ops_dta * s.tarifa_docs) * 12;

  // Ocupación mínima donde ingresos = OPEX
  const beM2 = opexAnual / (tarifa_eq * 12 * areaTotal + ingrDTA / areaTotal + (s.tarifa_cd * 0.4 * s.ops_dta * 12) / areaTotal);
  const beOcupacion = Math.min(100, (opexAnual / (calcIngresos(s).total * 12 / (s.ocupacion || 0.01))) * 100);
  const beIngresos = opexAnual;

  return {
    beOcupacion: Math.min(100, beOcupacion),
    beIngresos,
    margenSeguridad: ((s.ocupacion * 100) - beOcupacion) / (s.ocupacion * 100) * 100,
    beOps: Math.ceil(beIngresos / (s.tarifa_dta * 12))
  };
}

// ─── RENDERIZAR DASHBOARD KPIs ────────────────────────────────
function renderKPIs(fin, s) {
  const ing = calcIngresos(s);

  // VAN
  if ($('lbl-van-years')) $('lbl-van-years').textContent = `VAN (${s.horizonte} años)`;

  // Hero Tags
  if ($('hero-tag-area')) {
    const totalArea = (s.area_bodega || 0) + (s.area_patio || 0);
    $('hero-tag-area').textContent = `📐 Lote ${fmt(totalArea)} m² | Bodega ${fmt(s.area_bodega)} m²`;
  }
  if ($('hero-tag-horizonte')) $('hero-tag-horizonte').textContent = `📅 Horizonte ${s.horizonte} años`;
  if ($('hero-tag-tasa')) $('hero-tag-tasa').textContent = `🏛️ Tasa ZF ${fmtPct(s.tasa_zf * 100, 0)}`;
  if ($('hero-tag-wacc')) $('hero-tag-wacc').textContent = `💡 WACC ${fmtPct(s.wacc * 100, 2)}`;

  // Extra labels
  if ($('subtitle-proyeccion')) $('subtitle-proyeccion').textContent = `${s.horizonte} años con inflación acumulada`;
  if ($('badge-proyecciones')) $('badge-proyecciones').textContent = `${s.horizonte} años`;
  if ($('footer-years')) {
    const currentYear = new Intl.DateTimeFormat('es-CO', { year: 'numeric' }).format(new Date());
    const endYear = parseInt(currentYear) + s.horizonte;
    $('footer-years').textContent = `🛢️ MidStream FX · Modelo Financiero Zona Franca | Colombia ${currentYear}–${endYear}`;
    if ($('topbar-role')) $('topbar-role').textContent = `Colombia ${currentYear}`;
  }

  $('display-van').textContent = fmtCOP(fin.van);
  const vanBadge = $('trend-van');
  if (vanBadge) {
    vanBadge.textContent = fin.van >= 0 ? '✅ VAN Positivo' : '⚠️ VAN Negativo';
    vanBadge.className = 'kpi-badge ' + (fin.van >= 0 ? 'pos' : 'neg');
  }

  // TIR
  $('display-tir').textContent = isFinite(fin.tir) ? fmtPct(fin.tir * 100) : '∞%';
  const tirBadge = $('trend-tir');
  if (tirBadge) {
    const dif = (fin.tir - s.wacc) * 100;
    tirBadge.textContent = isFinite(dif) ? `${dif >= 0 ? '+' : ''}${fmtPct(dif)} vs WACC` : 'TIR > WACC';
    tirBadge.className = 'kpi-badge ' + (fin.tir >= s.wacc ? 'pos' : 'neg');
  }

  // Payback
  $('display-payback').textContent = fin.payback > 0 ? fin.payback + ' años' : '> horizonte';
  const pbBadge = $('trend-payback');
  if (pbBadge) {
    pbBadge.textContent = fin.payback > 0 ? `Año ${fin.payback}` : 'Sin recuperación';
    pbBadge.className = 'kpi-badge ' + (fin.payback > 0 && fin.payback <= 7 ? 'pos' : fin.payback > 7 ? 'neu' : 'neg');
  }

  // EBITDA
  const ebitdaY1 = fin.proj[0]?.ebitda ?? 0;
  const marY1 = fin.proj[0]?.margenEbitda ?? 0;
  $('display-ebitda').textContent = fmtCOP(ebitdaY1);
  const ebitdaBadge = $('trend-ebitda');
  if (ebitdaBadge) {
    ebitdaBadge.textContent = `Margen: ${fmtPct(marY1 * 100)}`;
    ebitdaBadge.className = 'kpi-badge ' + (marY1 > 0.3 ? 'pos' : marY1 > 0 ? 'neu' : 'neg');
  }

  // Ingresos
  $('display-ingresos').textContent = fmtCOP(ing.total * 12);
  const ingBadge = $('trend-ingresos');
  if (ingBadge) {
    ingBadge.textContent = `${fmtPct(s.ocupacion * 100)} ocupación`;
    ingBadge.className = 'kpi-badge pos';
  }

  // CAPEX
  $('display-capex').textContent = fmtCOP(fin.capex);
  const capexBadge = $('trend-capex');
  if (capexBadge) {
    capexBadge.textContent = `USD ${fmt(fin.capex / s.trm / 1e6, 1)} M`;
    capexBadge.className = 'kpi-badge neu';
  }

  // Hero stat
  const heroEl = $('hero-ingresos');
  if (heroEl) heroEl.textContent = fmtCOP(ing.total * 12);
}

// ─── CHARTS ───────────────────────────────────────────────────
const CHART_DEFAULTS = {
  font: { family: "'Inter', sans-serif" },
  color: '#6b7280',
  grid: '#f3f4f6'
};

function makeChart(id, type, data, options = {}) {
  if (charts[id]) charts[id].destroy();
  const ctx = $(id)?.getContext('2d');
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type, data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a2e',
          borderColor: '#8b5cf6', borderWidth: 1,
          titleColor: '#a78bfa', bodyColor: '#e5e7eb',
          padding: 12, cornerRadius: 10
        }
      },
      scales: type !== 'pie' && type !== 'doughnut' ? {
        x: { grid: { color: CHART_DEFAULTS.grid }, ticks: { color: CHART_DEFAULTS.color, font: { size: 11, family: 'Inter' } } },
        y: { grid: { color: CHART_DEFAULTS.grid }, ticks: { color: CHART_DEFAULTS.color, font: { size: 11, family: 'Inter' }, callback: v => fmtCOP(v) } }
      } : {},
      ...options
    }
  });
}

function renderChartProyeccion(proj) {
  const labels = proj.map(r => `Año ${r.year}`);
  makeChart('chartProyeccion', 'bar', {
    labels,
    datasets: [
      {
        label: 'Ingresos', data: proj.map(r => r.ingresos),
        backgroundColor: 'rgba(139,92,246,0.15)', borderColor: '#8b5cf6', borderWidth: 1.5,
        borderRadius: 6
      },
      {
        label: 'OPEX', data: proj.map(r => r.opexAnual),
        backgroundColor: 'rgba(248,113,113,0.15)', borderColor: '#f87171', borderWidth: 1.5,
        borderRadius: 6
      },
      {
        label: 'EBITDA', data: proj.map(r => r.ebitda),
        backgroundColor: 'rgba(163,230,53,0.6)', borderColor: '#84cc16', borderWidth: 2,
        borderRadius: 6, type: 'line', pointRadius: 4, pointBackgroundColor: '#84cc16', tension: 0.3
      }
    ]
  });
}

function renderChartFCL(proj, capex) {
  const labels = ['Año 0', ...proj.map(r => `Año ${r.year}`)];
  const data = [-capex, ...proj.map(r => r.fcAcum)];
  makeChart('chartFCL', 'line', {
    labels,
    datasets: [{
      data, fill: true,
      backgroundColor: ctx => {
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
        g.addColorStop(0, 'rgba(139,92,246,0.18)');
        g.addColorStop(1, 'rgba(139,92,246,0.01)');
        return g;
      },
      borderColor: '#8b5cf6', borderWidth: 2.5, pointRadius: 5,
      pointBackgroundColor: data.map(v => v >= 0 ? '#8b5cf6' : '#f87171'),
      tension: 0.35
    }]
  }, {
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => 'FCL Acum: ' + fmtCOP(ctx.raw) } }
    }
  });
}

function renderChartIngresos(ing) {
  const entries = [
    { label: 'Almacenamiento', value: ing.almacenamiento, color: '#8b5cf6' },
    { label: 'Tránsito DTA', value: ing.dta, color: '#a3e635' },
    { label: 'Docs Aduaneros', value: ing.docs, color: '#c084fc' },
    { label: 'Cross-Docking', value: ing.crossDocking, color: '#4ade80' },
    { label: 'Valor Agregado', value: ing.valorAgregado, color: '#fbbf24' }
  ];
  makeChart('chartIngresos', 'doughnut', {
    labels: entries.map(e => e.label),
    datasets: [{ data: entries.map(e => e.value), backgroundColor: entries.map(e => e.color), borderWidth: 3, borderColor: '#fff', hoverOffset: 10 }]
  }, {
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#6b7280', padding: 10, font: { size: 11, family: 'Inter' } } },
      tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtCOP(ctx.raw)} (${fmtPct(ctx.raw / ing.total * 100)})` } }
    }
  });
}

function renderChartCostos() {
  const fixed = OPEX_FIXED.reduce((s, r) => s + r.monthly, 0);
  const variable = OPEX_VAR.reduce((s, r) => s + r.monthly, 0);
  makeChart('chartCostos', 'doughnut', {
    labels: ['Costos Fijos', 'Costos Variables'],
    datasets: [{ data: [fixed, variable], backgroundColor: ['#8b5cf6', '#a3e635'], borderWidth: 3, borderColor: '#fff', hoverOffset: 10 }]
  }, {
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#6b7280', padding: 12, font: { size: 11, family: 'Inter' } } }
    }
  });
}

function renderChartCapexPie() {
  const entries = CAPEX_ITEMS.map(i => ({ label: i.name.substring(0, 32), value: i.qty * i.unitCost }));
  const colors = ['#8b5cf6', '#a3e635', '#c084fc', '#4ade80', '#fbbf24', '#f87171', '#60a5fa'];
  makeChart('chartCapexPie', 'doughnut', {
    labels: entries.map(e => e.label),
    datasets: [{ data: entries.map(e => e.value), backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverOffset: 10 }]
  }, {
    plugins: {
      legend: { display: true, position: 'bottom', labels: { color: '#6b7280', padding: 8, font: { size: 10, family: 'Inter' } } }
    }
  });
}

function renderChartOpexPie(opex) {
  const items = [
    ...OPEX_FIXED.map(r => ({ label: r.name.substring(0, 28), value: r.monthly })),
    ...OPEX_VAR.map(r => ({ label: r.name.substring(0, 28), value: r.monthly }))
  ];
  const colors = ['#8b5cf6', '#9d72f7', '#a78bfa', '#b79dfc', '#c4b5fd', '#a3e635', '#bef264', '#86efac', '#4ade80', '#fbbf24', '#f87171', '#60a5fa', '#34d399'];
  makeChart('chartOpexPie', 'doughnut', {
    labels: items.map(i => i.label),
    datasets: [{ data: items.map(i => i.value), backgroundColor: colors, borderWidth: 3, borderColor: '#fff', hoverOffset: 10 }]
  }, {
    plugins: {
      legend: { display: false }
    }
  });
}

function renderChartIngresosBar(ing) {
  const entries = [
    { label: 'Almacenamiento', value: ing.almacenamiento * 12 },
    { label: 'Tránsito DTA', value: ing.dta * 12 },
    { label: 'Docs Aduaneros', value: ing.docs * 12 },
    { label: 'Cross-Docking', value: ing.crossDocking * 12 },
    { label: 'Valor Agregado', value: ing.valorAgregado * 12 }
  ];
  makeChart('chartIngresosBar', 'bar', {
    labels: entries.map(e => e.label),
    datasets: [{
      data: entries.map(e => e.value),
      backgroundColor: ['#8b5cf6', '#a3e635', '#c084fc', '#4ade80', '#fbbf24'],
      borderRadius: 8, borderWidth: 0
    }]
  }, {
    plugins: { legend: { display: false } },
    indexAxis: 'y'
  });
}

function renderChartPG(proj) {
  const labels = proj.map(r => `Año ${r.year}`);
  makeChart('chartPG', 'line', {
    labels,
    datasets: [
      { label: 'Ingresos', data: proj.map(r => r.ingresos), borderColor: '#8b5cf6', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#8b5cf6', tension: 0.35, fill: false },
      { label: 'OPEX', data: proj.map(r => r.opexAnual), borderColor: '#f87171', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#f87171', tension: 0.35, fill: false },
      { label: 'EBITDA', data: proj.map(r => r.ebitda), borderColor: '#a3e635', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#a3e635', tension: 0.35, fill: false },
      { label: 'Utilidad Neta', data: proj.map(r => r.utilidadNeta), borderColor: '#4ade80', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#4ade80', tension: 0.35, fill: false }
    ]
  }, {
    plugins: {
      legend: { display: true, labels: { color: '#6b7280', padding: 16, font: { size: 11, family: 'Inter' } } }
    }
  });
}

function renderChartMargenEbitda(proj) {
  makeChart('chartMargenEbitda', 'bar', {
    labels: proj.map(r => `Año ${r.year}`),
    datasets: [{
      label: 'Margen EBITDA %', data: proj.map(r => r.margenEbitda * 100),
      backgroundColor: proj.map(r => r.margenEbitda > 0.3 ? '#4ade80' : r.margenEbitda > 0 ? '#fbbf24' : '#f87171'),
      borderRadius: 8, borderWidth: 0
    }]
  }, {
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { color: '#f3f4f6' },
        ticks: { color: '#6b7280', callback: v => v + '%', font: { family: 'Inter', size: 11 } }
      },
      x: { grid: { color: '#f3f4f6' }, ticks: { color: '#6b7280', font: { family: 'Inter', size: 11 } } }
    }
  });
}

function renderChartTornado(s) {
  const fin0 = calcFinancials(s);
  const varDeltas = [
    { label: '% Ocupación', key: 'ocupacion', delta: 0.1, unit: '+10%' },
    { label: 'Tarifa Almacenamiento', key: 'tarifa_alm', delta: 0.15, unit: '+15%' },
    { label: 'WACC', key: 'wacc', delta: 0.02, unit: '+2pp', inverse: true },
    { label: 'Inflación OPEX', key: 'inflacion', delta: 0.02, unit: '+2pp', inverse: true },
    { label: 'Tarifas DTA', key: 'tarifa_dta', delta: 0.15, unit: '+15%' },
    { label: 'CAPEX Total', key: 'capex_scale', delta: 0.1, unit: '+10%', inverse: true }
  ];

  const impacts = varDeltas.map(v => {
    const sUp = { ...s };
    if (v.key === 'capex_scale') {
      sUp._capex_factor = 1.1;
    } else {
      sUp[v.key] = s[v.key] * (1 + v.delta);
    }
    const finUp = calcFinancials(sUp);
    const impact = finUp.van - fin0.van;
    return { label: v.label, impact, unit: v.unit, inverse: v.inverse };
  }).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  makeChart('chartTornado', 'bar', {
    labels: impacts.map(i => i.label),
    datasets: [{
      data: impacts.map(i => i.impact),
      backgroundColor: impacts.map(i => i.impact >= 0 ? '#8b5cf6' : '#f87171'),
      borderRadius: 6, borderWidth: 0
    }]
  }, {
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `Impacto VAN: ${fmtCOP(ctx.raw)}` } }
    },
    scales: {
      x: {
        grid: { color: '#f3f4f6' },
        ticks: { color: '#6b7280', callback: v => fmtCOP(v), font: { family: 'Inter', size: 11 } }
      },
      y: { grid: { display: false }, ticks: { color: '#374151', font: { family: 'Inter', size: 12 } } }
    }
  });
}

// ─── TABLAS ───────────────────────────────────────────────────
function renderTableCapex(s) {
  const capex = calcCapex(s);
  const tbody = $('tbodyCapex');
  if (!tbody) return;
  tbody.innerHTML = CAPEX_ITEMS.map(item => {
    const total = item.qty * item.unitCost;
    const pct = (total / capex * 100).toFixed(1);
    return `<tr>
      <td>${item.name}<br><small style="color:var(--text-muted);font-size:11px">${item.note}</small></td>
      <td class="mono" style="text-align:right">${fmt(item.qty)}</td>
      <td class="mono" style="text-align:right">${fmtCOP(item.unitCost)}</td>
      <td class="num-neu" style="text-align:right">${fmtCOP(total)}</td>
      <td style="text-align:right;color:var(--text-muted);font-size:12px">${pct}%</td>
    </tr>`;
  }).join('');
  if ($('totalCapex')) $('totalCapex').textContent = fmtCOP(capex);
  if ($('totalCapexUSD')) $('totalCapexUSD').textContent = '≈ USD ' + fmt(capex / s.trm);
  if ($('capexPorM2')) $('capexPorM2').textContent = fmtCOP(capex / (s.area_bodega + s.area_patio));
  if ($('depAnual')) $('depAnual').textContent = fmtCOP(capex / s.vida_util);
  const ing = calcIngresos(s);
  if ($('depPct')) $('depPct').textContent = fmtPct((capex / s.vida_util) / (ing.total * 12) * 100);
}

function renderTableOpex(s) {
  const opex = calcOpex(s);
  const tbody = $('tbodyOpex');
  if (!tbody) return;
  const allItems = [
    ...OPEX_FIXED.map(r => ({ ...r, tipo: 'Fijo' })),
    ...OPEX_VAR.map(r => ({ ...r, tipo: 'Variable' }))
  ];
  tbody.innerHTML = allItems.map(item => {
    const pct = (item.monthly / opex.total * 100).toFixed(1);
    return `<tr>
      <td>${item.name}<br><small style="color:var(--text-muted);font-size:11px">${item.ref}</small></td>
      <td class="num-neu">${fmtCOP(item.monthly)}</td>
      <td class="mono" style="color:var(--text-secondary)">${fmtCOP(item.monthly * 12)}</td>
      <td style="color:var(--text-muted);font-size:12px">${pct}%</td>
    </tr>`;
  }).join('');
  // Totals por ID (safe)
  const setEl = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setEl('totalFijosMes', fmtCOP(opex.totalFijos));
  setEl('totalFijosAnio', fmtCOP(opex.totalFijos * 12));
  setEl('pctFijos', fmtPct(opex.totalFijos / opex.total * 100));
  setEl('totalVarMes', fmtCOP(opex.totalVars));
  setEl('totalVarAnio', fmtCOP(opex.totalVars * 12));
  setEl('pctVariables', fmtPct(opex.totalVars / opex.total * 100));
  setEl('totalOpexMes', fmtCOP(opex.total));
  setEl('totalOpexAnio', fmtCOP(opex.total * 12));
  const ing = calcIngresos(s);
  setEl('opexPorM2', fmtCOP(opex.total / (s.area_bodega + s.area_patio)));
  setEl('opexPorM2Anio', fmtCOP(opex.total * 12 / (s.area_bodega + s.area_patio)));
  setEl('opexPctIngresos', fmtPct(opex.total * 12 / (ing.total * 12) * 100));
}

function renderTableIngresos(s) {
  const ing = calcIngresos(s);
  const tbody = $('tbodyIngresos');
  if (!tbody) return;
  const rows = [
    { name: 'Almacenamiento Bodega', base: `${fmt(s.area_bodega * s.ocupacion)} m² × ${fmtCOP(s.tarifa_alm)}/m²`, mes: ing.almacenamientoBodega, anio: ing.almacenamientoBodega * 12 },
    { name: 'Almacenamiento Patio', base: `${fmt(s.area_patio * s.ocupacion)} m² × ${fmtCOP(s.tarifa_patio)}/m²`, mes: ing.almacenamientoPatio, anio: ing.almacenamientoPatio * 12 },
    { name: 'Tránsito Aduanero DTA', base: `${fmt(s.ops_dta)} ops × ${fmtCOP(s.tarifa_dta)}/op`, mes: ing.dta, anio: ing.dta * 12 },
    { name: 'Aprobación de Documentos', base: `${fmt(s.ops_dta)} ops × ${fmtCOP(s.tarifa_docs)}/doc`, mes: ing.docs, anio: ing.docs * 12 },
    { name: 'Cross-Docking (40% de operaciones)', base: `${fmt(s.ops_dta * 0.4)} ops × ${fmtCOP(s.tarifa_cd)}/op`, mes: ing.crossDocking, anio: ing.crossDocking * 12 },
    { name: 'Servicios de valor agregado', base: '8% sobre almacenamiento total', mes: ing.valorAgregado, anio: ing.valorAgregado * 12 }
  ];
  tbody.innerHTML = rows.map(r => `<tr>
    <td>${r.name}</td>
    <td style="color:var(--text-muted);font-size:12px">${r.base}</td>
    <td class="highlight-cell">${fmtCOP(r.mes)}</td>
    <td>${fmtCOP(r.anio)}</td>
    <td>${fmtPct(r.mes / ing.total * 100)}</td>
  </tr>`).join('');
  $('totalIngresosMes').textContent = fmtCOP(ing.total);
  $('totalIngresosAnio').textContent = fmtCOP(ing.total * 12);
}

function renderTableProyecciones(proj, s) {
  const header = $('headerProyecciones');
  const tbody = $('tbodyProyecciones');
  if (!header || !tbody) return;

  header.innerHTML = `<th style="min-width:180px">Concepto</th>` + proj.map(r => `<th style="text-align:right;min-width:110px">Año ${r.year}</th>`).join('');

  const rows = [
    { label: '💰 Ingresos Totales', data: proj.map(r => r.ingresos), fmt: fmtCOP, cls: 'highlight-cell' },
    { label: '⚡ OPEX Total', data: proj.map(r => r.opexAnual), fmt: fmtCOP, cls: 'num-neg' },
    { label: '📊 EBITDA', data: proj.map(r => r.ebitda), fmt: fmtCOP, cls: 'highlight-cell' },
    { label: '   Margen EBITDA %', data: proj.map(r => r.margenEbitda * 100), fmt: v => fmtPct(v), cls: '' },
    { label: '🔧 Depreciación', data: proj.map(r => r.dep), fmt: fmtCOP, cls: 'num-neg' },
    { label: 'EBIT (Resultado Operativo)', data: proj.map(r => r.ebit), fmt: fmtCOP, cls: '' },
    { label: '🏛️ Impuesto Renta (ZF 20%)', data: proj.map(r => r.imp), fmt: fmtCOP, cls: 'num-neg' },
    { label: '✅ Utilidad Neta', data: proj.map(r => r.utilidadNeta), fmt: fmtCOP, cls: v => v >= 0 ? 'num-pos' : 'num-neg' },
    { label: '💵 Flujo de Caja Libre', data: proj.map(r => r.fcLibre), fmt: fmtCOP, cls: v => v >= 0 ? 'num-pos' : 'num-neg' },
    { label: '📈 FCL Acumulado', data: proj.map(r => r.fcAcum), fmt: fmtCOP, cls: v => v >= 0 ? 'num-pos' : 'num-neg' }
  ];

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td style="font-size:12px;color:var(--text-secondary)">${row.label}</td>
      ${row.data.map(v => {
    const cls = typeof row.cls === 'function' ? row.cls(v) : row.cls;
    return `<td class="${cls}" style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px">${row.fmt(v)}</td>`;
  }).join('')}
    </tr>
  `).join('');
}

// ─── TABLA COMPARACIÓN ESCENARIOS ────────────────────────────
function renderScenariosComparison() {
  const tbody = $('tbodyScenarios');
  if (!tbody) return;

  const calcs = {};
  ['conservador', 'base', 'optimista'].forEach(k => {
    const s = buildSupuestos(SCENARIOS[k]);
    calcs[k] = calcFinancials(s);
    calcs[k].ing = calcIngresos(s);
    calcs[k].opex = calcOpex(s);
  });

  const rows = [
    { label: '📊 Ingresos Año 1', fn: c => fmtCOP(c.ing.total * 12) },
    { label: '⚡ OPEX Año 1', fn: c => fmtCOP(c.opex.total * 12) },
    { label: '💰 EBITDA Año 1', fn: c => fmtCOP(c.proj[0].ebitda) },
    { label: '   Margen EBITDA Año 1', fn: c => fmtPct(c.proj[0].margenEbitda * 100) },
    { label: '📈 VAN (10 años)', fn: c => fmtCOP(c.van) },
    { label: '🎯 TIR', fn: c => fmtPct(c.tir * 100) },
    { label: '⏱️ Payback (años)', fn: c => c.payback > 0 ? c.payback + ' años' : '>10' },
    { label: '🏗️ CAPEX Total', fn: c => fmtCOP(c.capex) }
  ];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td style="color:#f87171">${r.fn(calcs.conservador)}</td>
      <td class="num-neu">${r.fn(calcs.base)}</td>
      <td style="color:#22c55e">${r.fn(calcs.optimista)}</td>
    </tr>
  `).join('');
}

// ─── MATRIZ SENSIBILIDADES ────────────────────────────────────
function renderSensitivityMatrices(s) {
  // Matriz 1: % Ocupación vs VAN
  const ocupaciones = [40, 50, 60, 70, 80, 90, 100];
  const tarifas = [10000, 12400, 15000, 18000, 23500];

  let html1 = '<table class="matrix-table"><thead><tr><th>Ocup. \\ Tarifa</th>';
  tarifas.forEach(t => { html1 += `<th>${fmtCOP(t)}/m²</th>`; });
  html1 += '</tr></thead><tbody>';

  ocupaciones.forEach(oc => {
    html1 += `<tr><th>${oc}%</th>`;
    tarifas.forEach(tar => {
      const sTest = { ...s, ocupacion: oc / 100, tarifa_alm: tar };
      const fin = calcFinancials(sTest);
      const van = fin.van / 1e9;
      const cls = van < 0 ? 'heat-cold' : van < 1 ? 'heat-cool' : van < 3 ? 'heat-mid' : van < 6 ? 'heat-warm' : 'heat-hot';
      html1 += `<td class="${cls}">${fmt(van, 1)} B</td>`;
    });
    html1 += '</tr>';
  });
  html1 += '</tbody></table>';
  $('matrixOcupacion').innerHTML = html1;

  // Matriz 2: Tarifa vs Margen EBITDA
  const waccs = [10, 12, 13.24, 15, 18];
  let html2 = '<table class="matrix-table"><thead><tr><th>Ocup. \\ WACC</th>';
  waccs.forEach(w => { html2 += `<th>${fmtPct(w)}</th>`; });
  html2 += '</tr></thead><tbody>';

  ocupaciones.forEach(oc => {
    html2 += `<tr><th>${oc}%</th>`;
    waccs.forEach(ww => {
      const sTest = { ...s, ocupacion: oc / 100, wacc: ww / 100 };
      const fin = calcFinancials(sTest);
      const m = fin.proj[0].margenEbitda * 100;
      const cls = m < 10 ? 'heat-cold' : m < 20 ? 'heat-cool' : m < 30 ? 'heat-mid' : m < 45 ? 'heat-warm' : 'heat-hot';
      html2 += `<td class="${cls}">${fmtPct(m)}</td>`;
    });
    html2 += '</tr>';
  });
  html2 += '</tbody></table>';
  $('matrixTarifa').innerHTML = html2;
}

// ─── BREAKEVEN ────────────────────────────────────────────────
function renderBreakeven(s) {
  const be = calcBreakeven(s);
  const beOcEl = $('beOcupacion');
  const beInEl = $('beIngresos');
  const beMarEl = $('beMargen');
  const beOpsEl = $('beOps');
  if (beOcEl) beOcEl.textContent = fmtPct(be.beOcupacion);
  if (beInEl) beInEl.textContent = fmtCOP(be.beIngresos);
  if (beMarEl) beMarEl.textContent = fmtPct(be.margenSeguridad);
  if (beOpsEl) beOpsEl.textContent = be.beOps + ' ops/año';
}

// ─── HELPER: convertir SCENARIO obj a supuestos normalizados ─
function buildSupuestos(sc) {
  return {
    inflacion: sc.inflacion / 100,
    trm: sc.trm,
    ipp: sc.ipp / 100,
    tasa_zf: sc.tasa_zf / 100,
    wacc: sc.wacc / 100,
    margen: sc.margen / 100,
    horizonte: sc.horizonte,
    vida_util: sc.vida_util,
    area_bodega: sc.area_bodega,
    area_patio: sc.area_patio,
    ocupacion: sc.ocupacion / 100,
    ops_dta: sc.ops_dta,
    rotacion: sc.rotacion,
    tarifa_alm: sc.tarifa_alm,
    tarifa_patio: sc.tarifa_patio,
    tarifa_dta: sc.tarifa_dta,
    tarifa_docs: sc.tarifa_docs,
    tarifa_cd: sc.tarifa_cd
  };
}

// ─── GUARDAR ESTADO DEL ESCENARIO ACTUAL ──────────────────────
function saveCurrentScenario() {
  if (!currentScenario || !SCENARIOS[currentScenario]) return;
  const sc = SCENARIOS[currentScenario];
  Object.keys(sc).forEach(key => {
    const inp = $('s_' + key);
    if (inp) {
      sc[key] = parseFloat(inp.value) || sc[key];
    }
  });
}

// ─── APLICAR ESCENARIO PREDEFINIDO ────────────────────────────
function applyScenario(name, savePrevious = true) {
  // 1. Guardar los ajustes manuales en el escenario que estamos abandonando (si aplica)
  if (savePrevious) {
    saveCurrentScenario();
  }

  // 2. Cambiar al nuevo escenario
  currentScenario = name;
  const sc = SCENARIOS[name];
  
  // 3. Cargar los valores en la UI
  Object.entries(sc).forEach(([key, val]) => {
    const inp = $('s_' + key);
    const sl = $('sl_' + key);
    if (inp) inp.value = val;
    if (sl) sl.value = val;

    // Actualizar las etiquetas de texto de ayuda
    const lblEl = $('lbl_' + key);
    if (lblEl) {
      if (['tarifa_alm', 'tarifa_patio', 'tarifa_dta', 'tarifa_docs', 'tarifa_cd'].includes(key)) {
        lblEl.textContent = '$' + new Intl.NumberFormat('es-CO').format(val);
      } else if (['ops_dta'].includes(key)) {
        lblEl.textContent = val + ' ops';
      } else if (['rotacion'].includes(key)) {
        lblEl.textContent = val + '×/año';
      } else if (['trm'].includes(key)) {
        lblEl.textContent = new Intl.NumberFormat('es-CO').format(val);
      } else if (['area_bodega', 'area_patio'].includes(key)) {
        lblEl.textContent = new Intl.NumberFormat('es-CO').format(val) + ' m²';
      } else if (['horizonte', 'vida_util'].includes(key)) {
        lblEl.textContent = val + ' años';
      } else {
        lblEl.textContent = val + '%';
      }
    }
  });
  
  // 4. Recalcular todo el modelo con los nuevos valores
  recalculate();
}

// ─── SUPABASE: GUARDAR Y CARGAR ────────────────────────────────
function saveToSupabase() {
  if (!sbClient) return;

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const s = readSupuestos();
    const { error } = await sbClient
      .from('scenarios')
      .upsert({
        name: currentScenario,
        data: s,
        updated_at: new Date().toISOString()
      }, { onConflict: 'name' });

    if (error) console.error("Error guardando en Supabase:", error);
    else console.log(`Escenario "${currentScenario}" guardado en la nube.`);
  }, 1000); 
}

async function loadFromSupabase() {
  if (!sbClient) return;
  console.log("Cargando datos desde la nube...");

  const { data, error } = await sbClient
    .from('scenarios')
    .select('*');

  if (error) {
    console.error("Error cargando desde Supabase:", error);
  } else if (data && data.length > 0) {
    data.forEach(dbSc => {
      if (SCENARIOS[dbSc.name]) {
        SCENARIOS[dbSc.name] = { ...SCENARIOS[dbSc.name], ...dbSc.data };
      }
    });
    applyScenario(currentScenario, false);
  }

  // --- SUSCRIPCIÓN EN TIEMPO REAL ---
  // Suscribirse a cambios en la tabla 'scenarios' para sincronizar dispositivos
  sbClient
    .channel('public:scenarios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'scenarios' }, payload => {
      console.log('Cambio detectado en tiempo real:', payload);
      const newSc = payload.new;
      if (newSc && SCENARIOS[newSc.name]) {
        SCENARIOS[newSc.name] = { ...SCENARIOS[newSc.name], ...newSc.data };
        // Si el cambio es del escenario que estamos viendo, actualizar la UI
        if (newSc.name === currentScenario) {
          applyScenario(currentScenario, false);
        }
      }
    })
    .subscribe();
}

// ─── RECALCULAR TODO ─────────────────────────────────────────
function recalculate() {
  const s = readSupuestos();
  const fin = calcFinancials(s);
  const ing = calcIngresos(s);
  const opex = calcOpex(s);

  renderKPIs(fin, s);
  renderChartProyeccion(fin.proj);
  renderChartFCL(fin.proj, fin.capex);
  renderChartIngresos(ing);
  renderChartCostos();
  renderTableCapex(s);
  renderTableOpex(s);
  renderTableIngresos(s);
  renderTableProyecciones(fin.proj, s);
  renderChartCapexPie();
  renderChartOpexPie(opex);
  renderChartIngresosBar(ing);
  renderChartPG(fin.proj);
  renderChartMargenEbitda(fin.proj);
  renderChartTornado(s);
  renderSensitivityMatrices(s);
  renderBreakeven(s);
  renderScenariosComparison();

  // Auto-guardado en Supabase (si está disponible)
  saveToSupabase();
}

// ─── EXPORTAR A EXCEL ─────────────────────────────────────────
function exportToExcel() {
  const s = readSupuestos();
  const fin = calcFinancials(s);
  const ing = calcIngresos(s);
  const opex = calcOpex(s);
  const wb = XLSX.utils.book_new();

  // Hoja 1: Supuestos
  const supData = [
    ['MODELO FINANCIERO MIDSTREAM — ZONA FRANCA COLOMBIA'],
    ['Elaborado con MidStream FX | Fuente: CREG, Zofranca, Ocensa, Cenit'],
    [],
    ['Variable', 'Valor', 'Unidad'],
    ['Inflación anual', s.inflacion * 100, '%'],
    ['TRM (COP/USD)', s.trm, 'COP'],
    ['IPP proyectado', s.ipp * 100, '%'],
    ['Tasa impuesto renta ZF', s.tasa_zf * 100, '%'],
    ['WACC / Tasa descuento', s.wacc * 100, '%'],
    ['Margen utilidad (capital)', s.margen * 100, '%'],
    ['Horizonte proyección', s.horizonte, 'años'],
    ['Vida útil activos', s.vida_util, 'años'],
    ['Área de bodega', s.area, 'm²'],
    ['% Ocupación promedio', s.ocupacion * 100, '%'],
    ['# Operaciones DTA/mes', s.ops_dta, 'ops'],
    ['Rotación inventario', s.rotacion, 'veces/año'],
    ['Tarifa almacenamiento', s.tarifa_alm, 'COP/m²/mes'],
    ['Tarifa DTA por operación', s.tarifa_dta, 'COP'],
    ['Tarifa aprobación docs', s.tarifa_docs, 'COP'],
    ['Tarifa cross-docking', s.tarifa_cd, 'COP/op']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(supData), 'Supuestos');

  // Hoja 2: CAPEX
  const capexData = [
    ['INVERSIÓN INICIAL (CAPEX)'],
    [],
    ['Concepto', 'Cantidad', 'Costo Unit (COP)', 'Total (COP)', 'Notas'],
    ...CAPEX_ITEMS.map(i => [i.name, i.qty, i.unitCost, i.qty * i.unitCost, i.note]),
    [],
    ['TOTAL CAPEX (COP)', '', '', fin.capex],
    ['TOTAL CAPEX (USD @ TRM)', '', '', fin.capex / s.trm]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(capexData), 'CAPEX');

  // Hoja 3: OPEX
  const opexData = [
    ['COSTOS OPERATIVOS MENSUALES (OPEX)'],
    [],
    ['Concepto', 'COP/mes', 'COP/año', 'Referencia'],
    ['=== COSTOS FIJOS ==='],
    ...OPEX_FIXED.map(r => [r.name, r.monthly, r.monthly * 12, r.ref]),
    ['SUBTOTAL FIJOS', opex.totalFijos, opex.totalFijos * 12],
    ['=== COSTOS VARIABLES ==='],
    ...OPEX_VAR.map(r => [r.name, r.monthly, r.monthly * 12, r.ref]),
    ['SUBTOTAL VARIABLES', opex.totalVars, opex.totalVars * 12],
    [],
    ['TOTAL OPEX MENSUAL', opex.total, opex.total * 12]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opexData), 'OPEX');

  // Hoja 4: Ingresos
  const ingData = [
    ['ESTRUCTURA DE INGRESOS'],
    [],
    ['Línea de Servicio', 'COP/mes', 'COP/año', '% Total'],
    ['Almacenamiento', ing.almacenamiento, ing.almacenamiento * 12, (ing.almacenamiento / ing.total * 100).toFixed(1) + '%'],
    ['Tránsito DTA', ing.dta, ing.dta * 12, (ing.dta / ing.total * 100).toFixed(1) + '%'],
    ['Aprobación documentos', ing.docs, ing.docs * 12, (ing.docs / ing.total * 100).toFixed(1) + '%'],
    ['Cross-Docking', ing.crossDocking, ing.crossDocking * 12, (ing.crossDocking / ing.total * 100).toFixed(1) + '%'],
    ['Valor Agregado', ing.valorAgregado, ing.valorAgregado * 12, (ing.valorAgregado / ing.total * 100).toFixed(1) + '%'],
    [],
    ['TOTAL INGRESOS', ing.total, ing.total * 12, '100%']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ingData), 'Ingresos');

  // Hoja 5: Proyecciones P&G 10 años
  const projHeader = ['Concepto', ...fin.proj.map(r => 'Año ' + r.year)];
  const projData = [
    ['PROYECCIONES FINANCIERAS 10 AÑOS'],
    [],
    projHeader,
    ['Ingresos Totales', ...fin.proj.map(r => r.ingresos)],
    ['OPEX Total', ...fin.proj.map(r => r.opexAnual)],
    ['EBITDA', ...fin.proj.map(r => r.ebitda)],
    ['Margen EBITDA %', ...fin.proj.map(r => (r.margenEbitda * 100).toFixed(1) + '%')],
    ['Depreciación', ...fin.proj.map(r => r.dep)],
    ['EBIT', ...fin.proj.map(r => r.ebit)],
    ['Impuesto Renta (ZF 20%)', ...fin.proj.map(r => r.imp)],
    ['Utilidad Neta', ...fin.proj.map(r => r.utilidadNeta)],
    ['Flujo de Caja Libre', ...fin.proj.map(r => r.fcLibre)],
    ['FCL Acumulado', ...fin.proj.map(r => r.fcAcum)]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(projData), 'Proyecciones');

  // Hoja 6: Indicadores
  const indData = [
    ['INDICADORES FINANCIEROS CLAVE'],
    [],
    ['Indicador', 'Valor', 'Referencia Sector'],
    ['VAN (10 años)', fin.van, 'Positivo = viable'],
    ['TIR', (fin.tir * 100).toFixed(2) + '%', 'WACC ref. CREG 13.24%'],
    ['WACC utilizado', (s.wacc * 100).toFixed(2) + '%', 'CREG Colombia'],
    ['Payback descontado', fin.payback > 0 ? fin.payback + ' años' : '>10', '< 7 años es bueno'],
    ['EBITDA Año 1', fin.proj[0].ebitda, ''],
    ['Margen EBITDA Año 1', (fin.proj[0].margenEbitda * 100).toFixed(1) + '%', 'Ocensa 87%, Cenit 40%'],
    ['ROACE estimado', (fin.tir * 100).toFixed(2) + '%', 'Objetivo Ecopetrol 8-10%'],
    ['CAPEX Total', fin.capex, ''],
    ['Depreciación anual', fin.capex / s.vida_util, '≈11% ingresos (referencia)'],
    ['Tasa impositiva ZF', '20%', 'vs 35% régimen ordinario']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indData), 'Indicadores');

  // Hoja 7: Sensibilidades
  const sensData = [
    ['ANÁLISIS DE SENSIBILIDAD — VAN según % Ocupación y Tarifa Almacenamiento'],
    [],
    ['Ocupación \\ Tarifa', '10,000', '12,400', '15,000', '18,000', '23,500'],
    ...[40, 50, 60, 70, 80, 90, 100].map(oc => {
      return [`${oc}%`, ...[10000, 12400, 15000, 18000, 23500].map(tar => {
        const sT = { ...s, ocupacion: oc / 100, tarifa_alm: tar };
        return calcFinancials(sT).van.toFixed(0);
      })];
    })
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sensData), 'Sensibilidades');

  XLSX.writeFile(wb, 'ModeloFinanciero_Midstream_ZF_Colombia.xlsx');
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Primero intentamos cargar desde la nube
  if (sbClient) {
    await loadFromSupabase();
  }
  // Luego calculamos todo por primera vez
  recalculate();
});
