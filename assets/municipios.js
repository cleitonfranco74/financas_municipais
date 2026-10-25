/* Finanças municipais da Amazônia Legal, de Goiás e de Mato Grosso do Sul (municipios.html), a partir de
 * data/municipios.json (scripts/atualizar_municipios.py). Valores do arquivo em R$ mil correntes; a página
 * leva tudo a preços do último ano pelo IPCA e divide pela população do ano. */
(() => {
  const $ = s => document.querySelector(s);
  const main = $("#conteudo"), ctl = $("#ctl");
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nf = (x, d = 0) => x == null || !isFinite(x) ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => x == null || !isFinite(x) ? "—" : `${x < 0 ? "−" : ""}${nf(Math.abs(x) * 100, d)}%`;
  const brl = x => x == null || !isFinite(x) ? "—" : `${x < 0 ? "−" : ""}R$ ${nf(Math.abs(x))}`;
  /* reais → "R$ 1,34 bi", "R$ 957 mi", "R$ 12,3 mil" */
  const brlC = x => {
    if (x == null || !isFinite(x)) return "—";
    const a = Math.abs(x), [v, u] = a >= 1e9 ? [a / 1e9, "bi"] : a >= 1e6 ? [a / 1e6, "mi"] : a >= 1e3 ? [a / 1e3, "mil"] : [a, ""];
    return `${x < 0 ? "−" : ""}R$ ${nf(v, v >= 100 || !u ? 0 : v >= 10 ? 1 : 2)}${u ? " " + u : ""}`;
  };
  const media = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

  /* ---------- escala ideológica (Bolognesi, Ribeiro, Codato e Silva, 2025) ---------- */
  const CATS = [
    ["eesq", "Extrema esquerda", 1.5, "#b91c1c"], ["esq", "Esquerda", 3, "#ef4444"], ["cesq", "Centro-esquerda", 4.5, "#fb923c"],
    ["centro", "Centro", 5.5, "#a1a1aa"], ["cdir", "Centro-direita", 7, "#93c5fd"], ["dir", "Direita", 8.5, "#3b82f6"], ["edir", "Extrema direita", 99, "#1e3a8a"]];
  const MODOS = {
    "7": CATS.map(([k, n, , c]) => ({ k, n, c })),
    "4": [{ k: "esq", n: "Esquerda", c: "#ef4444", de: ["eesq", "esq"] }, { k: "cesq", n: "Centro-esquerda", c: "#fb923c", de: ["cesq"] },
          { k: "centro", n: "Centro", c: "#a1a1aa", de: ["centro"] }, { k: "cdir", n: "Centro-direita", c: "#93c5fd", de: ["cdir"] },
          { k: "dir", n: "Direita", c: "#3b82f6", de: ["dir", "edir"] }],
    "2": [{ k: "esq", n: "Esquerda e centro-esquerda", c: "#ef4444", de: ["eesq", "esq", "cesq"] }, { k: "dir", n: "Direita e centro-direita", c: "#3b82f6", de: ["cdir", "dir", "edir"] }],
  };
  const SEM = { k: "sd", n: "Sem classificação", c: "#52525b" };
  let D, M = [], ANOS = [], REF = null;
  const st = { aba: "geral", uf: "", modo: "4", met: "invpc", mun: null, x: "peso", y: "inv", h: 20, rddE: "2016+2020", rddY: "inv", rddC: "ideo", ord: "invpc", comp: [],
    fn: "10", polY: "invpc", polY2: "convEpc", amX: "expansao", amY: "desm", resX: "saude", resY: "tmi", mapa: "orient", cmet: "invpc", corr: "p", cxy: "6-3", cvar: "6",
    regY: "6", regX: [0, 1, 2, 3], regUF: true, regZ: false, mapaModo: "v" };

  const nota = sg => { if (!sg) return null; const s = sg.trim().toUpperCase(); return D.escala[D.sinonimos[s] || s] ?? null; };
  const cat7 = sc => sc == null ? null : CATS.find(c => sc <= c[2])[0];
  const grupo = sc => { const c = cat7(sc); if (!c) return SEM; return MODOS[st.modo].find(g => (g.de || [g.k]).includes(c)) || SEM; };
  const eleicaoDo = a => a <= 2016 ? "2012" : a <= 2020 ? "2016" : a <= 2024 ? "2020" : "2024";
  const MANDATO = { "2012": "2013–2016", "2016": "2017–2020", "2020": "2021–2024", "2024": "2025–2028" };

  /* ---------- derivados de cada município ---------- */
  const deflator = a => D.ipca[REF] && D.ipca[a] ? D.ipca[REF] / D.ipca[a] : 1;
  function prepara(){
    const anosFin = new Set();
    D.municipios.forEach(m => Object.keys(m.fin || {}).forEach(a => anosFin.add(+a)));
    ANOS = [...anosFin].filter(a => a >= 2016).sort();
    REF = String(ANOS[ANOS.length - 1]);
    M = D.municipios.map(m => {
      const pib = Object.entries(m.pib || {}).filter(([, v]) => v && v[0] > 0 && v[1] != null).slice(-3);
      const peso = pib.length ? media(pib.map(([, v]) => v[1] / v[0])) : null;
      const agroAnos = Object.keys(m.agro || {}).sort();
      const area = a => a && m.agro[a] ? m.agro[a][0] + m.agro[a][1] + m.agro[a][2] : null;
      const a0 = agroAnos.find(a => +a >= 2016), a1 = agroAnos[agroAnos.length - 1];
      return { ...m, peso, perfil: peso == null ? null : peso >= .3 ? "forte" : peso >= .15 ? "medio" : "baixo",
        area0: area(a0), area1: area(a1), anoAgro: a1,
        // valores do ano em reais de REF; rc segue D.rc_nomes; fn é a despesa por função
        f: Object.fromEntries(Object.entries(m.fin || {}).map(([a, v]) => {
          const d = 1e3 * deflator(a), rc = m.rc?.[a], fn = m.fn?.[a];
          return [a, { rec: v[0] * d, tr: v[1] * d, trib: v[2] * d, desp: v[3] * d, inv: v[4] * d, pop: m.pop?.[a] || null,
            rc: rc ? rc.map(x => x * d) : null, conv: rc ? (rc[6] + rc[7] + rc[8]) * d : null, convE: rc ? rc[7] * d : null,
            fn: fn ? Object.fromEntries(Object.entries(fn).map(([k, x]) => [k, x * d])) : null, lrf: m.lrf?.[a] || null }];
        })) };
    });
  }
  const sigla = sg => { const s = (sg || "").trim().toUpperCase(); return D.sinonimos[s] || s; };
  /* partido do governador em exercício no ano (eleito em 2014 governa 2015–2018, e assim por diante) */
  const govDo = (uf, a) => { const e = a <= 2018 ? "2014" : a <= 2022 ? "2018" : "2022"; return D.gov?.[uf]?.[e] || null; };
  const alinhado = (m, a) => { const e = m.ele?.[eleicaoDo(+a)], g = govDo(m.uf, +a); return e && g ? sigla(e[0]) === sigla(g) : null; };
  const PERFIS = [{ k: "forte", n: "Agro forte (≥ 30% do PIB)", c: "#22c55e" }, { k: "medio", n: "Agro médio (15% a 30%)", c: "#a3e635" }, { k: "baixo", n: "Pouco agro (< 15%)", c: "#71717a" }];
  const sel = () => M.filter(m => !st.uf || m.uf === st.uf);
  const scoreAno = (m, a) => { const e = m.ele?.[eleicaoDo(+a)]; return e ? nota(e[0]) : null; };

  /* indicadores agregados (razão de somas, ou seja, ponderados pela população ou pela receita) */
  const MET = {
    invpc: { n: "Investimento por habitante", f: brl, num: x => x.inv, den: x => x.pop, k: 1 },
    invdesp: { n: "Investimento em % da despesa", f: v => pct(v), num: x => x.inv, den: x => x.desp, k: 1 },
    recpc: { n: "Receita por habitante", f: brl, num: x => x.rec, den: x => x.pop, k: 1 },
    tribpc: { n: "Receita tributária própria por habitante", f: brl, num: x => x.trib, den: x => x.pop, k: 1 },
    transf: { n: "Transferências em % da receita", f: v => pct(v), num: x => x.tr, den: x => x.rec, k: 1 },
    convpc: { n: "Transferências voluntárias por habitante", f: brl, num: x => x.conv, den: x => x.pop, k: 1, extra: true },
  };
  // indicadores que não aparecem na visão geral, mas servem às outras abas
  const MET_EXTRA = {
    convEpc: { n: "Convênios do estado por habitante", f: brl, num: x => x.convE, den: x => x.pop },
    saudepc: { n: "Saúde por habitante", f: brl, num: x => x.fn?.["10"], den: x => x.pop },
    educpc: { n: "Educação por habitante", f: brl, num: x => x.fn?.["12"], den: x => x.pop },
    desppc: { n: "Despesa por habitante", f: brl, num: x => x.desp, den: x => x.pop },
    convUpc: { n: "Transferências voluntárias da União por habitante", f: brl, num: x => x.rc ? x.rc[6] + x.rc[8] : null, den: x => x.pop },
  };
  Object.assign(MET, MET_EXTRA);
  const agrega = (ms, a, met) => {
    let n = 0, d = 0, c = 0;
    ms.forEach(m => { const x = m.f[a]; if (!x || !x.pop) return; const nv = MET[met].num(x), dv = MET[met].den(x); if (nv == null || !dv) return; n += nv; d += dv; c++; });
    return d > 0 ? { v: n / d, n: c } : { v: null, n: c };
  };
  const indiv = (m, a, met) => { const x = m.f[a]; if (!x || !x.pop) return null; const nv = MET[met].num(x), dv = MET[met].den(x); return nv != null && dv > 0 ? nv / dv : null; };

  /* ---------- gráficos SVG ---------- */
  const largura = () => Math.max(300, Math.min(1100, (main.clientWidth || 700) - 50));
  function linhas(series, { anos, fmt, alto = 260, w = largura() }){
    const pl = 64, pr = 12, pt = 14, pb = 26, xs = anos.map(String);
    const vals = series.flatMap(s => xs.map(a => s.v[a]).filter(v => v != null && isFinite(v)));
    if (!vals.length) return `<p class="nota">Sem dados para o recorte escolhido.</p>`;
    let lo = Math.min(0, ...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 1;
    const X = i => pl + (xs.length === 1 ? 0 : i * (w - pl - pr) / (xs.length - 1)), Y = v => pt + (hi - v) / (hi - lo) * (alto - pt - pb);
    const ticks = [0, .25, .5, .75, 1].map(t => lo + t * (hi - lo));
    const grade = ticks.map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("");
    const eixo = xs.map((a, i) => (xs.length <= 12 || i % 2 === 0) ? `<text class="ax" x="${X(i)}" y="${alto - 6}" text-anchor="middle">${w < 520 ? "’" + a.slice(2) : a}</text>` : "").join("");
    const ls = series.map(s => {
      const pts = xs.map((a, i) => s.v[a] != null && isFinite(s.v[a]) ? [X(i), Y(s.v[a]), a, s.v[a]] : null);
      let d = "", on = false;
      pts.forEach(p => { if (!p){ on = false; return; } d += `${on ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; on = true; });
      return `<path d="${d}" fill="none" stroke="${s.c}" stroke-width="2.4" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ""}/>` +
        pts.filter(Boolean).map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${s.c}"><title>${esc(s.n)} · ${p[2]}: ${esc(fmt(p[3]))}</title></circle>`).join("");
    }).join("");
    return `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Gráfico de linhas">${grade}${eixo}${ls}</svg>` +
      `<div class="leg">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join("")}</div>`;
  }
  function dispersao(pts, { fx, fy, nx, ny, reta = true, alto = 340, w = largura(), corte = null }){
    const ok = pts.filter(p => isFinite(p.x) && isFinite(p.y));
    if (ok.length < 3) return `<p class="nota">Poucos municípios com dados para este gráfico.</p>`;
    const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
    // corta os 1% extremos de cada eixo na escala do gráfico (os pontos ficam na borda)
    const xl = q(ok.map(p => p.x), .01), xh = q(ok.map(p => p.x), .99), yl = Math.min(0, q(ok.map(p => p.y), .01)), yh = q(ok.map(p => p.y), .99);
    const pl = 62, pr = 12, pt = 12, pb = 34;
    const X = v => pl + (Math.min(xh, Math.max(xl, v)) - xl) / ((xh - xl) || 1) * (w - pl - pr), Y = v => pt + (yh - Math.min(yh, Math.max(yl, v))) / ((yh - yl) || 1) * (alto - pt - pb);
    const tk = (lo, hi) => [0, .25, .5, .75, 1].map(t => lo + t * (hi - lo));
    let g = tk(yl, yh).map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(fy(t))}</text>`).join("");
    g += tk(xl, xh).map(t => `<text class="ax" x="${X(t)}" y="${alto - 16}" text-anchor="middle">${esc(fx(t))}</text>`).join("");
    g += `<text class="ax" x="${(pl + w - pr) / 2}" y="${alto - 2}" text-anchor="middle">${esc(nx)}</text>`;
    if (corte != null) g += `<line x1="${X(corte)}" x2="${X(corte)}" y1="${pt}" y2="${alto - pb}" stroke="var(--ink-2)" stroke-dasharray="4 4"/>`;
    const c = ok.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.r || 3.6}" fill="${p.c}" fill-opacity=".72" stroke="#0008" stroke-width=".5"${p.id ? ` data-mun="${p.id}" style="cursor:pointer"` : ""}><title>${esc(p.t)}</title></circle>`).join("");
    let ln = "", r = null;
    if (reta){
      const o = ols(ok.map(p => p.x), ok.map(p => p.y));
      r = o.r;
      ln = `<line x1="${X(xl)}" y1="${Y(o.a + o.b * xl)}" x2="${X(xh)}" y2="${Y(o.a + o.b * xh)}" stroke="var(--accent)" stroke-width="2"/>`;
    }
    return { svg: `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Gráfico de dispersão: ${esc(ny)} contra ${esc(nx)}">${g}${c}${ln}</svg>`, r, n: ok.length };
  }
  function ols(x, y){
    const n = x.length, mx = media(x), my = media(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++){ sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b, r: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0 };
  }

  /* ---------- controles ---------- */
  function controles(){
    const ufs = D.ufs;
    ctl.innerHTML = `
      <label class="f"><span>Estado</span><select id="fUf"><option value="">Todos (${ufs.length} UFs)</option>${ufs.map(u => `<option ${u === st.uf ? "selected" : ""}>${u}</option>`).join("")}</select></label>
      <div class="f"><span id="lModo">Orientação do prefeito</span><div class="seg" role="group" aria-labelledby="lModo">${[["2", "Esquerda × direita"], ["4", "5 faixas"], ["7", "7 categorias"]].map(([k, n]) => `<button type="button" data-modo="${k}" aria-pressed="${st.modo === k}">${n}</button>`).join("")}</div></div>
      <span class="status">${M.length} municípios · finanças de ${ANOS[0]} a ${REF}, a preços de ${REF} (IPCA) · atualizado em ${new Date(D.atualizado + "T12:00").toLocaleDateString("pt-BR")}</span>`;
  }
  const legGrupos = () => `<div class="leg">${[...MODOS[st.modo], SEM].map(g => `<span><i style="background:${g.c}"></i>${esc(g.n)}</span>`).join("")}</div>`;
  const chipGrupo = sc => { const g = grupo(sc); return `<span class="chip"><i style="background:${g.c}"></i>${esc(g.n)}</span>`; };

  /* ---------- aba: visão geral ---------- */
  function geral(){
    const ms = sel(), a = REF;
    const k = { inv: 0, pop: 0, desp: 0, rec: 0, tr: 0, n: 0 };
    ms.forEach(m => { const x = m.f[a]; if (!x || !x.pop) return; k.inv += x.inv; k.pop += x.pop; k.desp += x.desp; k.rec += x.rec; k.tr += x.tr; k.n++; });
    const grupos = [...MODOS[st.modo], SEM];
    const series = grupos.map(g => ({ n: g.n, c: g.c, v: Object.fromEntries(ANOS.map(an => [an, agrega(ms.filter(m => grupo(scoreAno(m, an)).k === g.k), an, st.met).v])) }))
      .filter(s => Object.values(s.v).some(v => v != null));
    series.push({ n: "Todos os municípios", c: "#e4e4e7", dash: true, v: Object.fromEntries(ANOS.map(an => [an, agrega(ms, an, st.met).v])) });
    const barras = D.eleicoes.map(e => {
      const cont = {}; let tot = 0;
      ms.forEach(m => { const v = m.ele?.[e]; if (!v) return; const g = grupo(nota(v[0])); cont[g.k] = (cont[g.k] || 0) + 1; tot++; });
      return `<div class="bar-el"><span class="num">${e}</span><div class="pb">${grupos.filter(g => cont[g.k]).map(g => `<i style="width:${cont[g.k] / tot * 100}%;background:${g.c}" title="${esc(g.n)}: ${cont[g.k]} prefeituras (${pct(cont[g.k] / tot, 0)})"></i>`).join("")}</div><small>${tot} prefeituras</small></div>`;
    }).join("");
    const linhasTb = grupos.map(g => { const gs = ms.filter(m => grupo(scoreAno(m, a)).k === g.k); if (!gs.length) return "";
      const ag = met => agrega(gs, a, met).v;
      return `<tr><td><span class="chip"><i style="background:${g.c}"></i>${esc(g.n)}</span></td><td class="num">${gs.length}</td><td class="num">${brl(ag("invpc"))}</td><td class="num">${pct(ag("invdesp"))}</td><td class="num">${brl(ag("recpc"))}</td><td class="num">${pct(ag("transf"), 0)}</td></tr>`; }).join("");
    main.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Investimento em ${a}</span><b>${brlC(k.inv)}</b><small>${k.n} prefeituras com contas entregues</small></div>
        <div class="kpi"><span>Por habitante</span><b>${brl(k.pop ? k.inv / k.pop : null)}</b><small>${nf(k.pop / 1e6, 1)} milhões de habitantes</small></div>
        <div class="kpi"><span>Investimento na despesa</span><b>${pct(k.desp ? k.inv / k.desp : null)}</b><small>do total liquidado</small></div>
        <div class="kpi"><span>Dependência de transferências</span><b>${pct(k.rec ? k.tr / k.rec : null, 0)}</b><small>da receita vem da União e do estado</small></div>
      </div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>${esc(MET[st.met].n)}, por orientação do prefeito</h2><p class="sub">Cada ano usa o partido do prefeito em exercício (eleito no pleito anterior). Valores a preços de ${REF}; média ponderada pela população.</p></div>
        <div class="seg" role="group" aria-label="Indicador">${["invpc", "invdesp", "recpc", "tribpc", "transf", "convpc"].map(k2 => [k2, MET[k2]]).map(([k2, v]) => `<button type="button" data-met="${k2}" aria-pressed="${st.met === k2}">${esc(v.n.replace(" por habitante", "/hab.").replace(" em % da despesa", " % desp.").replace("Transferências em % da receita", "Transferências %").replace("Receita tributária própria", "Receita própria"))}</button>`).join("")}</div></div>
        ${linhas(series, { anos: ANOS, fmt: MET[st.met].f })}</section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Prefeituras por orientação, em cada eleição</h2><p class="sub">Partido do prefeito eleito no turno decisivo da eleição ordinária.</p><div class="els">${barras}</div>${legGrupos()}</section>
        <section class="panel"><h2>Comparação em ${a}</h2><p class="sub">Prefeituras agrupadas pela orientação do prefeito em exercício.</p>
          <div class="tbwrap"><table class="tb"><thead><tr><th>Orientação</th><th>Municípios</th><th>Invest./hab.</th><th>Invest. % desp.</th><th>Receita/hab.</th><th>Transf. %</th></tr></thead><tbody>${linhasTb}</tbody></table></div>
          <p class="nota">Diferenças entre grupos refletem também região, tamanho e economia dos municípios. Para uma leitura causal, veja a aba <b>Eleições acirradas</b>.</p></section>
      </div>`;
  }

  /* ---------- aba: agronegócio ---------- */
  const XS = {
    peso: { n: "Peso da agropecuária no PIB (%)", v: m => m.peso, f: v => pct(v, 0) },
    expansao: { n: "Expansão da área de soja, milho e algodão desde 2016 (%)", v: m => m.area0 > 500 ? m.area1 / m.area0 - 1 : null, f: v => pct(v, 0) },
    soja: { n: "Área de soja, milho e algodão por habitante (ha)", v: m => m.area1 != null && m.pop?.[m.anoAgro] ? m.area1 / m.pop[m.anoAgro] : null, f: v => nf(v, 1) },
  };
  const periodo = (m, anos, met) => { const v = anos.map(a => indiv(m, a, met)).filter(x => x != null); return v.length >= Math.ceil(anos.length / 2) ? media(v) : null; };
  const ULT = () => ANOS.filter(a => a >= 2021 && a <= 2024);
  const YS = {
    inv: { n: "Investimento por habitante, média 2021–2024", v: m => periodo(m, ULT(), "invpc"), f: brl },
    var: { n: "Variação do investimento por habitante (2017–2020 → 2021–2024)", v: m => { const a = periodo(m, ANOS.filter(x => x >= 2017 && x <= 2020), "invpc"), b = periodo(m, ULT(), "invpc"); return a > 0 && b != null ? b / a - 1 : null; }, f: v => pct(v, 0) },
    tribpc: { n: "Receita própria por habitante, média 2021–2024", v: m => periodo(m, ULT(), "tribpc"), f: brl },
    transf: { n: "Transferências em % da receita, média 2021–2024", v: m => periodo(m, ULT(), "transf"), f: v => pct(v, 0) },
  };
  function agroAba(){
    const ms = sel();
    const anosA = [...new Set(ms.flatMap(m => Object.keys(m.agro || {})))].sort();
    const soma = (a, i) => ms.reduce((s, m) => s + (m.agro?.[a]?.[i] || 0), 0);
    const ult = anosA[anosA.length - 1], pri = anosA.find(a => +a >= 2016);
    const cresc = i => soma(pri, i) > 0 ? soma(ult, i) / soma(pri, i) - 1 : null;
    const area = linhas([["Soja", 0, "#eab308"], ["Milho", 1, "#f97316"], ["Algodão", 2, "#e4e4e7"]].map(([n, i, c]) => ({ n, c, v: Object.fromEntries(anosA.map(a => [a, soma(a, i) / 1e6])) })), { anos: anosA, fmt: v => `${nf(v, 1)} mi ha`, alto: 230 });
    const boi = linhas([{ n: "Rebanho bovino", c: "#a16207", v: Object.fromEntries(anosA.map(a => [a, soma(a, 4) / 1e6])) }], { anos: anosA, fmt: v => `${nf(v, 0)} mi`, alto: 200 });
    const porPerfil = linhas(PERFIS.map(p => ({ n: p.n, c: p.c, v: Object.fromEntries(ANOS.map(a => [a, agrega(ms.filter(m => m.perfil === p.k), a, "invpc").v])) })), { anos: ANOS, fmt: brl, alto: 240 });
    // cruzamento perfil agro × orientação (prefeito do mandato 2021–2024)
    const grupos = MODOS[st.modo];
    const cel = (p, g) => { const gs = ms.filter(m => m.perfil === p.k && grupo(nota(m.ele?.["2020"]?.[0])).k === g.k); if (!gs.length) return `<td class="num">—</td>`;
      const v = media(ULT().map(a => agrega(gs, a, "invpc").v).filter(x => x != null)); return `<td class="num">${brl(v)}<br><small style="color:var(--muted)">${gs.length} mun.</small></td>`; };
    const X = XS[st.x], Y = YS[st.y];
    const pts = ms.map(m => { const sc = nota(m.ele?.["2020"]?.[0]), g = grupo(sc);
      return { x: X.v(m), y: Y.v(m), c: g.c, id: m.c, r: 2.4 + Math.min(6, Math.log10(Math.max(1000, m.pop?.[REF] || 1000)) - 2.6),
        t: `${m.n} (${m.uf}) · ${g.n}${sc != null ? ` (${nf(sc, 1)})` : ""}\n${X.n}: ${X.f(X.v(m))}\n${Y.n}: ${Y.f(Y.v(m))}` }; }).filter(p => p.x != null && p.y != null);
    const d = dispersao(pts, { fx: X.f, fy: Y.f, nx: X.n, ny: Y.n });
    main.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Soja em ${ult || "—"}</span><b>${nf(soma(ult, 0) / 1e6, 1)} mi ha</b><small>${cresc(0) != null ? `${cresc(0) >= 0 ? "+" : ""}${pct(cresc(0), 0)} desde ${pri}` : ""}</small></div>
        <div class="kpi"><span>Milho em ${ult || "—"}</span><b>${nf(soma(ult, 1) / 1e6, 1)} mi ha</b><small>${cresc(1) != null ? `${cresc(1) >= 0 ? "+" : ""}${pct(cresc(1), 0)} desde ${pri}` : ""}</small></div>
        <div class="kpi"><span>Algodão em ${ult || "—"}</span><b>${nf(soma(ult, 2) / 1e3, 0)} mil ha</b><small>${cresc(2) != null ? `${cresc(2) >= 0 ? "+" : ""}${pct(cresc(2), 0)} desde ${pri}` : ""}</small></div>
        <div class="kpi"><span>Bovinos em ${ult || "—"}</span><b>${nf(soma(ult, 4) / 1e6, 1)} mi</b><small>${cresc(4) != null ? `${cresc(4) >= 0 ? "+" : ""}${pct(cresc(4), 0)} desde ${pri}` : ""} cabeças</small></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Área colhida das lavouras</h2><p class="sub">Milhões de hectares (IBGE, Produção Agrícola Municipal).</p>${area}</section>
        <section class="panel"><h2>Rebanho bovino</h2><p class="sub">Milhões de cabeças (IBGE, Pesquisa da Pecuária Municipal).</p>${boi}</section>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Investimento por habitante, por perfil agropecuário</h2><p class="sub">Perfil pelo peso médio da agropecuária no PIB do município nos três últimos anos publicados pelo IBGE. A preços de ${REF}.</p>${porPerfil}</section>
      <section class="panel" style="margin-top:16px"><h2>Perfil agro × orientação do prefeito</h2><p class="sub">Investimento por habitante médio de 2021 a 2024 (mandato dos eleitos em 2020), a preços de ${REF}.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Perfil</th>${grupos.map(g => `<th><span class="chip"><i style="background:${g.c}"></i>${esc(g.n)}</span></th>`).join("")}</tr></thead>
        <tbody>${PERFIS.map(p => `<tr><td>${esc(p.n)}</td>${grupos.map(g => cel(p, g)).join("")}</tr>`).join("")}</tbody></table></div></section>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Cada ponto é um município</h2><p class="sub">Cor: orientação do prefeito eleito em 2020. Tamanho: população. Linha: reta de mínimos quadrados. Clique num ponto para abrir o município.</p></div></div>
        <div class="ctl" style="margin-bottom:12px">
          <label class="f"><span>Eixo horizontal</span><select id="fX">${Object.entries(XS).map(([k, v]) => `<option value="${k}" ${k === st.x ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select></label>
          <label class="f"><span>Eixo vertical</span><select id="fY">${Object.entries(YS).map(([k, v]) => `<option value="${k}" ${k === st.y ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select></label>
        </div>
        ${typeof d === "string" ? d : `${d.svg}${legGrupos()}<p class="nota">Correlação de Pearson: <b>r = ${nf(d.r, 2)}</b> com ${d.n} municípios (r² = ${nf(d.r * d.r, 2)}). ${Math.abs(d.r) < .1 ? "Praticamente sem relação linear." : Math.abs(d.r) < .3 ? "Relação linear fraca." : Math.abs(d.r) < .5 ? "Relação linear moderada." : "Relação linear forte."} Os 1% de valores extremos de cada eixo ficam na borda do gráfico.</p>`}
      </section>`;
  }

  /* ---------- aba: municípios ---------- */
  function munAba(){
    const ms = sel();
    const lista = `<datalist id="lMun">${M.map(m => `<option value="${esc(m.n)} - ${m.uf}">`).join("")}</datalist>`;
    const m = st.mun && M.find(x => x.c === st.mun);
    const busca = `<div class="ctl" style="margin-bottom:16px"><label class="f busca" style="flex:1 1 280px"><span>Município</span><input type="search" id="fMun" list="lMun" placeholder="Digite o nome, por exemplo Sinop" value="${m ? esc(`${m.n} - ${m.uf}`) : ""}"></label>${m ? `<button type="button" class="btn" data-voltar>Ver ranking</button><button type="button" class="btn" data-comp="${m.c}">${st.comp.includes(m.c) ? "Retirar do comparador" : "+ Comparar"}</button>` : ""}
      <button type="button" class="btn" data-csv=";" title="Separador ponto e vírgula e vírgula decimal">Baixar CSV (Excel)</button><button type="button" class="btn" data-csv="," title="Separador vírgula e ponto decimal">CSV (R, Stata, Python)</button>${lista}</div>`;
    if (!m){
      const ords = { invpc: "Investimento por habitante", invdesp: "Investimento em % da despesa", tribpc: "Receita própria por habitante", transf: "Dependência de transferências" };
      const rows = ms.map(x => ({ m: x, v: indiv(x, REF, st.ord) })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
      main.innerHTML = busca + comparador() + `<section class="panel"><div class="hd"><div><h2>Ranking de ${REF}</h2><p class="sub">${rows.length} municípios com contas de ${REF}${st.uf ? ` em ${st.uf}` : ""}. Clique para abrir a ficha.</p></div>
        <div class="seg" role="group" aria-label="Ordenar por">${Object.entries(ords).map(([k, n]) => `<button type="button" data-ord="${k}" aria-pressed="${st.ord === k}">${n}</button>`).join("")}</div></div>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Município</th><th>Prefeito (${MANDATO[eleicaoDo(+REF)]})</th><th>Invest./hab.</th><th>Invest. % desp.</th><th>Receita própria/hab.</th><th>Transf. %</th><th>Agro no PIB</th></tr></thead><tbody>
        ${rows.slice(0, 40).map(({ m: x }) => { const e = x.ele?.[eleicaoDo(+REF)];
          return `<tr data-mun="${x.c}" style="cursor:pointer"><td><b>${esc(x.n)}</b> <small style="color:var(--muted)">${x.uf}</small></td><td>${e ? `${esc(e[0])} ${chipGrupo(nota(e[0]))}` : "—"}</td><td class="num">${brl(indiv(x, REF, "invpc"))}</td><td class="num">${pct(indiv(x, REF, "invdesp"))}</td><td class="num">${brl(indiv(x, REF, "tribpc"))}</td><td class="num">${pct(indiv(x, REF, "transf"), 0)}</td><td class="num">${pct(x.peso, 0)}</td></tr>`; }).join("")}
        </tbody></table></div><p class="nota">Mostra os 40 primeiros. Use o filtro de estado ou a busca para encontrar outros municípios.</p></section>`;
      return;
    }
    const s = met => ({ n: MET[met].n, v: Object.fromEntries(ANOS.map(a => [a, indiv(m, a, met)])) });
    const fin = linhas([{ ...s("invpc"), c: "#c8f250" }, { ...s("tribpc"), c: "#60a5fa" }], { anos: ANOS, fmt: brl, alto: 240 });
    const anosA = Object.keys(m.agro || {}).sort();
    const ag = anosA.length ? linhas([["Soja", 0, "#eab308"], ["Milho", 1, "#f97316"], ["Algodão", 2, "#e4e4e7"]].map(([n, i, c]) => ({ n, c, v: Object.fromEntries(anosA.map(a => [a, m.agro[a][i]])) })), { anos: anosA, fmt: v => `${nf(v / 1e3, 0)} mil ha`, alto: 220 }) : `<p class="nota">Sem dados de lavouras.</p>`;
    const boi = anosA.length ? `<p class="nota">Rebanho bovino: <b>${nf(m.agro[anosA[anosA.length - 1]][4])}</b> cabeças em ${anosA[anosA.length - 1]}${m.agro[anosA[0]][4] ? ` (${pct(m.agro[anosA[anosA.length - 1]][4] / m.agro[anosA[0]][4] - 1, 0)} desde ${anosA[0]})` : ""}.</p>` : "";
    const prefeitos = D.eleicoes.map(e => { const v = m.ele?.[e]; if (!v) return `<tr><td>${MANDATO[e]}</td><td colspan="4">sem dado</td></tr>`;
      const sc = nota(v[0]), marg = v[4] && v[3] != null ? (v[1] - v[3]) / v[4] : null;
      return `<tr><td>${MANDATO[e]}</td><td><b>${esc(v[0])}</b>${m.reel?.[e] === 1 ? ' <small style="color:var(--muted)">reeleito</small>' : ""}</td><td>${chipGrupo(sc)}</td><td class="num">${sc != null ? nf(sc, 2) : "—"}</td><td class="num">${v[2] ? `${pct(marg)} sobre ${esc(v[2])}` : "candidato único"}${v[5] === 2 ? " · 2º turno" : ""}</td></tr>`; }).join("");
    const x = m.f[REF], aL = anoCom([m], y => y.lrf && y.lrf[1] != null);
    main.innerHTML = busca + comparador() + `
      <section class="panel"><h2>${esc(m.n)} <small style="color:var(--muted);font-weight:600">${m.uf}</small></h2><p class="sub">${nf(m.pop?.[REF])} habitantes em ${REF} · agropecuária ${m.peso != null ? `com ${pct(m.peso, 0)} do PIB` : "sem dado de PIB"}</p>
        <div class="kpis">
          <div class="kpi"><span>Investimento ${REF}</span><b>${brlC(x?.inv)}</b><small>${brl(indiv(m, REF, "invpc"))} por habitante</small></div>
          <div class="kpi"><span>Investimento na despesa</span><b>${pct(indiv(m, REF, "invdesp"))}</b><small>despesa de ${brlC(x?.desp)}</small></div>
          <div class="kpi"><span>Receita ${REF}</span><b>${brlC(x?.rec)}</b><small>${pct(indiv(m, REF, "transf"), 0)} de transferências</small></div>
          <div class="kpi"><span>Receita própria</span><b>${brl(indiv(m, REF, "tribpc"))}</b><small>por habitante (impostos e taxas)</small></div>
        </div></section>
      <section class="panel" style="margin-top:16px"><h2>Contas, ambiente e resultados</h2><div class="kpis" style="margin-top:10px">
          <div class="kpi"><span>Pessoal / RCL ${aL}</span><b>${m.f[aL]?.lrf?.[1] == null ? "—" : `${nf(m.f[aL].lrf[1], 1)}%`}</b><small>limite de 54% (LRF)</small></div>
          <div class="kpi"><span>Saúde fiscal ${aL}</span><b>${nf(isf(m, aL), 2)}</b><small>índice de 0 a 1 (aba Finanças públicas)</small></div>
          <div class="kpi"><span>Saúde e educação ${REF}</span><b>${brl(indiv(m, REF, "saudepc"))}</b><small>saúde por habitante; educação ${brl(indiv(m, REF, "educpc"))}</small></div>
          <div class="kpi"><span>Desmatamento PRODES</span><b>${desmAcum(m) == null ? "—" : `${nf(desmAcum(m), 1)} km²`}</b><small>acumulado ${Object.keys(m.desm || {})[0] || ""}–${Object.keys(m.desm || {}).pop() || ""}; ${nf(fogoMedio(m))} focos de queimadas por ano</small></div>
          <div class="kpi"><span>Mortalidade infantil</span><b>${nf(tmiMun(m), 1)}</b><small>por mil nascidos vivos, últimos 5 anos</small></div>
          <div class="kpi"><span>Censo 2022</span><b>${m.censo ? `${nf(m.censo[0], 0)}%` : "—"}</b><small>ligados à rede de esgoto; alfabetização ${m.censo ? `${nf(m.censo[1], 1)}%` : "—"}</small></div>
        </div></section>
      <section class="panel" style="margin-top:16px"><h2>Prefeitos</h2><p class="sub">Partido do prefeito eleito, posição na escala de 0 (esquerda) a 10 (direita) e margem sobre o segundo colocado.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Mandato</th><th>Partido</th><th>Orientação</th><th>Escala</th><th>Margem</th></tr></thead><tbody>${prefeitos}</tbody></table></div></section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Investimento e receita própria por habitante</h2><p class="sub">A preços de ${REF}.</p>${fin}</section>
        <section class="panel"><h2>Lavouras</h2><p class="sub">Área colhida (IBGE, PAM).</p>${ag}${boi}</section>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Ano a ano</h2><div class="tbwrap"><table class="tb"><thead><tr><th>Ano</th><th>Receita</th><th>Despesa</th><th>Investimento</th><th>Invest./hab.</th><th>Transf. %</th><th>Partido do prefeito</th></tr></thead><tbody>
        ${ANOS.slice().reverse().map(a => { const y = m.f[a]; const e = m.ele?.[eleicaoDo(a)]; return `<tr><td>${a}</td><td class="num">${brlC(y?.rec)}</td><td class="num">${brlC(y?.desp)}</td><td class="num">${brlC(y?.inv)}</td><td class="num">${brl(indiv(m, a, "invpc"))}</td><td class="num">${pct(indiv(m, a, "transf"), 0)}</td><td>${e ? esc(e[0]) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div><p class="nota">Valores a preços de ${REF}. Anos sem valor: a prefeitura não entregou a declaração de contas ao Tesouro.</p></section>`;
  }

  /* ---------- aba: eleições acirradas (regressão descontínua) ---------- */
  const lado = sc => sc == null ? null : sc < 4.5 ? "E" : sc > 5.5 ? "D" : null;
  const RDDY = {
    inv: { n: "Investimento por habitante, média do mandato", f: brl, v: (m, E) => periodoMandato(m, E, "invpc") },
    var: { n: "Variação do investimento por habitante: mandato − ano da eleição", f: brl, v: (m, E) => { const a = indiv(m, String(E), "invpc"), b = periodoMandato(m, E, "invpc"); return a != null && b != null ? b - a : null; } },
    invdesp: { n: "Investimento em % da despesa, média do mandato", f: v => pct(v), v: (m, E) => periodoMandato(m, E, "invdesp") },
    tribpc: { n: "Receita própria por habitante, média do mandato", f: brl, v: (m, E) => periodoMandato(m, E, "tribpc") },
    convpc: { n: "Transferências voluntárias por habitante, média do mandato", f: brl, v: (m, E) => periodoMandato(m, E, "convpc") },
    convEpc: { n: "Convênios do estado por habitante, média do mandato", f: brl, v: (m, E) => periodoMandato(m, E, "convEpc") },
  };
  /* comparação da regressão descontínua: esquerda × direita ou partido do governador × outro partido */
  const RDDC = {
    ideo: { n: "Esquerda × direita", trat: "a esquerda", ctrl: "a direita", pt: "de esquerda", pc: "de direita", eixo: "Margem da esquerda sobre a direita" },
    gov: { n: "Partido do governador × outro partido", trat: "o partido do governador", ctrl: "outro partido", pt: "do partido do governador", pc: "de outro partido", eixo: "Margem do candidato do partido do governador" },
  };
  function periodoMandato(m, E, met){ const v = [1, 2, 3, 4].map(i => indiv(m, String(E + i), met)).filter(x => x != null); return v.length ? media(v) : null; }
  function amostraRdd(){
    const eleicoes = st.rddE === "2016+2020" ? [2016, 2020] : [+st.rddE];
    const out = [];
    sel().forEach(m => eleicoes.forEach(E => {
      const v = m.ele?.[String(E)]; if (!v || !v[2] || !v[4]) return;
      let t1, t2;
      if (st.rddC === "gov"){
        // governador em exercício na eleição municipal: eleito dois anos antes
        const g = D.gov?.[m.uf]?.[String(E - 2)]; if (!g) return;
        t1 = sigla(v[0]) === sigla(g); t2 = sigla(v[2]) === sigla(g);
        if (t1 === t2) return;
      } else {
        const l1 = lado(nota(v[0])), l2 = lado(nota(v[2]));
        if (!l1 || !l2 || l1 === l2) return;
        t1 = l1 === "E";
      }
      const vE = t1 ? v[1] : v[3], vD = t1 ? v[3] : v[1];
      const x = 100 * (vE - vD) / (vE + vD), y = RDDY[st.rddY].v(m, E);
      if (y != null && isFinite(y)) out.push({ x, y, m, E });
    }));
    return out;
  }
  /* regressão linear local com núcleo triangular de cada lado do corte; erro-padrão robusto (HC1) */
  function wls(pts, h){
    const P = pts.map(p => ({ x: p.x, y: p.y, w: Math.max(0, 1 - Math.abs(p.x) / h) })).filter(p => p.w > 0);
    const n = P.length; if (n < 4) return null;
    let s0 = 0, s1 = 0, s2 = 0, t0 = 0, t1 = 0;
    P.forEach(p => { s0 += p.w; s1 += p.w * p.x; s2 += p.w * p.x * p.x; t0 += p.w * p.y; t1 += p.w * p.x * p.y; });
    const det = s0 * s2 - s1 * s1; if (Math.abs(det) < 1e-12) return null;
    const a = (s2 * t0 - s1 * t1) / det, b = (s0 * t1 - s1 * t0) / det;
    // (X'WX)^-1 X'W Ω W X (X'WX)^-1, com Ω = diag(e²) e correção n/(n-2)
    const inv = [[s2 / det, -s1 / det], [-s1 / det, s0 / det]];
    let m00 = 0, m01 = 0, m11 = 0;
    P.forEach(p => { const e = p.y - a - b * p.x, k = p.w * p.w * e * e; m00 += k; m01 += k * p.x; m11 += k * p.x * p.x; });
    const r0 = [inv[0][0] * m00 + inv[0][1] * m01, inv[0][0] * m01 + inv[0][1] * m11];
    const varA = (r0[0] * inv[0][0] + r0[1] * inv[1][0]) * n / (n - 2);
    return { a, b, ep: Math.sqrt(Math.max(0, varA)), n };
  }
  const normalP = z => { const t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2);
    const p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return 2 * p; };
  function rddAba(){
    const pts = amostraRdd(), h = st.h, Y = RDDY[st.rddY], C = RDDC[st.rddC];
    const dir = wls(pts.filter(p => p.x >= 0), h), esq = wls(pts.filter(p => p.x < 0), h);
    const tau = dir && esq ? dir.a - esq.a : null, ep = dir && esq ? Math.sqrt(dir.ep ** 2 + esq.ep ** 2) : null;
    const z = tau != null && ep ? tau / ep : null, p = z != null ? normalP(z) : null;
    // médias por faixa de 2,5 pontos para o gráfico
    const bw = Math.max(1, h / 8), bins = {};
    pts.filter(q => Math.abs(q.x) <= h).forEach(q => { const k = Math.floor(q.x / bw); (bins[k] = bins[k] || []).push(q.y); });
    const meios = Object.entries(bins).map(([k, ys]) => ({ x: (+k + .5) * bw, y: media(ys), n: ys.length }));
    const w = largura(), alto = 340, pl = 64, pr = 12, pt = 14, pb = 36;
    const ysV = [...meios.map(b => b.y), ...(esq ? [esq.a, esq.a - esq.b * h] : []), ...(dir ? [dir.a, dir.a + dir.b * h] : [])];
    let svg = `<p class="nota">Poucas eleições nesta comparação e nesta faixa. Aumente a faixa ou escolha outro recorte.</p>`;
    if (ysV.length > 1){
      let lo = Math.min(...ysV), hi = Math.max(...ysV); const pad = (hi - lo) * .15 || 1; lo -= pad; hi += pad;
      const X = v => pl + (v + h) / (2 * h) * (w - pl - pr), Yp = v => pt + (hi - v) / (hi - lo) * (alto - pt - pb);
      const tk = [0, .25, .5, .75, 1].map(t => lo + t * (hi - lo));
      svg = `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Regressão descontínua">
        ${tk.map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Yp(t)}" y2="${Yp(t)}"/><text class="ax" x="${pl - 6}" y="${Yp(t) + 4}" text-anchor="end">${esc(Y.f(t))}</text>`).join("")}
        ${[-h, -h / 2, 0, h / 2, h].map(t => `<text class="ax" x="${X(t)}" y="${alto - 18}" text-anchor="middle">${t > 0 ? "+" : ""}${nf(t, 0)}</text>`).join("")}
        <text class="ax" x="${(pl + w - pr) / 2}" y="${alto - 2}" text-anchor="middle">${esc(C.eixo)} (pontos percentuais)</text>
        <line x1="${X(0)}" x2="${X(0)}" y1="${pt}" y2="${alto - pb}" stroke="var(--ink-2)" stroke-dasharray="4 4"/>
        <text class="ax" x="${X(-h / 2)}" y="${pt + 12}" text-anchor="middle">venceu ${esc(C.ctrl)}</text><text class="ax" x="${X(h / 2)}" y="${pt + 12}" text-anchor="middle">venceu ${esc(C.trat)}</text>
        ${meios.map(b => `<circle cx="${X(b.x)}" cy="${Yp(b.y)}" r="${3 + Math.min(7, Math.sqrt(b.n))}" fill="${b.x < 0 ? "#3b82f6" : "#ef4444"}" fill-opacity=".75"><title>${nf(b.x - bw / 2, 1)} a ${nf(b.x + bw / 2, 1)} p.p.: ${esc(Y.f(b.y))} (${b.n} eleições)</title></circle>`).join("")}
        ${esq ? `<line x1="${X(-h)}" y1="${Yp(esq.a - esq.b * h)}" x2="${X(0)}" y2="${Yp(esq.a)}" stroke="#3b82f6" stroke-width="2.5"/>` : ""}
        ${dir ? `<line x1="${X(0)}" y1="${Yp(dir.a)}" x2="${X(h)}" y2="${Yp(dir.a + dir.b * h)}" stroke="#ef4444" stroke-width="2.5"/>` : ""}
        ${esq && dir ? `<line x1="${X(0)}" x2="${X(0)}" y1="${Yp(esq.a)}" y2="${Yp(dir.a)}" stroke="var(--accent)" stroke-width="4"/>` : ""}
      </svg>`;
    }
    // densidade da variável de corte (teste visual de manipulação)
    const hb = {}; pts.filter(q => Math.abs(q.x) <= 50).forEach(q => { const k = Math.floor(q.x / 5); hb[k] = (hb[k] || 0) + 1; });
    const hmax = Math.max(1, ...Object.values(hb)), hw = 560, hh = 150;
    const hist = `<svg class="ch" viewBox="0 0 ${hw} ${hh}" role="img" aria-label="Distribuição das margens">${Object.entries(hb).map(([k, n]) => { const x0 = 40 + (+k * 5 + 50) / 100 * (hw - 52); return `<rect x="${x0}" y="${hh - 22 - n / hmax * (hh - 34)}" width="${(hw - 52) / 20 - 2}" height="${n / hmax * (hh - 34)}" fill="${+k < 0 ? "#3b82f6" : "#ef4444"}" fill-opacity=".7"><title>${+k * 5} a ${+k * 5 + 5} p.p.: ${n}</title></rect>`; }).join("")}
      ${[-50, -25, 0, 25, 50].map(t => `<text class="ax" x="${40 + (t + 50) / 100 * (hw - 52)}" y="${hh - 6}" text-anchor="middle">${t > 0 ? "+" : ""}${t}</text>`).join("")}</svg>`;
    const sig = p == null ? "" : p < .01 ? "significativo a 1%" : p < .05 ? "significativo a 5%" : p < .1 ? "significativo a 10%" : "não significativo";
    main.innerHTML = `
      <div class="explica"><h3>A ideia</h3><p>Comparar todos os municípios governados por prefeitos ${esc(C.pt)} com os governados por prefeitos ${esc(C.pc)} mistura o efeito do prefeito com as diferenças entre os lugares. A <b>regressão descontínua</b> olha só para eleições <b>decididas por pouco</b> entre esses dois tipos de candidato: perto da margem zero, quem venceu é quase um sorteio, e os municípios dos dois lados são parecidos. O <b>salto</b> da linha no zero estima o efeito de eleger um prefeito ${esc(C.pt)} em vez de um ${esc(C.pc)}.${st.rddC === "gov" ? " Na comparação com o partido do governador, a pergunta é a de Brollo e Nannicini (2012): prefeitos do mesmo partido do governo recebem mais transferências voluntárias?" : ""}</p></div>
      <div class="ctl" style="margin-top:16px">
        <div class="f"><span id="lC">Comparação</span><div class="seg" role="group" aria-labelledby="lC">${Object.entries(RDDC).map(([k, v]) => `<button type="button" data-st="rddC:${k}" aria-pressed="${st.rddC === k}">${esc(v.n)}</button>`).join("")}</div></div>
        <label class="f"><span>Eleições</span><select id="rE">${[["2016+2020", "2016 e 2020 (mandatos completos)"], ["2016", "2016 (mandato 2017–2020)"], ["2020", "2020 (mandato 2021–2024)"], ["2024", "2024 (só os primeiros anos)"]].map(([k, n]) => `<option value="${k}" ${k === st.rddE ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="f"><span>Resultado</span><select id="rY">${Object.entries(RDDY).map(([k, v]) => `<option value="${k}" ${k === st.rddY ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select></label>
        <label class="f"><span>Faixa em torno do zero: ±${h} p.p.</span><input type="range" id="rH" min="4" max="50" step="1" value="${h}"></label>
      </div>
      <section class="panel" style="margin-top:16px"><h2>${esc(Y.n)} × ${esc(C.eixo.toLowerCase())}</h2><p class="sub">${pts.length} eleições ${st.rddC === "gov" ? "em que só um dos dois primeiros colocados era do partido do governador" : "entre esquerda (escala &lt; 4,5) e direita (&gt; 5,5)"} no recorte; ${(esq?.n || 0) + (dir?.n || 0)} dentro da faixa. Pontos: médias por faixa de ${nf(bw, 1)} p.p.; linhas: regressão linear local com peso triangular.</p>
        ${svg}
        <div class="res">
          <div class="kpi"><span>Efeito estimado (salto)</span><b style="color:var(--accent)">${tau == null ? "—" : `${tau >= 0 ? "+" : "−"}${Y.f(Math.abs(tau))}`}</b><small>${sig}</small></div>
          <div class="kpi"><span>Erro-padrão robusto</span><b>${ep == null ? "—" : Y.f(ep)}</b><small>intervalo de 95%: ${tau == null ? "—" : `${Y.f(tau - 1.96 * ep)} a ${Y.f(tau + 1.96 * ep)}`}</small></div>
          <div class="kpi"><span>Valor-p</span><b>${p == null ? "—" : nf(p, 3)}</b><small>teste z bicaudal</small></div>
          <div class="kpi"><span>Eleições na faixa</span><b>${(esq?.n || 0) + (dir?.n || 0)}</b><small>${esq?.n || 0} venceu ${esc(C.ctrl)} · ${dir?.n || 0} venceu ${esc(C.trat)}</small></div>
        </div>
        <p class="nota">${tau == null ? "" : `Leitura: nas eleições decididas por pouco, municípios que elegeram um prefeito ${esc(C.pt)} tiveram, em média, ${Y.f(Math.abs(tau))} ${tau >= 0 ? "a mais" : "a menos"} de ${Y.n.toLowerCase()} do que os que elegeram um ${esc(C.pc)}. ${p != null && p >= .1 ? "A diferença não é estatisticamente significativa: não dá para descartar que seja zero." : `A diferença é estatisticamente ${sig}.`}`} Mude a faixa: se o efeito muda muito de sinal ou tamanho, a estimativa é frágil.</p>
      </section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Quantas eleições em cada margem</h2><p class="sub">Se houvesse manipulação do resultado, apareceria um acúmulo logo de um lado do zero (teste de McCrary).</p>${hist}</section>
        <div class="explica"><h3>Cuidados</h3><p>• ${st.rddC === "gov" ? "Só entram eleições em que exatamente um dos dois primeiros colocados era do partido do governador em exercício (eleito dois anos antes); a eleição de 2012 fica de fora." : "Só entram eleições em que os dois primeiros colocados ficaram em lados opostos da escala; partidos sem classificação ficam de fora."}</p><p>• A amostra é pequena, e o erro-padrão é grande; a escolha da faixa troca viés por variância (faixas estreitas têm menos viés e mais ruído).</p><p>• O efeito vale para municípios com eleições disputadas, não para todos.</p><p>• Para um trabalho acadêmico, use a faixa ótima de Calonico, Cattaneo e Titiunik (pacote <b>rdrobust</b> no R ou no Stata) e agrupe os erros por município.</p></div>
      </div>`;
  }

  /* ---------- utilitários das abas temáticas ---------- */
  const mediana = arr => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const clip = v => Math.max(0, Math.min(1, v));
  /* razão de somas com numerador e denominador quaisquer (por padrão, por habitante) */
  const agregaF = (ms, a, num, den = x => x.pop) => {
    let n = 0, d = 0;
    ms.forEach(m => { const x = m.f[a]; if (!x) return; const nv = num(x), dv = den(x); if (nv == null || !dv || !isFinite(nv)) return; n += nv; d += dv; });
    return d > 0 ? n / d : null;
  };
  /* uma série por orientação do prefeito em exercício em cada ano */
  const porGrupo = (ms, anos, fn) => [...MODOS[st.modo], SEM]
    .map(g => ({ n: g.n, c: g.c, v: Object.fromEntries(anos.map(a => [a, fn(ms.filter(m => grupo(scoreAno(m, a)).k === g.k), a)])) }))
    .filter(s => Object.values(s.v).some(v => v != null));
  /* último ano em que pelo menos 40% dos municípios do recorte têm o dado */
  const anoCom = (ms, ok) => { for (let i = ANOS.length - 1; i >= 0; i--) if (ms.filter(m => m.f[ANOS[i]] && ok(m.f[ANOS[i]])).length >= .4 * ms.length) return String(ANOS[i]); return REF; };
  const segSt = (k, opts) => `<div class="seg" role="group">${opts.map(([v, n]) => `<button type="button" data-st="${k}:${v}" aria-pressed="${st[k] === v}">${esc(n)}</button>`).join("")}</div>`;
  const selSt = (k, rot, opts) => `<label class="f"><span>${esc(rot)}</span><select data-stsel="${k}">${Object.entries(opts).map(([v, o]) => `<option value="${v}" ${st[k] === v ? "selected" : ""}>${esc(o.n)}</option>`).join("")}</select></label>`;
  const barrasH = (itens, fmt) => `<div class="hb">${itens.map(i => `<div class="hbr"><span>${esc(i.n)}</span><div class="pb"><i style="width:${Math.max(0, i.w) * 100}%;background:${i.c || "var(--accent)"}"></i></div><b class="num">${esc(fmt(i.v))}</b></div>`).join("")}</div>`;
  function histograma(vals, { lo, hi, passo, fmt, marcas = [], cor = () => "#60a5fa", alto = 190, w = largura() }){
    const ok = vals.filter(v => v != null && isFinite(v));
    if (ok.length < 3) return `<p class="nota">Poucos municípios com este dado.</p>`;
    const nb = Math.round((hi - lo) / passo), cont = Array(nb).fill(0);
    ok.forEach(v => { cont[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / passo)))]++; });
    const mx = Math.max(1, ...cont), pl = 36, pr = 12, pt = 18, pb = 24, X = v => pl + (v - lo) / (hi - lo) * (w - pl - pr), bw = (w - pl - pr) / nb;
    const Y = n => pt + (1 - n / mx) * (alto - pt - pb);
    return `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Histograma">
      ${[0, .5, 1].map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Y(t * mx)}" y2="${Y(t * mx)}"/><text class="ax" x="${pl - 6}" y="${Y(t * mx) + 4}" text-anchor="end">${nf(t * mx)}</text>`).join("")}
      ${cont.map((n, i) => n ? `<rect x="${X(lo + i * passo) + .5}" y="${Y(n)}" width="${Math.max(1, bw - 1)}" height="${alto - pb - Y(n)}" fill="${cor(lo + (i + .5) * passo)}" fill-opacity=".8"><title>${esc(fmt(lo + i * passo))} a ${esc(fmt(lo + (i + 1) * passo))}: ${n} municípios</title></rect>` : "").join("")}
      ${[0, .25, .5, .75, 1].map(t => `<text class="ax" x="${X(lo + t * (hi - lo))}" y="${alto - 6}" text-anchor="middle">${esc(fmt(lo + t * (hi - lo)))}</text>`).join("")}
      ${marcas.map((k, i) => `<line x1="${X(k.x)}" x2="${X(k.x)}" y1="${pt - 4}" y2="${alto - pb}" stroke="var(--ink)" stroke-dasharray="4 3"/><text class="ax" x="${X(k.x) + 4}" y="${pt + 8 + i * 12}" style="fill:var(--ink-2)">${esc(k.n)}</text>`).join("")}
    </svg>`;
  }
  function colunas(rotulos, series, { fmt, alto = 240, w = largura() }){
    const vals = series.flatMap(s => s.v).filter(v => v != null && isFinite(v));
    if (!vals.length) return `<p class="nota">Sem dados para o recorte escolhido.</p>`;
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); if (hi === lo) hi = lo + 1;
    const pad = (hi - lo) * .08; lo -= lo < 0 ? pad : 0; hi += pad;
    const pl = 56, pr = 12, pt = 12, pb = 26, gw = (w - pl - pr) / rotulos.length, bw = Math.min(46, gw * .8 / series.length);
    const Y = v => pt + (hi - v) / (hi - lo) * (alto - pt - pb);
    const tk = [0, .25, .5, .75, 1].map(t => lo + t * (hi - lo));
    return `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Gráfico de colunas">
      ${tk.map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pl - 6}" y="${Y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("")}
      <line class="zero" x1="${pl}" x2="${w - pr}" y1="${Y(0)}" y2="${Y(0)}"/>
      ${rotulos.map((r, i) => `<text class="ax" x="${pl + (i + .5) * gw}" y="${alto - 6}" text-anchor="middle">${esc(r)}</text>` + series.map((s, j) => { const v = s.v[i]; if (v == null || !isFinite(v)) return "";
        const x = pl + i * gw + (gw - bw * series.length) / 2 + j * bw; return `<rect x="${x + 1}" y="${Math.min(Y(v), Y(0))}" width="${bw - 2}" height="${Math.max(1, Math.abs(Y(v) - Y(0)))}" rx="3" fill="${s.c}"><title>${esc(s.n)} · ${esc(r)}: ${esc(fmt(v))}</title></rect>`; }).join("")).join("")}
    </svg>${series.length > 1 ? `<div class="leg">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join("")}</div>` : ""}`;
  }
  /* mínimos quadrados com erros-padrão agrupados (cluster) por município */
  function inversa(A){
    const n = A.length, M2 = A.map((r, i) => [...r, ...r.map((_, j) => +(i === j))]);
    for (let c = 0; c < n; c++){
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M2[r][c]) > Math.abs(M2[p][c])) p = r;
      if (Math.abs(M2[p][c]) < 1e-10) return null;
      [M2[c], M2[p]] = [M2[p], M2[c]];
      const d = M2[c][c]; M2[c] = M2[c].map(v => v / d);
      for (let r = 0; r < n; r++) if (r !== c){ const f = M2[r][c]; M2[r] = M2[r].map((v, j) => v - f * M2[c][j]); }
    }
    return M2.map(r => r.slice(n));
  }
  function mqo(y, X, g){
    const n = y.length, k = X.length;
    const inv = inversa(X.map(a => X.map(b => a.reduce((s, v, i) => s + v * b[i], 0)))); if (!inv) return null;
    const Xty = X.map(a => a.reduce((s, v, i) => s + v * y[i], 0));
    const b = inv.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
    const somas = new Map();
    for (let i = 0; i < n; i++){ const e = y[i] - X.reduce((s, c, j) => s + c[i] * b[j], 0), s = somas.get(g[i]) || Array(k).fill(0); for (let j = 0; j < k; j++) s[j] += X[j][i] * e; somas.set(g[i], s); }
    const meio = Array.from({ length: k }, () => Array(k).fill(0));
    somas.forEach(s => { for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) meio[a][c] += s[a] * s[c]; });
    const G = somas.size, cf = G / (G - 1) * (n - 1) / (n - k);
    const V = inv.map(r => inv[0].map((_, j) => r.reduce((s, v, l) => s + v * meio[l].reduce((t, w, q) => t + w * inv[q][j], 0), 0)));
    return { b, ep: b.map((_, j) => Math.sqrt(Math.max(0, V[j][j] * cf))), n, G };
  }
  /* tira as médias por município e por ano (projeções alternadas, que convergem também em painel desbalanceado) */
  function semEfeitos(cols, g, t){
    const out = cols.map(c => c.slice());
    const tira = (c, key) => { const s = new Map(), q = new Map(); key.forEach((k, i) => { s.set(k, (s.get(k) || 0) + c[i]); q.set(k, (q.get(k) || 0) + 1); }); key.forEach((k, i) => { c[i] -= s.get(k) / q.get(k); }); };
    for (let r = 0; r < 30; r++) out.forEach(c => { tira(c, g); tira(c, t); });
    return out;
  }
  const estrelas = (b, ep) => { if (!ep) return ""; const p = normalP(b / ep); return p < .01 ? "***" : p < .05 ? "**" : p < .1 ? "*" : ""; };

  /* ---------- aba: finanças públicas ---------- */
  const FUNCOES = { "01": "Legislativa", "02": "Judiciária", "03": "Essencial à justiça", "04": "Administração", "05": "Defesa", "06": "Segurança pública", "07": "Relações exteriores",
    "08": "Assistência social", "09": "Previdência", "10": "Saúde", "11": "Trabalho", "12": "Educação", "13": "Cultura", "14": "Direitos da cidadania", "15": "Urbanismo", "16": "Habitação",
    "17": "Saneamento", "18": "Gestão ambiental", "19": "Ciência e tecnologia", "20": "Agricultura", "21": "Organização agrária", "22": "Indústria", "23": "Comércio e serviços", "24": "Comunicações",
    "25": "Energia", "26": "Transporte", "27": "Desporto e lazer", "28": "Encargos especiais" };
  const DESTAQUE = ["10", "12", "04", "15", "26", "08", "20", "18", "17"];
  /* receita de impostos e transferências constitucionais (base aproximada dos mínimos de saúde e educação) */
  const rit = x => x.rc ? x.rc[9] + x.rc[0] + x.rc[1] + x.rc[2] + x.rc[5] : null;
  /* índice de saúde fiscal de 0 a 1: média de autonomia, folga com pessoal, investimento e liquidez */
  function isf(m, a){
    const x = m.f[a]; if (!x || !x.lrf || !x.rec) return null;
    const [rcl, pes, , , caixa] = x.lrf; if (!rcl || pes == null) return null;
    const partes = [clip(x.trib / x.rec / .25), clip((60 - pes) / 20), clip(x.inv / x.rec / .15)];
    if (caixa != null) partes.push(clip(caixa / rcl / .1));
    return media(partes);
  }
  function fiscal(){
    const ms = sel();
    const aF = anoCom(ms, x => x.fn), aL = anoCom(ms, x => x.lrf && x.lrf[1] != null);
    const fnS = st.fn, fnN = FUNCOES[fnS];
    const gasto = x => x.fn ? (x.fn[fnS] || 0) : null;
    const serieFn = porGrupo(ms, ANOS, (gs, a) => agregaF(gs, a, gasto));
    serieFn.push({ n: "Todos os municípios", c: "#e4e4e7", dash: true, v: Object.fromEntries(ANOS.map(a => [a, agregaF(ms, a, gasto)])) });
    const tot = {}; let totG = 0, popF = 0;
    ms.forEach(m => { const x = m.f[aF]; if (!x?.fn) return; popF += x.pop || 0; Object.entries(x.fn).forEach(([k, v]) => { tot[k] = (tot[k] || 0) + v; totG += v; }); });
    const comp = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const barras = comp.length ? barrasH(comp.map(([k, v]) => ({ n: FUNCOES[k] || `Função ${k}`, w: v / comp[0][1], v, c: k === fnS ? "var(--accent)" : "#60a5fa" })), v => `${pct(v / totG, 0)} · ${brl(popF ? v / popF : null)}/hab.`) : `<p class="nota">Sem despesa por função no recorte.</p>`;
    // percentuais oficiais do RREO (Anexo 14) quando há cobertura; senão, a aproximação pela despesa por função
    const aM = anoCom(ms, x => x.lrf && x.lrf[7] != null);
    const ofS = ms.map(m => m.f[aM]?.lrf?.[7]).filter(v => v != null), ofE = ms.map(m => m.f[aM]?.lrf?.[8]).filter(v => v != null);
    const oficial = ofS.length >= .3 * ms.length;
    let sa = ofS, ed = ofE;
    if (!oficial){ sa = []; ed = [];
      ms.forEach(m => { const x = m.f[aF]; if (!x?.fn || !x.rc) return; const r = rit(x); if (!(r > 0)) return; sa.push(100 * (x.fn["10"] || 0) / r); ed.push(100 * (x.fn["12"] || 0) / r); }); }
    const abaixo = (v, lim) => v.length ? `${v.filter(x => x < lim).length} de ${v.length} abaixo do mínimo` : "";
    const fP = v => `${nf(v)}%`;
    const L = ms.map(m => ({ m, l: m.f[aL]?.lrf })).filter(o => o.l && o.l[1] != null);
    const pes = L.map(o => o.l[1]), acima = lim => L.filter(o => o.l[1] > lim).length;
    const prim = L.filter(o => o.l[5] != null), metas = L.filter(o => o.l[5] != null && o.l[6] != null), caixa = L.filter(o => o.l[4] != null), div = L.filter(o => o.l[2] != null);
    const pesG = porGrupo(ms, ANOS, (gs, a) => mediana(gs.map(m => m.f[a]?.lrf?.[1]).filter(v => v != null)));
    const FONTES = [["FPM", x => x.rc[0], "#60a5fa"], ["ICMS", x => x.rc[1], "#a78bfa"], ["Impostos próprios", x => x.rc[9], "#c8f250"], ["ITR e IPVA", x => x.rc[2] + x.rc[5], "#34d399"],
      ["Royalties (CFEM e petróleo)", x => x.rc[3] + x.rc[4], "#f5b83d"], ["Voluntárias da União", x => x.rc[6] + x.rc[8], "#f87171"], ["Convênios do estado", x => x.rc[7], "#fb923c"]];
    const fontes = linhas(FONTES.map(([n, f, c]) => ({ n, c, v: Object.fromEntries(ANOS.map(a => [a, agregaF(ms, a, x => x.rc ? f(x) : null)])) })), { anos: ANOS, fmt: brl, alto: 260 });
    const isfs = ms.map(m => ({ m, v: isf(m, aL) })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
    const isfG = porGrupo(ms, ANOS, (gs, a) => media(gs.map(m => isf(m, a)).filter(v => v != null)));
    const linhaIsf = o => { const e = o.m.ele?.[eleicaoDo(+aL)]; return `<tr data-mun="${o.m.c}" style="cursor:pointer"><td><b>${esc(o.m.n)}</b> <small style="color:var(--muted)">${o.m.uf}</small></td><td>${e ? `${esc(e[0])} ${chipGrupo(nota(e[0]))}` : "—"}</td><td class="num">${nf(o.v, 2)}</td><td class="num">${pct(o.m.f[aL].lrf[1] / 100)}</td><td class="num">${pct(indiv(o.m, aL, "invdesp"))}</td></tr>`; };
    main.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Pessoal / RCL em ${aL}</span><b>${pct(mediana(pes) / 100)}</b><small>mediana de ${L.length} prefeituras</small></div>
        <div class="kpi"><span>Acima do limite prudencial</span><b>${acima(51.3)}</b><small>${pct(L.length ? acima(51.3) / L.length : null, 0)} das prefeituras (51,3% da RCL); ${acima(54)} acima de 54%</small></div>
        <div class="kpi"><span>Resultado primário negativo</span><b>${pct(prim.length ? prim.filter(o => o.l[5] < 0).length / prim.length : null, 0)}</b><small>${metas.length ? `${pct(metas.filter(o => o.l[5] >= o.l[6]).length / metas.length, 0)} cumpriram a meta da LDO` : "das prefeituras"}</small></div>
        <div class="kpi"><span>Caixa insuficiente</span><b>${pct(caixa.length ? caixa.filter(o => o.l[4] < 0).length / caixa.length : null, 0)}</b><small>disponibilidade de caixa líquida negativa${div.length ? ` · ${pct(div.filter(o => o.l[2] > 0).length / div.length, 0)} com dívida líquida positiva` : ""}</small></div>
      </div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Gasto em ${esc(fnN.toLowerCase())} por habitante, por orientação do prefeito</h2><p class="sub">Despesa liquidada por função (DCA, Anexo I-E), a preços de ${REF}; média ponderada pela população.</p></div>
        ${segSt("fn", DESTAQUE.map(k => [k, FUNCOES[k]]))}</div>${linhas(serieFn, { anos: ANOS, fmt: brl })}</section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Para onde vai o dinheiro em ${aF}</h2><p class="sub">As dez funções com maior despesa liquidada no recorte: parcela do total e valor por habitante.</p>${barras}</section>
        <section class="panel"><h2>Mínimos constitucionais${oficial ? "" : " (aproximação)"}</h2><p class="sub">${oficial ? `Percentual da receita de impostos e transferências aplicado em saúde e em manutenção e desenvolvimento do ensino, declarado no RREO (Anexo 14), ${aM}.` : `Despesa da função em % da receita de impostos e transferências constitucionais (impostos próprios, FPM, ICMS, ITR e IPVA), ${aF}.`}</p>
          <h3 class="mini">Saúde (mínimo de 15%) · ${abaixo(sa, 15)}</h3>${histograma(sa, { lo: 0, hi: 50, passo: 2, fmt: fP, marcas: [{ x: 15, n: "15%" }], cor: v => v < 15 ? "#f87171" : "#34d399", alto: 150 })}
          <h3 class="mini">Educação (mínimo de 25%) · ${abaixo(ed, 25)}</h3>${histograma(ed, { lo: 0, hi: 70, passo: 2.5, fmt: fP, marcas: [{ x: 25, n: "25%" }], cor: v => v < 25 ? "#f87171" : "#34d399", alto: 150 })}
          <p class="nota">${oficial ? "Valores declarados pela própria prefeitura ao Tesouro; o cálculo definitivo é feito pelos tribunais de contas, pelo SIOPS e pelo SIOPE." : "A função inclui gastos pagos com recursos do SUS e do Fundeb, que não entram no cálculo oficial; por isso a razão fica acima do índice do SIOPS e do SIOPE. Serve para comparar municípios, não para verificar o cumprimento da regra."}</p></section>
      </div>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Despesa com pessoal na Lei de Responsabilidade Fiscal</h2><p class="sub">Poder Executivo, em % da receita corrente líquida, ${aL} (RGF, Anexo 6). Limites: alerta 48,6%, prudencial 51,3%, máximo 54%.</p>
          ${histograma(pes, { lo: 20, hi: 70, passo: 1, fmt: fP, marcas: [{ x: 48.6, n: "alerta" }, { x: 51.3, n: "prudencial" }, { x: 54, n: "máximo" }], cor: v => v > 54 ? "#f87171" : v > 51.3 ? "#fb923c" : v > 48.6 ? "#f5b83d" : "#34d399" })}</section>
        <section class="panel"><h2>Pessoal / RCL ao longo do tempo</h2><p class="sub">Mediana por orientação do prefeito em exercício.</p>${linhas(pesG, { anos: ANOS, fmt: v => `${nf(v, 0)}%`, alto: 220 })}</section>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Fontes de receita por habitante</h2><p class="sub">Receitas brutas do recorte, a preços de ${REF}. Transferências voluntárias: convênios e transferências especiais (as “emendas Pix”).</p>${fontes}</section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Índice de saúde fiscal</h2><p class="sub">Média, de 0 a 1, de quatro notas: autonomia (receita própria em % da receita; 25% vale 1), folga com pessoal (40% da RCL ou menos vale 1; 60%, zero), investimento (15% da receita vale 1) e liquidez (caixa líquido de 10% da RCL vale 1).</p>
          ${linhas(isfG, { anos: ANOS, fmt: v => nf(v, 2), alto: 220 })}<p class="nota">Inspirado no Índice Firjan de Gestão Fiscal, com pesos e cortes próprios: não é o IFGF.</p></section>
        <section class="panel"><h2>Melhores e piores em ${aL}</h2><p class="sub">${isfs.length} prefeituras com RGF e DCA. Clique para abrir a ficha.</p>
          <div class="tbwrap"><table class="tb"><thead><tr><th>Município</th><th>Prefeito</th><th>Índice</th><th>Pessoal</th><th>Invest. % desp.</th></tr></thead><tbody>
          ${isfs.slice(0, 6).map(linhaIsf).join("")}${isfs.length > 12 ? `<tr><td colspan="5" style="text-align:center;color:var(--muted)">⋯</td></tr>` : ""}${isfs.slice(Math.max(6, isfs.length - 6)).map(linhaIsf).join("")}</tbody></table></div></section>
      </div>`;
  }

  /* ---------- aba: economia política ---------- */
  /* partido do presidente na maior parte de cada ano (2020 e 2021: presidente sem partido) */
  const PRESIDENTE = { 2016: "MDB", 2017: "MDB", 2018: "MDB", 2019: "PSL", 2022: "PL", 2023: "PT", 2024: "PT", 2025: "PT", 2026: "PT" };
  const alinhadoPres = (m, a) => { const e = m.ele?.[eleicaoDo(+a)], p = PRESIDENTE[a]; return e && p ? sigla(e[0]) === sigla(p) : null; };
  const POLY = { invpc: MET.invpc, desppc: MET.desppc, convpc: MET.convpc, tribpc: MET.tribpc };
  const PAINELY = { convEpc: MET.convEpc, convUpc: MET.convUpc, invpc: MET.invpc, tribpc: MET.tribpc, saudepc: MET.saudepc, educpc: MET.educpc };
  function politica(){
    const ms = sel(), Y = POLY[st.polY];
    const ciclo = [];
    [2016, 2020].forEach(E => {
      const anos = [1, 2, 3, 4].map(i => E + i); if (!anos.every(a => ANOS.includes(a))) return;
      ms.forEach(m => { const v = anos.map(a => indiv(m, a, st.polY)); if (v.some(x => x == null)) return; const mu = media(v); if (mu > 0) ciclo.push({ r: v.map(x => x / mu), reel: m.reel?.[String(E)] }); });
    });
    const medC = f => { const s = ciclo.filter(f); return [0, 1, 2, 3].map(i => s.length >= 5 ? 100 * (media(s.map(c => c.r[i])) - 1) : null); };
    const nR = ciclo.filter(c => c.reel === 1).length;
    const graf = colunas(["1º ano", "2º ano", "3º ano", "4º ano (eleição)"], [
      { n: `Todos (${ciclo.length})`, c: "#e4e4e7", v: medC(() => true) },
      { n: `1º mandato: pode concorrer (${ciclo.filter(c => c.reel === 0).length})`, c: "#60a5fa", v: medC(c => c.reel === 0) },
      { n: `2º mandato: não pode concorrer (${nR})`, c: "#f5b83d", v: medC(c => c.reel === 1) }], { fmt: v => `${v > 0 ? "+" : ""}${nf(v, 0)}%` });
    const serieAl = (fn, met) => [[true, "Mesmo partido", "#c8f250"], [false, "Outro partido", "#71717a"]].map(([al, n, c]) => ({ n, c, v: Object.fromEntries(ANOS.map(a => [a, agrega(ms.filter(m => fn(m, a) === al), a, met).v])) }));
    const nAl = ms.filter(m => alinhado(m, +REF) === true).length;
    // painel: prefeito de esquerda e prefeito do partido do governador, com efeitos fixos de município e ano
    const obs = [];
    ms.forEach(m => ANOS.forEach(a => { const y = indiv(m, a, st.polY2), l = lado(scoreAno(m, a)), al = alinhado(m, a); if (y == null || !l || al == null) return; obs.push([m.c, a, y, l === "E" ? 1 : 0, al ? 1 : 0]); }));
    const ys = obs.map(o => o[2]), x1 = obs.map(o => o[3]), x2 = obs.map(o => o[4]), gs = obs.map(o => o[0]), ts = obs.map(o => o[1]);
    const agr = obs.length > 30 ? mqo(ys, [ys.map(() => 1), x1, x2], gs) : null;
    const fe = obs.length > 30 ? (() => { const [a, b, c] = semEfeitos([ys, x1, x2], gs, ts); return mqo(a, [b, c], gs); })() : null;
    const muda = k => { const v = new Map(); obs.forEach(o => { const s = v.get(o[0]) || new Set(); s.add(o[k]); v.set(o[0], s); }); return [...v.values()].filter(s => s.size > 1).length; };
    const PY = PAINELY[st.polY2];
    const cel = (r, j) => r ? `<td class="num">${r.b[j] >= 0 ? "" : "−"}${esc(PY.f(Math.abs(r.b[j])))}${estrelas(r.b[j], r.ep[j])}<br><small style="color:var(--muted)">(${esc(PY.f(r.ep[j]))})</small></td>` : `<td class="num">—</td>`;
    main.innerHTML = `
      <div class="explica"><h3>Três perguntas da economia política</h3><p><b>Ciclo político-orçamentário:</b> prefeitos gastam mais no ano da eleição? <b>Reeleição:</b> quem está no segundo mandato, e não pode concorrer de novo, se comporta diferente? <b>Alinhamento partidário:</b> municípios governados pelo partido do governador ou do presidente recebem mais transferências voluntárias (Brollo e Nannicini, 2012)?</p></div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Ciclo dentro do mandato</h2><p class="sub">Desvio de cada ano em relação à média do próprio mandato do município (mandatos 2017–2020 e 2021–2024), em %. O 4º ano é o da eleição municipal.</p></div>
        ${segSt("polY", Object.entries(POLY).map(([k, v]) => [k, v.n.replace(" por habitante", "/hab.")]))}</div>${graf}
        <p class="nota">Como cada município é comparado com ele mesmo, diferenças de tamanho e de região saem da conta. ${nR < 30 ? "Há poucos prefeitos em segundo mandato com o dado de reeleição; a barra amarela é pouco precisa." : ""}</p></section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Convênios do estado por habitante</h2><p class="sub">Prefeito do mesmo partido do governador em exercício × outro partido. A preços de ${REF}. ${nAl} prefeituras alinhadas em ${REF}.</p>${linhas(serieAl(alinhado, "convEpc"), { anos: ANOS, fmt: brl, alto: 230 })}</section>
        <section class="panel"><h2>Transferências voluntárias da União por habitante</h2><p class="sub">Prefeito do mesmo partido do presidente × outro partido (2020 e 2021 ficam de fora: presidente sem partido).</p>${linhas(serieAl(alinhadoPres, "convUpc"), { anos: ANOS, fmt: brl, alto: 230 })}</section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Painel com efeitos fixos</h2><p class="sub">Regressão no painel município-ano: o resultado contra duas variáveis binárias. Erros-padrão agrupados por município entre parênteses.</p></div>
        <div class="ctl" style="padding:8px 12px">${selSt("polY2", "Resultado", PAINELY)}</div></div>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Variável</th><th>MQO agrupado</th><th>Efeitos fixos de município e ano</th></tr></thead><tbody>
          <tr><td>Prefeito de esquerda (contra direita)</td>${cel(agr, 1)}${cel(fe, 0)}</tr>
          <tr><td>Prefeito do partido do governador</td>${cel(agr, 2)}${cel(fe, 1)}</tr>
          <tr><td>Observações (município-ano)</td><td class="num">${agr ? nf(agr.n) : "—"}</td><td class="num">${fe ? nf(fe.n) : "—"}</td></tr>
          <tr><td>Municípios</td><td class="num">${agr ? nf(agr.G) : "—"}</td><td class="num">${fe ? nf(fe.G) : "—"}</td></tr>
        </tbody></table></div>
        <p class="nota">*** p &lt; 0,01; ** p &lt; 0,05; * p &lt; 0,1. Com efeitos fixos, o coeficiente vem só dos municípios que trocaram de lado (${muda(3)} trocaram de orientação, ${muda(4)} entraram ou saíram do partido do governador): é a lógica de diferenças em diferenças, que compara cada município com ele mesmo e desconta o que mudou em todos no mesmo ano. A versão agrupada mistura o efeito do prefeito com as diferenças entre os lugares. Ficam de fora os prefeitos de partidos sem classificação ou de centro.</p></section>`;
  }

  /* ---------- aba: Amazônia (desmatamento, queimadas e emprego) ---------- */
  const desmAcum = m => { const v = Object.values(m.desm || {}); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const fogoMedio = m => { const h = new Date().getFullYear(), v = Object.entries(m.fogo || {}).filter(([a]) => +a < h).map(([, x]) => x); return v.length ? media(v) : null; };
  const AMY = {
    desm: { n: "Desmatamento PRODES acumulado no período (km²)", v: desmAcum, f: v => nf(v, 0) },
    fogo: { n: "Focos de queimadas por ano (média)", v: fogoMedio, f: v => nf(v, 0) },
    emp: { n: "Emprego formal na agropecuária por mil habitantes", v: m => { const a = Object.keys(m.emp || {}).pop(); return a && m.pop?.[a] ? 1000 * m.emp[a][1] / m.pop[a] : null; }, f: v => nf(v, 1) },
  };
  function amazonia(){
    const ms = sel(), h = new Date().getFullYear();
    const anosD = [...new Set(ms.flatMap(m => Object.keys(m.desm || {})))].sort(), anosF = [...new Set(ms.flatMap(m => Object.keys(m.fogo || {})))].sort();
    const anosE = [...new Set(ms.flatMap(m => Object.keys(m.emp || {})))].sort();
    const sD = (gs, a) => gs.reduce((s, m) => s + (m.desm?.[a] || 0), 0), sF = (gs, a) => gs.reduce((s, m) => s + (m.fogo?.[a] || 0), 0);
    const uD = anosD[anosD.length - 1], pD = anosD[0], uF = anosF.filter(a => +a < h).pop();
    if (!anosD.length && !anosF.length){ main.innerHTML = `<p class="nota">Os dados de desmatamento e queimadas ainda não foram coletados.</p>`; return; }
    const desmG = [...MODOS[st.modo], SEM].map(g => ({ n: g.n, c: g.c, v: Object.fromEntries(anosD.map(a => [a, sD(ms.filter(m => grupo(scoreAno(m, a)).k === g.k), a)])) })).filter(s => Object.values(s.v).some(v => v > 0));
    const fogoL = linhas([{ n: "Focos de queimadas", c: "#f97316", v: Object.fromEntries(anosF.map(a => [a, sF(ms, a)])) }], { anos: anosF, fmt: v => nf(v), alto: 220 });
    const empL = linhas(PERFIS.map(p => ({ n: p.n, c: p.c, v: Object.fromEntries(anosE.map(a => { let e = 0, q = 0; ms.filter(m => m.perfil === p.k).forEach(m => { if (m.emp?.[a] && m.pop?.[a]){ e += m.emp[a][1]; q += m.pop[a]; } }); return [a, q ? 1000 * e / q : null]; })) })), { anos: anosE, fmt: v => nf(v, 1), alto: 220 });
    const uE = anosE[anosE.length - 1], empT = ms.reduce((s, m) => s + (m.emp?.[uE]?.[1] || 0), 0), empTot = ms.reduce((s, m) => s + (m.emp?.[uE]?.[0] || 0), 0);
    const X = XS[st.amX], Y = AMY[st.amY];
    const pts = ms.map(m => { const sc = nota(m.ele?.["2020"]?.[0]), g = grupo(sc); return { x: X.v(m), y: Y.v(m), c: g.c, id: m.c, t: `${m.n} (${m.uf}) · ${g.n}\n${X.n}: ${X.f(X.v(m))}\n${Y.n}: ${Y.f(Y.v(m))}` }; }).filter(p => p.x != null && p.y != null);
    const d = dispersao(pts, { fx: X.f, fy: Y.f, nx: X.n, ny: Y.n });
    const top = ms.map(m => ({ m, v: desmAcum(m) })).filter(o => o.v > 0).sort((a, b) => b.v - a.v).slice(0, 15);
    main.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Desmatamento PRODES ${uD || ""}</span><b>${nf(sD(ms, uD), 0)} km²</b><small>${pD && pD !== uD ? `${nf(sD(ms, pD), 0)} km² em ${pD}` : ""}</small></div>
        <div class="kpi"><span>Acumulado ${pD || ""}–${uD || ""}</span><b>${nf(anosD.reduce((s, a) => s + sD(ms, a), 0), 0)} km²</b><small>Amazônia e Cerrado (PRODES)</small></div>
        <div class="kpi"><span>Focos de queimadas ${uF || ""}</span><b>${nf(sF(ms, uF))}</b><small>satélite de referência do Inpe</small></div>
        <div class="kpi"><span>Emprego formal agro ${uE || ""}</span><b>${nf(empT)}</b><small>${empTot ? `${pct(empT / empTot, 1)} do emprego assalariado` : ""}</small></div>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Desmatamento por orientação do prefeito</h2><p class="sub">km² desmatados por ano PRODES (agosto do ano anterior a julho), somados por orientação do prefeito em exercício. O último ano pode ser estimativa preliminar.</p>${linhas(desmG, { anos: anosD, fmt: v => `${nf(v, 0)} km²` })}</section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Queimadas</h2><p class="sub">Focos de calor detectados pelo satélite de referência. O ano corrente é parcial.</p>${fogoL}</section>
        <section class="panel"><h2>Emprego formal na agropecuária</h2><p class="sub">Pessoal assalariado na agropecuária por mil habitantes, por perfil agro do município (IBGE, Cempre).</p>${empL}</section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Agro e ambiente, município a município</h2><p class="sub">Cor: orientação do prefeito eleito em 2020. Clique num ponto para abrir o município.</p></div></div>
        <div class="ctl" style="margin-bottom:12px">${selSt("amX", "Eixo horizontal", XS)}${selSt("amY", "Eixo vertical", AMY)}</div>
        ${typeof d === "string" ? d : `${d.svg}${legGrupos()}<p class="nota">Correlação de Pearson: <b>r = ${nf(d.r, 2)}</b> com ${d.n} municípios. Municípios maiores desmatam mais em km² só por terem mais área: para uma análise séria, divida pela área ou use logaritmos.</p>`}</section>
      <section class="panel" style="margin-top:16px"><h2>Quem mais desmatou</h2><p class="sub">Desmatamento acumulado de ${pD || "—"} a ${uD || "—"}.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Município</th><th>Prefeito (2021–2024)</th><th>km²</th><th>Focos/ano</th><th>Agro no PIB</th><th>Expansão das lavouras</th></tr></thead><tbody>
        ${top.map(o => { const e = o.m.ele?.["2020"]; return `<tr data-mun="${o.m.c}" style="cursor:pointer"><td><b>${esc(o.m.n)}</b> <small style="color:var(--muted)">${o.m.uf}</small></td><td>${e ? `${esc(e[0])} ${chipGrupo(nota(e[0]))}` : "—"}</td><td class="num">${nf(o.v, 0)}</td><td class="num">${nf(fogoMedio(o.m))}</td><td class="num">${pct(o.m.peso, 0)}</td><td class="num">${XS.expansao.v(o.m) == null ? "—" : pct(XS.expansao.v(o.m), 0)}</td></tr>`; }).join("")}
        </tbody></table></div></section>`;
  }

  /* ---------- aba: resultados para a população ---------- */
  const tmiAgr = (ms, a) => { let o = 0, n = 0; ms.forEach(m => { const v = m.tmi?.[a]; if (v && v[1]){ o += v[0]; n += v[1]; } }); return n >= 300 ? 1000 * o / n : null; };
  const anosTmi = () => { const h = new Date().getFullYear(); return [...new Set(M.flatMap(m => Object.keys(m.tmi || {})))].filter(a => +a < h - 1).sort(); };
  const tmiMun = m => { let o = 0, n = 0; anosTmi().slice(-5).forEach(a => { const v = m.tmi?.[a]; if (v){ o += v[0]; n += v[1]; } }); return n >= 100 ? 1000 * o / n : null; };
  const pibpc = m => { const a = Object.keys(m.pib || {}).filter(k => m.pib[k]?.[0] && m.pop?.[k]).pop(); return a ? m.pib[a][0] * 1e3 * deflator(a) / m.pop[a] : null; };
  const RX = {
    saude: { n: "Saúde por habitante, média 2021–2024", v: m => periodo(m, ULT(), "saudepc"), f: brl },
    educ: { n: "Educação por habitante, média 2021–2024", v: m => periodo(m, ULT(), "educpc"), f: brl },
    inv: YS.inv, pib: { n: "PIB por habitante (último ano)", v: pibpc, f: brl }, peso: XS.peso,
  };
  const RY = {
    tmi: { n: "Mortalidade infantil (por mil nascidos vivos, últimos 5 anos)", v: tmiMun, f: v => nf(v, 1) },
    esgoto: { n: "Domicílios ligados à rede de esgoto (Censo 2022, %)", v: m => m.censo?.[0], f: v => `${nf(v, 0)}%` },
    alfab: { n: "Taxa de alfabetização, 15 anos ou mais (Censo 2022, %)", v: m => m.censo?.[1], f: v => `${nf(v, 1)}%` },
  };
  function resultados(){
    const ms = sel(), anosT = anosTmi();
    const uT = anosT[anosT.length - 1];
    const tmiG = porGrupo(ms, anosT, tmiAgr);
    tmiG.push({ n: "Todos os municípios", c: "#e4e4e7", dash: true, v: Object.fromEntries(anosT.map(a => [a, tmiAgr(ms, a)])) });
    const pond = i => { let s = 0, q = 0; ms.forEach(m => { const v = m.censo?.[i], p = m.pop?.["2022"]; if (v != null && p){ s += v * p; q += p; } }); return q ? s / q : null; };
    let pibT = 0, popT = 0; ms.forEach(m => { const a = Object.keys(m.pib || {}).pop(); if (a && m.pop?.[a]){ pibT += m.pib[a][0] * 1e3 * deflator(a); popT += m.pop[a]; } });
    const X = RX[st.resX], Y = RY[st.resY];
    const pts = ms.map(m => { const g = grupo(nota(m.ele?.["2020"]?.[0])); return { x: X.v(m), y: Y.v(m), c: g.c, id: m.c, r: 2.4 + Math.min(6, Math.log10(Math.max(1000, m.pop?.[REF] || 1000)) - 2.6), t: `${m.n} (${m.uf}) · ${g.n}\n${X.n}: ${X.f(X.v(m))}\n${Y.n}: ${Y.f(Y.v(m))}` }; }).filter(p => p.x != null && p.y != null);
    const d = dispersao(pts, { fx: X.f, fy: Y.f, nx: X.n, ny: Y.n });
    main.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Mortalidade infantil ${uT || ""}</span><b>${nf(tmiAgr(ms, uT), 1)}</b><small>óbitos de menores de 1 ano por mil nascidos vivos</small></div>
        <div class="kpi"><span>Rede de esgoto (2022)</span><b>${pond(0) == null ? "—" : `${nf(pond(0), 0)}%`}</b><small>dos moradores em domicílios ligados à rede geral</small></div>
        <div class="kpi"><span>Alfabetização (2022)</span><b>${pond(1) == null ? "—" : `${nf(pond(1), 1)}%`}</b><small>da população de 15 anos ou mais</small></div>
        <div class="kpi"><span>PIB por habitante</span><b>${brl(popT ? pibT / popT : null)}</b><small>último ano do PIB dos Municípios, a preços de ${REF}</small></div>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Mortalidade infantil por orientação do prefeito</h2><p class="sub">Óbitos de menores de 1 ano (SIM) por mil nascidos vivos (Sinasc), por residência da mãe; razão de somas por grupo. Os dados dos dois últimos anos são preliminares e ficam de fora.</p>${linhas(tmiG, { anos: anosT, fmt: v => nf(v, 1) })}</section>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>Gasto público e resultados</h2><p class="sub">Cor: orientação do prefeito eleito em 2020. Tamanho: população. Clique num ponto para abrir o município.</p></div></div>
        <div class="ctl" style="margin-bottom:12px">${selSt("resX", "Eixo horizontal", RX)}${selSt("resY", "Eixo vertical", RY)}</div>
        ${typeof d === "string" ? d : `${d.svg}${legGrupos()}<p class="nota">Correlação de Pearson: <b>r = ${nf(d.r, 2)}</b> com ${d.n} municípios. Gasto maior pode ser resposta a problemas maiores (causalidade reversa), e municípios ricos gastam e têm melhores indicadores ao mesmo tempo (variável omitida).</p>`}</section>
      <div class="explica" style="margin-top:16px"><h3>E o Ideb?</h3><p>O Inep não permite a coleta automática dos arquivos do Ideb a partir dos servidores usados na atualização desta página; o indicador de educação fica, por ora, na taxa de alfabetização do Censo 2022. A mortalidade infantil em municípios pequenos oscila muito de um ano para outro (poucos nascimentos); por isso a dispersão usa os últimos cinco anos juntos e só municípios com 100 nascimentos ou mais.</p></div>`;
  }

  /* ---------- aba: mapa ---------- */
  let MALHA = null, malhaFalhou = false;
  const SEQ = ["#1d3b33", "#1f6f54", "#2fa36b", "#8fd14f", "#e8f56b"];
  function mapaAba(){
    if (!MALHA){
      main.innerHTML = `<p class="nota">${malhaFalhou ? "A malha municipal ainda não foi gerada pela coleta de dados." : "Carregando a malha municipal…"}</p>`;
      if (!malhaFalhou) fetch("data/malha.json").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(g => { MALHA = g; if (st.aba === "mapa") mapaAba(); }).catch(() => { malhaFalhou = true; if (st.aba === "mapa") mapaAba(); });
      return;
    }
    const ms = sel().filter(m => MALHA[m.c]?.length), aL = anoCom(ms, x => x.lrf && x.lrf[1] != null), ult = D.eleicoes[D.eleicoes.length - 1];
    const IND = {
      orient: { n: `Orientação do prefeito eleito em ${ult}`, cat: m => grupo(nota(m.ele?.[ult]?.[0])), v: m => nota(m.ele?.[ult]?.[0]), f: v => nf(v, 1) },
      invpc: { n: `Investimento por habitante (${REF})`, v: m => indiv(m, REF, "invpc"), f: brl },
      transf: { n: `Transferências em % da receita (${REF})`, v: m => indiv(m, REF, "transf"), f: v => pct(v, 0) },
      pessoal: { n: `Despesa com pessoal em % da RCL (${aL})`, v: m => m.f[aL]?.lrf?.[1], f: v => `${nf(v, 1)}%` },
      isf: { n: `Índice de saúde fiscal (${aL})`, v: m => isf(m, aL), f: v => nf(v, 2) },
      peso: { n: "Peso da agropecuária no PIB", v: m => m.peso, f: v => pct(v, 0) },
      desm: { n: "Desmatamento PRODES acumulado (km²)", v: desmAcum, f: v => nf(v, 0) },
      tmi: RY.tmi, esgoto: RY.esgoto,
    };
    const I = IND[st.mapa] || IND.orient;
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    ms.forEach(m => MALHA[m.c].forEach(r => { for (let i = 0; i < r.length; i += 2){ x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); } }));
    const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), W0 = largura(), s = Math.min(W0 / ((x1 - x0) * k || 1), 700 / ((y1 - y0) || 1));
    const W = (x1 - x0) * k * s, H = (y1 - y0) * s;
    const caminho = r => { let d = ""; for (let i = 0; i < r.length; i += 2) d += `${i ? "L" : "M"}${((r[i] - x0) * k * s).toFixed(1)},${((y1 - r[i + 1]) * s).toFixed(1)}`; return d + "Z"; };
    let cor, leg, L = null;
    const modoL = st.mapaModo === "l";
    if (modoL){
      L = lisa(ms, I.v, `${st.mapa}|${st.uf}|${D.atualizado}|${aL}|${ms.length}`);
      const cont = {}; if (L) L.tipo.forEach(t => { cont[t] = (cont[t] || 0) + 1; });
      cor = m => L?.tipo.has(m.c) ? TIPOS_LISA[L.tipo.get(m.c)][1] : "#1f1f23";
      leg = `<div class="leg">${Object.entries(TIPOS_LISA).map(([t, [n, c]]) => `<span><i style="background:${c}"></i>${esc(n)} (${cont[t] || 0})</span>`).join("")}<span><i style="background:#1f1f23"></i>sem dado</span></div>`;
    } else if (I.cat){
      cor = m => I.cat(m).c;
      leg = `<div class="leg">${[...MODOS[st.modo], SEM].map(g => `<span><i style="background:${g.c}"></i>${esc(g.n)}</span>`).join("")}</div>`;
    } else {
      const vs = ms.map(m => I.v(m)).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
      const cortes = [.2, .4, .6, .8].map(q => vs[Math.floor(q * (vs.length - 1))]);
      const classe = v => cortes.filter(c => v > c).length;
      cor = m => { const v = I.v(m); return v == null || !isFinite(v) ? "#2a2e35" : SEQ[classe(v)]; };
      const lim = [vs[0], ...cortes, vs[vs.length - 1]];
      leg = vs.length ? `<div class="leg">${SEQ.map((c, i) => `<span><i style="background:${c}"></i>${esc(I.f(lim[i]))} a ${esc(I.f(lim[i + 1]))}</span>`).join("")}<span><i style="background:#2a2e35"></i>sem dado</span></div>` : "";
    }
    const valor = m => (modoL && L?.tipo.has(m.c) ? `${TIPOS_LISA[L.tipo.get(m.c)][0]} · ` : "") + (I.cat ? I.cat(m).n : I.f(I.v(m)));
    const paths = ms.map(m => `<path d="${MALHA[m.c].map(caminho).join("")}" fill="${cor(m)}" stroke="#08090b" stroke-width=".4" data-mun="${m.c}" style="cursor:pointer"><title>${esc(m.n)} (${m.uf}): ${esc(valor(m))}</title></path>`).join("");
    let painelL = "";
    if (modoL && L){
      const sigI = L.p < .01 ? "significativa a 1%" : L.p < .05 ? "significativa a 5%" : L.p < .1 ? "significativa a 10%" : "não significativa";
      const pts = L.pts.map((o, i) => { const t = L.tipo.get(o.m.c); return { x: L.z[i], y: L.lag[i], c: TIPOS_LISA[t][1], id: o.m.c, t: `${o.m.n} (${o.m.uf}) · ${TIPOS_LISA[t][0]}\n${I.n}: ${I.f(o.x)}` }; });
      const d = dispersao(pts, { fx: v => nf(v, 1), fy: v => nf(v, 1), nx: "Valor do município (desvios-padrão)", ny: "Média dos 6 vizinhos", alto: 320, w: Math.min(largura(), 560) });
      painelL = `<div class="grid" style="margin-top:16px">
        <section class="panel"><h2>I de Moran global</h2>
          <div class="kpis" style="margin-top:10px">
            <div class="kpi"><span>I de Moran</span><b>${nf(L.I, 3)}</b><small>esperado sem padrão espacial: ${nf(L.EI, 3)}</small></div>
            <div class="kpi"><span>Pseudo valor-p</span><b>${L.p < .002 ? "&lt; 0,002" : nf(L.p, 3)}</b><small>${sigI} (499 permutações)</small></div>
          </div>
          <p class="nota">${L.I > 0 && L.p < .05 ? "<b>Há dependência espacial positiva:</b> municípios vizinhos tendem a ter valores parecidos (altos perto de altos, baixos perto de baixos)." : L.I < 0 && L.p < .05 ? "<b>Há dependência espacial negativa:</b> vizinhos tendem a ter valores opostos." : "Não há evidência de padrão espacial: os valores parecem distribuídos ao acaso no mapa."} ${L.n} municípios; vizinhança: os ${K_VIZ} municípios mais próximos de cada um (pelos centroides), com pesos iguais.</p>
          <p class="nota">Em regressões com dados municipais, dependência espacial viola a hipótese de observações independentes: os erros-padrão comuns ficam pequenos demais. Alternativas: erros-padrão de Conley, modelos de defasagem ou de erro espacial (pacotes <b>spdep</b> e <b>spatialreg</b> no R; <b>PySAL</b> no Python).</p></section>
        <section class="panel"><h2>Diagrama de dispersão de Moran</h2><p class="sub">Cada ponto é um município: o seu valor padronizado contra a média dos vizinhos. A inclinação da reta é o I de Moran. Quadrante superior direito: alto cercado de alto; inferior esquerdo: baixo cercado de baixo.</p>${typeof d === "string" ? d : d.svg}</section>
      </div>`;
    } else if (modoL) painelL = `<p class="nota" style="margin-top:16px">Poucos municípios com o dado para calcular o LISA.</p>`;
    main.innerHTML = `<section class="panel"><div class="hd"><div><h2>${esc(I.n)}${modoL ? ": aglomerados espaciais (LISA)" : ""}</h2><p class="sub">${ms.length} municípios. ${modoL ? "Coloridos só os municípios com associação local significativa a 5% (499 permutações condicionais). Com muitos testes ao mesmo tempo, alguns aglomerados aparecem por acaso: leia os blocos grandes, não os municípios isolados. " : I.cat ? "" : "Cinco faixas com o mesmo número de municípios (quintis). "}Passe o mouse para ver o valor; clique para abrir a ficha.</p></div>
      <div class="ctl" style="padding:8px 12px">${selSt("mapa", "Indicador", IND)}<div class="f"><span>Mostrar</span>${segSt("mapaModo", [["v", "Valores"], ["l", "Aglomerados (LISA)"]])}</div></div></div>
      <svg class="ch mapa" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" aria-label="Mapa: ${esc(I.n)}" style="max-width:${W.toFixed(0)}px;margin:0 auto">${paths}</svg>${leg}
      <p class="nota">Malha municipal do IBGE (projeto geodata-br), simplificada para a página.${modoL && st.mapa === "orient" ? " No LISA, a orientação entra pela posição do partido na escala ideológica (0 a 10)." : ""}</p></section>${painelL}`;
  }

  /* ---------- comparador e download ---------- */
  const CORES_COMP = ["#c8f250", "#60a5fa", "#f5b83d", "#f87171"];
  function comparador(){
    const cs = st.comp.map(c => M.find(m => m.c === c)).filter(Boolean);
    if (!cs.length) return "";
    const CM = ["invpc", "recpc", "tribpc", "desppc", "convpc", "saudepc", "educpc"];
    if (!CM.includes(st.cmet)) st.cmet = "invpc";
    const ser = cs.map((m, i) => ({ n: `${m.n} (${m.uf})`, c: CORES_COMP[i], v: Object.fromEntries(ANOS.map(a => [a, indiv(m, a, st.cmet)])) }));
    const aL = anoCom(cs, x => x.lrf && x.lrf[1] != null);
    const linhasC = [
      ["População", m => nf(m.pop?.[REF])], [`Investimento/hab. ${REF}`, m => brl(indiv(m, REF, "invpc"))], [`Transferências % ${REF}`, m => pct(indiv(m, REF, "transf"), 0)],
      [`Pessoal % RCL ${aL}`, m => m.f[aL]?.lrf?.[1] == null ? "—" : `${nf(m.f[aL].lrf[1], 1)}%`], [`Saúde fiscal ${aL}`, m => nf(isf(m, aL), 2)], ["Agro no PIB", m => pct(m.peso, 0)],
      ["Desmatamento acumulado", m => desmAcum(m) == null ? "—" : `${nf(desmAcum(m), 1)} km²`], ["Mortalidade infantil", m => nf(tmiMun(m), 1)], ["Rede de esgoto (2022)", m => m.censo ? `${nf(m.censo[0], 0)}%` : "—"],
      ["Prefeito atual", m => { const e = m.ele?.[D.eleicoes[D.eleicoes.length - 1]]; return e ? esc(e[0]) : "—"; }]];
    return `<section class="panel" style="margin-bottom:16px"><div class="hd"><div><h2>Comparador</h2><p class="sub">Até quatro municípios. Abra a ficha de um município e use “Comparar” para incluí-lo; clique num nome abaixo para retirá-lo.</p>
        <div class="leg">${cs.map((m, i) => `<button type="button" class="chip" data-comp="${m.c}" title="Retirar do comparador"><i style="background:${CORES_COMP[i]}"></i>${esc(m.n)} (${m.uf}) ×</button>`).join("")}</div></div>
      ${segSt("cmet", CM.map(k => [k, MET[k].n.replace(" por habitante", "/hab.").replace("Transferências voluntárias", "Voluntárias").replace("Receita tributária própria", "Receita própria")]))}</div>
      ${linhas(ser, { anos: ANOS, fmt: brl, alto: 240 })}
      <div class="tbwrap"><table class="tb"><thead><tr><th>Indicador</th>${cs.map(m => `<th>${esc(m.n)}</th>`).join("")}</tr></thead><tbody>${linhasC.map(([n, f]) => `<tr><td>${esc(n)}</td>${cs.map(m => `<td class="num">${f(m)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }
  /* painel município-ano para o Excel (";" e vírgula decimal) ou para R, Stata e Python ("," e ponto) */
  function baixarCsv(sep){
    const ms = sel(), dec = v => v == null || v === "" ? "" : typeof v === "number" ? (sep === ";" ? String(v).replace(".", ",") : String(v)) : /[";,\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
    const anos = [...new Set(ms.flatMap(m => [...Object.keys(m.fin || {}), ...Object.keys(m.desm || {}), ...Object.keys(m.tmi || {})]))].filter(a => +a >= 2016).sort();
    const rc = D.rc_nomes || [];
    const cab = ["codigo_ibge", "municipio", "uf", "ano", "populacao", "partido_prefeito", "escala_ideologica", "orientacao", "prefeito_2o_mandato", "partido_governador", "alinhado_governador",
      "receita_rs_mil", "transferencias_rs_mil", "receita_tributaria_rs_mil", "despesa_rs_mil", "investimento_rs_mil", ...rc.map(n => `rec_${n}_rs_mil`), "saude_rs_mil", "educacao_rs_mil",
      "rcl_rs_mil", "pessoal_pct_rcl", "dcl_pct_rcl", "restos_pagar_np_rs_mil", "caixa_liquido_rs_mil", "resultado_primario_rs_mil", "meta_primario_rs_mil", "saude_pct_impostos", "educacao_mde_pct_impostos",
      "pib_rs_mil", "pib_agro_rs_mil", "emprego_total", "emprego_agro", "obitos_infantis", "nascidos_vivos", "desmatamento_km2", "focos_queimadas", "esgoto_rede_2022_pct", "alfabetizacao_2022_pct", "ipca_indice"];
    const out = [cab.join(sep)];
    ms.forEach(m => anos.forEach(a => {
      const fi = m.fin?.[a] || [], r = m.rc?.[a] || [], fn = m.fn?.[a] || {}, l = m.lrf?.[a] || [], E = eleicaoDo(+a), e = m.ele?.[E], sc = e ? nota(e[0]) : null, c7 = cat7(sc), g = govDo(m.uf, +a);
      const al = alinhado(m, a);
      out.push([m.c, m.n, m.uf, +a, m.pop?.[a], e?.[0], sc, c7 ? CATS.find(c => c[0] === c7)[1] : "", m.reel?.[E], g, al == null ? "" : +al,
        fi[0], fi[1], fi[2], fi[3], fi[4], ...rc.map((_, i) => r[i]), m.fn?.[a] ? fn["10"] || 0 : "", m.fn?.[a] ? fn["12"] || 0 : "",
        l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], m.pib?.[a]?.[0], m.pib?.[a]?.[1], m.emp?.[a]?.[0], m.emp?.[a]?.[1], m.tmi?.[a]?.[0], m.tmi?.[a]?.[1],
        m.desm?.[a], m.fogo?.[a], m.censo?.[0], m.censo?.[1], D.ipca?.[a]].map(dec).join(sep));
    }));
    const blob = new Blob([(sep === ";" ? "﻿" : "") + out.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `financas_municipais${st.uf ? "_" + st.uf : ""}${sep === ";" ? "_excel" : ""}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- aba: correlações ---------- */
  /* uma linha por município; períodos médios para suavizar anos atípicos */
  const mediaLrf = (m, i) => { const v = ULT().map(a => m.f[a]?.lrf?.[i]).filter(x => x != null); return v.length >= 2 ? media(v) : null; };
  const VARS = [
    { n: "Ideologia do prefeito", a: (m, a) => scoreAno(m, a),  l: "Escala ideológica do partido do prefeito eleito em 2020 (0 = esquerda, 10 = direita)", v: m => nota(m.ele?.["2020"]?.[0]), f: v => nf(v, 1) },
    { n: "População (log)", a: (m, a) => m.pop?.[a] ? Math.log10(m.pop[a]) : null,  l: "Logaritmo decimal da população", v: m => m.pop?.[REF] ? Math.log10(m.pop[REF]) : null, f: v => nf(10 ** v) },
    { n: "PIB por habitante", a: (m, a) => m.pib?.[a]?.[0] && m.pop?.[a] ? m.pib[a][0] * 1e3 * deflator(a) / m.pop[a] : null,  l: RX.pib.n, v: pibpc, f: brl },
    { n: "Peso do agro no PIB", a: (m, a) => m.pib?.[a]?.[0] && m.pib[a][1] != null ? m.pib[a][1] / m.pib[a][0] : null,  l: XS.peso.n, v: XS.peso.v, f: XS.peso.f },
    { n: "Lavouras por habitante", a: (m, a) => m.agro?.[a] && m.pop?.[a] ? (m.agro[a][0] + m.agro[a][1] + m.agro[a][2]) / m.pop[a] : null,  l: XS.soja.n, v: XS.soja.v, f: XS.soja.f },
    { n: "Expansão das lavouras", l: XS.expansao.n, v: XS.expansao.v, f: XS.expansao.f },
    { n: "Investimento/hab.", a: (m, a) => indiv(m, a, "invpc"),  l: YS.inv.n, v: YS.inv.v, f: brl },
    { n: "Receita própria/hab.", a: (m, a) => indiv(m, a, "tribpc"),  l: YS.tribpc.n, v: YS.tribpc.v, f: brl },
    { n: "Transferências %", a: (m, a) => indiv(m, a, "transf"),  l: YS.transf.n, v: YS.transf.v, f: YS.transf.f },
    { n: "Voluntárias/hab.", a: (m, a) => indiv(m, a, "convpc"),  l: "Transferências voluntárias por habitante, média 2021–2024", v: m => periodo(m, ULT(), "convpc"), f: brl },
    { n: "Saúde/hab.", a: (m, a) => indiv(m, a, "saudepc"),  l: RX.saude.n, v: RX.saude.v, f: brl },
    { n: "Educação/hab.", a: (m, a) => indiv(m, a, "educpc"),  l: RX.educ.n, v: RX.educ.v, f: brl },
    { n: "Pessoal % RCL", a: (m, a) => m.f[a]?.lrf?.[1] ?? null,  l: "Despesa com pessoal em % da RCL, média 2021–2024", v: m => mediaLrf(m, 1), f: v => `${nf(v, 1)}%` },
    { n: "Saúde fiscal", a: (m, a) => isf(m, a),  l: "Índice de saúde fiscal, média 2021–2024", v: m => { const v = ULT().map(a => isf(m, a)).filter(x => x != null); return v.length >= 2 ? media(v) : null; }, f: v => nf(v, 2) },
    { n: "Desmatamento", a: (m, a) => m.desm?.[a] ?? null,  l: AMY.desm.n, v: AMY.desm.v, f: AMY.desm.f },
    { n: "Queimadas", a: (m, a) => m.fogo?.[a] ?? null,  l: AMY.fogo.n, v: AMY.fogo.v, f: AMY.fogo.f },
    { n: "Emprego agro", a: (m, a) => m.emp?.[a] && m.pop?.[a] ? 1000 * m.emp[a][1] / m.pop[a] : null,  l: AMY.emp.n, v: AMY.emp.v, f: AMY.emp.f },
    { n: "Mortalidade infantil", a: (m, a) => { const v = m.tmi?.[a]; return v && v[1] >= 50 ? 1000 * v[0] / v[1] : null; },  l: RY.tmi.n, v: RY.tmi.v, f: RY.tmi.f },
    { n: "Rede de esgoto", l: RY.esgoto.n, v: RY.esgoto.v, f: RY.esgoto.f },
    { n: "Alfabetização", l: RY.alfab.n, v: RY.alfab.v, f: RY.alfab.f },
  ];
  const postos = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = Array(a.length);
    for (let i = 0; i < o.length;){ let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  /* r, n e valor-p (t de Student com aproximação normal, adequada para n grande) */
  function correl(xs, ys, spearman){
    const x = [], y = [];
    xs.forEach((v, i) => { if (v != null && isFinite(v) && ys[i] != null && isFinite(ys[i])){ x.push(v); y.push(ys[i]); } });
    const n = x.length; if (n < 10) return null;
    const { r } = spearman ? ols(postos(x), postos(y)) : ols(x, y);
    const t = Math.abs(r) < 1 ? r * Math.sqrt((n - 2) / (1 - r * r)) : Infinity;
    return { r, n, p: isFinite(t) ? normalP(t) : 0 };
  }
  /* intervalo de 95% pela transformação z de Fisher */
  const icR = (r, n) => { if (n < 4) return [null, null]; const z = Math.atanh(Math.max(-.9999, Math.min(.9999, r))), e = 1.96 / Math.sqrt(n - 3); return [Math.tanh(z - e), Math.tanh(z + e)]; };
  /* barras horizontais de correlação, de −1 a +1, com intervalo de confiança */
  function barrasR(itens, { w = largura(), rotulo = 170 } = {}){
    if (!itens.length) return `<p class="nota">Poucos municípios para calcular.</p>`;
    const lh = 24, pt = 22, alto = pt + itens.length * lh + 8, x0 = rotulo + 8, x1 = w - 64, X = r => x0 + (r + 1) / 2 * (x1 - x0);
    return `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Correlações em barras">
      ${[-1, -.5, 0, .5, 1].map(t => `<line class="${t ? "gl" : "zero"}" x1="${X(t)}" x2="${X(t)}" y1="${pt - 4}" y2="${alto - 6}"/><text class="ax" x="${X(t)}" y="12" text-anchor="middle">${t > 0 ? "+" : ""}${nf(t, 1)}</text>`).join("")}
      ${itens.map((q, k) => { const y = pt + k * lh, c = q.r >= 0 ? "#2dd4bf" : "#f97316";
        return `<g ${q.st ? `data-st="${q.st}" style="cursor:pointer"` : ""}><rect x="0" y="${y}" width="${w}" height="${lh}" fill="transparent"/><text class="ax" x="${rotulo}" y="${y + lh / 2 + 4}" text-anchor="end" style="fill:var(--ink-2)">${esc(q.n)}</text>
          <rect x="${Math.min(X(0), X(q.r))}" y="${y + 5}" width="${Math.max(1, Math.abs(X(q.r) - X(0)))}" height="${lh - 10}" rx="3" fill="${c}" fill-opacity="${q.destaque ? 1 : .75}"/>
          ${q.lo != null ? `<line x1="${X(q.lo)}" x2="${X(q.hi)}" y1="${y + lh / 2}" y2="${y + lh / 2}" stroke="var(--ink)" stroke-width="1.4"/><line x1="${X(q.lo)}" x2="${X(q.lo)}" y1="${y + 8}" y2="${y + lh - 8}" stroke="var(--ink)"/><line x1="${X(q.hi)}" x2="${X(q.hi)}" y1="${y + 8}" y2="${y + lh - 8}" stroke="var(--ink)"/>` : ""}
          <text class="ax" x="${x1 + 6}" y="${y + lh / 2 + 4}" style="fill:var(--ink)">${q.r >= 0 ? "+" : "−"}${nf(Math.abs(q.r), 2)}</text>
          <title>${esc(q.n)}: r = ${nf(q.r, 2)}${q.lo != null ? `, intervalo de 95% de ${nf(q.lo, 2)} a ${nf(q.hi, 2)}` : ""} (n = ${q.nn})</title></g>`; }).join("")}
    </svg>`;
  }
  const forca = r => { const a = Math.abs(r); return a < .1 ? "nula" : a < .3 ? "fraca" : a < .5 ? "moderada" : "forte"; };
  function correlacoes(){
    const ms = sel(), sp = st.corr === "s", K = VARS.length;
    const col = VARS.map(V => ms.map(m => V.v(m)));
    const R = VARS.map(() => Array(K).fill(null));
    for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++){ R[i][j] = R[j][i] = correl(col[i], col[j], sp); }
    const curto = largura() < 640;
    const [ci, cj] = (st.cxy || "6-3").split("-").map(Number);
    // ranking
    const pares = [];
    for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (R[i][j]) pares.push({ i, j, ...R[i][j] });
    pares.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const sigTxt = p => p < .001 ? "***" : p < .01 ? "**" : p < .05 ? "*" : "";
    const linha = q => `<tr data-st="cxy:${q.i}-${q.j}" style="cursor:pointer"><td>${esc(VARS[q.i].n)} × ${esc(VARS[q.j].n)}</td><td class="num" style="color:${q.r >= 0 ? "#2dd4bf" : "#f97316"}">${q.r >= 0 ? "+" : "−"}${nf(Math.abs(q.r), 2)}${sigTxt(q.p)}</td><td>${forca(q.r)}</td><td class="num">${nf(q.n)}</td></tr>`;
    // 1) uma variável contra todas as outras
    const cv = Math.min(K - 1, Math.max(0, +st.cvar || 0));
    const comIc = o => { const [lo, hi] = icR(o.r, o.nn); return { ...o, lo, hi }; };
    const perfil = VARS.map((V, j) => j === cv || !R[cv][j] ? null : comIc({ n: V.n, r: R[cv][j].r, nn: R[cv][j].n, st: `cxy:${cv}-${j}` })).filter(Boolean).sort((a, b) => b.r - a.r);
    const rotB = curto ? 112 : 170;
    // 2) o par escolhido em cada estado (todos os estados, mesmo com o filtro ligado)
    const parUf = D.ufs.map(uf => { const g = M.filter(m => m.uf === uf), c2 = correl(g.map(m => VARS[cj].v(m)), g.map(m => VARS[ci].v(m)), sp);
      return c2 ? comIc({ n: `${uf} (${c2.n})`, r: c2.r, nn: c2.n, st: `uf:${uf}`, destaque: uf === st.uf }) : null; }).filter(Boolean).sort((a, b) => b.r - a.r);
    const geralPar = correl(M.map(m => VARS[cj].v(m)), M.map(m => VARS[ci].v(m)), sp);
    // 3) o par escolhido ano a ano
    const anosC = [...new Set(M.flatMap(m => [...Object.keys(m.fin || {}), ...Object.keys(m.desm || {})]))].filter(a => +a >= 2016).sort();
    let tempo = `<p class="nota">${!VARS[ci].a ? esc(VARS[ci].n) : esc(VARS[cj].n)} não varia de ano para ano no painel (${(!VARS[ci].a ? VARS[ci] : VARS[cj]).l.includes("Censo") ? "vem do Censo 2022" : "é uma medida do período todo"}). Escolha outro par na matriz.</p>`;
    let nAnos = 0;
    if (VARS[ci].a && VARS[cj].a){
      const ser = { r: {}, lo: {}, hi: {} };
      anosC.forEach(a => { const c3 = correl(ms.map(m => VARS[cj].a(m, a)), ms.map(m => VARS[ci].a(m, a)), sp); if (!c3 || c3.n < 30) return; const [lo, hi] = icR(c3.r, c3.n); ser.r[a] = c3.r; ser.lo[a] = lo; ser.hi[a] = hi; nAnos++; });
      tempo = nAnos ? linhas([{ n: `r de ${sp ? "Spearman" : "Pearson"}`, c: "#2dd4bf", v: ser.r }, { n: "Limites do intervalo de 95%", c: "#71717a", dash: true, v: ser.lo }, { n: " ", c: "#71717a", dash: true, v: ser.hi }],
        { anos: anosC.filter(a => ser.r[a] != null), fmt: v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), 2)}`, alto: 260, w: Math.min(largura(), 560) }).replace(/<span><i style="background:#71717a"><\/i> <\/span>/, "") : `<p class="nota">Poucos municípios com os dois dados em cada ano.</p>`;
    }
    // dispersão do par escolhido
    const X = VARS[cj], Y = VARS[ci], c = R[ci]?.[cj];
    const pts = ms.map(m => { const g = grupo(nota(m.ele?.["2020"]?.[0])); return { x: X.v(m), y: Y.v(m), c: g.c, id: m.c, t: `${m.n} (${m.uf}) · ${g.n}\n${X.n}: ${X.f(X.v(m))}\n${Y.n}: ${Y.f(Y.v(m))}` }; }).filter(p => p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y));
    const d = ci !== cj ? dispersao(pts, { fx: X.f, fy: Y.f, nx: X.l, ny: Y.l }) : "";
    main.innerHTML = `
      <div class="explica"><h3>Como ler</h3><p>A correlação vai de −1 a +1 e mede quanto duas características dos municípios${st.uf ? ` de ${st.uf}` : ""} andam juntas. <b style="color:#2dd4bf">Verde-água</b>: as duas sobem juntas; <b style="color:#f97316">laranja</b>: quando uma sobe, a outra desce. <b>Pearson</b> mede relação linear e é sensível a valores extremos; <b>Spearman</b> usa a ordem (postos) e capta qualquer relação que só sobe ou só desce. Correlação não é causa: veja as abas Economia política e Eleições acirradas.</p></div>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>${esc(VARS[cv].n)} contra todas as outras</h2><p class="sub">Correlação com cada uma das outras ${K - 1} variáveis, da mais positiva à mais negativa (${ms.length} municípios; finanças: médias de 2021 a 2024, a preços de ${REF}). O traço sobre a barra é o intervalo de 95% (transformação z de Fisher): se ele cruza o zero, a correlação não é significativa a 5%. Clique numa barra para ver o gráfico do par.</p></div>
        <div class="ctl" style="padding:8px 12px"><label class="f"><span>Variável</span><select data-stsel="cvar">${VARS.map((V, i) => `<option value="${i}" ${i === cv ? "selected" : ""}>${esc(V.n)}</option>`).join("")}</select></label>
          <div class="f"><span>Coeficiente</span>${segSt("corr", [["p", "Pearson"], ["s", "Spearman"]])}</div></div></div>
        ${barrasR(perfil, { rotulo: rotB })}</section>
      <section class="panel" style="margin-top:16px"><div class="hd"><div><h2>${esc(Y.n)} × ${esc(X.n)}</h2><p class="sub">${c ? `r de ${sp ? "Spearman" : "Pearson"} = <b>${nf(c.r, 2)}</b> (${forca(c.r)}), ${nf(c.n)} municípios, valor-p ${c.p < .001 ? "&lt; 0,001" : nf(c.p, 3)}. Linha: mínimos quadrados.` : "Poucos municípios com os dois dados."} Cor: orientação do prefeito eleito em 2020. Clique num ponto para abrir o município.</p></div>
        <div class="ctl" style="padding:8px 12px">
          <label class="f"><span>Eixo vertical</span><select id="cPY">${VARS.map((V, i) => `<option value="${i}" ${i === ci ? "selected" : ""}>${esc(V.n)}</option>`).join("")}</select></label>
          <label class="f"><span>Eixo horizontal</span><select id="cPX">${VARS.map((V, i) => `<option value="${i}" ${i === cj ? "selected" : ""}>${esc(V.n)}</option>`).join("")}</select></label></div></div>
          ${typeof d === "string" ? d : `${d.svg}${legGrupos()}`}</section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>${esc(Y.n)} × ${esc(X.n)}, por estado</h2><p class="sub">A mesma correlação calculada dentro de cada UF (entre parênteses, o número de municípios). ${geralPar ? `Na região toda: <b>r = ${nf(geralPar.r, 2)}</b>.` : ""} Estados com menos de 10 municípios com dado ficam de fora. Clique num estado para filtrar a página.</p>
          ${barrasR(parUf, { w: Math.min(largura(), 560), rotulo: 70 })}
          <p class="nota">Se a relação muda de sinal ou de força entre estados, a correlação da região mistura situações diferentes (heterogeneidade; no limite, o paradoxo de Simpson). Estados com poucos municípios (AP, RR, AC) têm intervalos largos.</p></section>
        <section class="panel"><h2>${esc(Y.n)} × ${esc(X.n)}, ano a ano</h2><p class="sub">A correlação entre os valores de cada ano${st.uf ? ` em ${st.uf}` : ""}, com o intervalo de 95%. Anos com menos de 30 municípios com os dois dados ficam de fora; o último ano das finanças e do PRODES pode ser parcial.</p>
          ${tempo}</section>
      </div>
      <section class="panel" style="margin-top:16px"><h2>As relações mais fortes</h2><p class="sub">Pares ordenados pelo tamanho da correlação. *** p &lt; 0,001; ** p &lt; 0,01; * p &lt; 0,05. Clique para ver o gráfico.</p>
          <div class="tbwrap"><table class="tb"><thead><tr><th>Par</th><th>r</th><th>Força</th><th>n</th></tr></thead><tbody>${pares.slice(0, 15).map(linha).join("")}</tbody></table></div>
          <p class="nota">Com mais de mil municípios, até correlações fracas (|r| perto de 0,1) são estatisticamente significativas; olhe o tamanho, não só as estrelas. Alguns pares são quase mecânicos (receita própria e PIB, lavouras e emprego agro).</p></section>
      <section class="panel" style="margin-top:16px"><h2>Variáveis</h2><div class="tbwrap"><table class="tb"><thead><tr><th>Nº</th><th style="text-align:left">Variável</th><th style="text-align:left">Definição</th><th>Municípios</th></tr></thead><tbody>
        ${VARS.map((V, i) => `<tr><td class="num">${i + 1}</td><td style="text-align:left">${esc(V.n)}</td><td style="text-align:left;white-space:normal">${esc(V.l)}</td><td class="num">${col[i].filter(v => v != null && isFinite(v)).length}</td></tr>`).join("")}
      </tbody></table></div><p class="nota">Para estimar no R, no Stata ou no Python, baixe o painel completo na aba Municípios (CSV).</p></section>`;
  }

  /* ---------- aba: regressão múltipla ---------- */
  /* coeficientes e R² de uma regressão por mínimos quadrados */
  function ajusta(y, X){
    const inv = inversa(X.map(a => X.map(b => a.reduce((s, v, i) => s + v * b[i], 0)))); if (!inv) return null;
    const Xty = X.map(a => a.reduce((s, v, i) => s + v * y[i], 0)), b = inv.map(r => r.reduce((s, v, j) => s + v * Xty[j], 0));
    const my = media(y), ajust = y.map((_, i) => X.reduce((s, c, j) => s + c[i] * b[j], 0));
    let sr = 0, sq = 0; y.forEach((v, i) => { sr += (v - ajust[i]) ** 2; sq += (v - my) ** 2; });
    return { b, ajust, r2: sq ? 1 - sr / sq : 0 };
  }
  const fmtC = v => v == null || !isFinite(v) ? "—" : Math.abs(v) < 1e-9 ? "0" : `${v < 0 ? "−" : ""}${Math.abs(v) >= 100 ? nf(Math.abs(v), 0) : Math.abs(v) >= 1 ? nf(Math.abs(v), 2) : Math.abs(v) >= .001 ? nf(Math.abs(v), 4) : Math.abs(v).toExponential(2).replace(".", ",")}`;
  const FRACAO = new Set(["Peso do agro no PIB", "Expansão das lavouras", "Transferências %"]);
  function regressao(){
    const ms = sel(), yi = +st.regY, xs = st.regX.filter(j => j !== yi);
    const rows = ms.map(m => ({ m, y: VARS[yi].v(m), x: xs.map(j => VARS[j].v(m)) }))
      .filter(r => r.y != null && isFinite(r.y) && r.x.every(v => v != null && isFinite(v)));
    const n = rows.length, ids = rows.map((_, i) => i);
    const padroniza = arr => { const mu = media(arr), sd = Math.sqrt(media(arr.map(v => (v - mu) ** 2))) || 1; return arr.map(v => (v - mu) / sd); };
    let Y = rows.map(r => r.y), XS = xs.map((_, k) => rows.map(r => r.x[k]));
    if (st.regZ){ Y = padroniza(Y); XS = XS.map(padroniza); }
    const ufs = st.regUF && !st.uf ? [...new Set(rows.map(r => r.m.uf))].sort().slice(1) : [];
    const um = rows.map(() => 1), dum = ufs.map(u => rows.map(r => +(r.m.uf === u)));
    const Xc = [um, ...XS, ...dum], k = Xc.length;
    const ok = xs.length && n > k + 10;
    const full = ok ? mqo(Y, Xc, ids) : null, fit = ok ? ajusta(Y, Xc) : null;
    const simples = XS.map(x => ok ? mqo(Y, [um, x], ids) : null);
    const vif = XS.map((x, j) => { if (!ok) return null; if (XS.length + dum.length < 2) return 1; const a = ajusta(x, [um, ...XS.filter((_, q) => q !== j), ...dum]); return a ? 1 / Math.max(1e-9, 1 - a.r2) : null; });
    const r2 = fit?.r2, r2a = fit ? 1 - (1 - r2) * (n - 1) / (n - k) : null;
    const pv = (b, e) => e ? normalP(b / e) : null;
    const cel = (r, j) => r ? `${fmtC(r.b[j])}${estrelas(r.b[j], r.ep[j])}<br><small style="color:var(--muted)">(${fmtC(r.ep[j])})</small>` : "—";
    const linhasT = xs.map((xj, q) => { const j = q + 1, p = full ? pv(full.b[j], full.ep[j]) : null;
      return `<tr><td style="text-align:left">${esc(VARS[xj].n)}${FRACAO.has(VARS[xj].n) && !st.regZ ? ' <small style="color:var(--muted)">(fração)</small>' : ""}</td>
        <td class="num">${cel(simples[q], 1)}</td><td class="num"><b>${cel(full, j)}</b></td>
        <td class="num">${full ? `${fmtC(full.b[j] - 1.96 * full.ep[j])} a ${fmtC(full.b[j] + 1.96 * full.ep[j])}` : "—"}</td>
        <td class="num">${p == null ? "—" : p < .001 ? "&lt; 0,001" : nf(p, 3)}</td>
        <td class="num" style="color:${vif[q] > 10 ? "#f87171" : vif[q] > 5 ? "#f5b83d" : "inherit"}">${vif[q] == null ? "—" : nf(vif[q], 1)}</td></tr>`; }).join("");
    // resíduos contra valores ajustados
    let resid = "";
    if (fit){
      const pts = rows.map((r, i) => { const g = grupo(nota(r.m.ele?.["2020"]?.[0])), e = Y[i] - fit.ajust[i];
        return { x: fit.ajust[i], y: e, c: g.c, id: r.m.c, t: `${r.m.n} (${r.m.uf})\nAjustado: ${fmtC(fit.ajust[i])}\nResíduo: ${fmtC(e)}` }; });
      const d = dispersao(pts, { fx: fmtC, fy: fmtC, nx: "Valor ajustado pelo modelo", ny: "Resíduo", reta: false, alto: 300 });
      resid = typeof d === "string" ? d : d.svg;
    }
    const eq = full ? `${esc(VARS[yi].n)} = ${fmtC(full.b[0])}${xs.map((xj, q) => ` ${full.b[q + 1] < 0 ? "−" : "+"} ${fmtC(Math.abs(full.b[q + 1]))} × ${esc(VARS[xj].n)}`).join("")}${dum.length ? ` + efeitos de estado` : ""}` : "";
    const leitura = full ? xs.map((xj, q) => { const b = full.b[q + 1], p = pv(b, full.ep[q + 1]), s0 = simples[q]?.b[1];
      const un = st.regZ ? "1 desvio-padrão" : FRACAO.has(VARS[xj].n) ? "10 pontos percentuais" : "1 unidade", fator = !st.regZ && FRACAO.has(VARS[xj].n) ? .1 : 1;
      return `<li><b>${esc(VARS[xj].n)}:</b> mantidas as demais variáveis constantes, cada ${un} a mais corresponde, em média, a ${fmtC(Math.abs(b * fator))}${st.regZ ? " desvio-padrão" : ""} ${b >= 0 ? "a mais" : "a menos"} em ${esc(VARS[yi].n.toLowerCase())} (${p != null && p < .05 ? "significativo a 5%" : "não significativo a 5%"}).${s0 != null && Math.sign(s0) !== Math.sign(b) ? " <b>O sinal muda</b> em relação à regressão simples." : s0 != null && Math.abs(b) < .5 * Math.abs(s0) ? " O efeito cai a menos da metade quando entram os controles." : ""}</li>`; }).join("") : "";
    main.innerHTML = `
      <div class="explica"><h3>Regressão múltipla por mínimos quadrados</h3><p>Estima a relação de cada variável explicativa com a variável dependente <b>mantendo as demais constantes</b>. Compare a coluna <b>simples</b> (só a variável, sem controles) com a <b>múltipla</b>: quando o coeficiente muda muito ao entrar um controle, a correlação simples misturava o efeito de outra variável (<b>viés de variável omitida</b>). Erros-padrão robustos à heterocedasticidade (HC1). VIF acima de 5 sugere multicolinearidade; acima de 10, forte. Cada município é uma observação; as finanças são médias de 2021 a 2024, a preços de ${REF}.</p></div>
      <section class="panel" style="margin-top:16px"><h2>Especificação</h2>
        <div class="ctl" style="margin-top:10px">
          ${selSt("regY", "Variável dependente (Y)", Object.fromEntries(VARS.map((V, i) => [String(i), V])))}
          <div class="f"><span>Opções</span><div class="chks">
            <label class="chk"><input type="checkbox" data-regopt="regUF" ${st.regUF ? "checked" : ""} ${st.uf ? "disabled" : ""}> Efeitos fixos de estado (dummies de UF)</label>
            <label class="chk"><input type="checkbox" data-regopt="regZ" ${st.regZ ? "checked" : ""}> Coeficientes padronizados (beta)</label></div></div>
        </div>
        <div class="f" style="margin-top:12px"><span class="lbl">Variáveis explicativas (X)</span><div class="chks">${VARS.map((V, j) => j === yi ? "" : `<label class="chk"><input type="checkbox" data-regx="${j}" ${xs.includes(j) ? "checked" : ""}> ${esc(V.n)}</label>`).join("")}</div></div></section>
      ${!xs.length ? `<p class="nota" style="margin-top:16px">Marque ao menos uma variável explicativa.</p>` : !full ? `<p class="nota" style="margin-top:16px">Não foi possível estimar: poucos municípios com todos os dados (${n}) ou variáveis perfeitamente colineares.</p>` : `
      <div class="kpis" style="margin-top:16px">
        <div class="kpi"><span>Observações</span><b>${nf(n)}</b><small>municípios com todos os dados${st.uf ? ` em ${st.uf}` : ""}</small></div>
        <div class="kpi"><span>R²</span><b>${nf(r2, 3)}</b><small>parcela da variação de Y explicada</small></div>
        <div class="kpi"><span>R² ajustado</span><b>${nf(r2a, 3)}</b><small>penaliza o número de regressores (${k - 1})</small></div>
        <div class="kpi"><span>Efeitos de estado</span><b>${dum.length ? dum.length + 1 : "não"}</b><small>${dum.length ? `estados; ${ufs.length} dummies, base ${[...new Set(rows.map(r => r.m.uf))].sort()[0]}` : st.uf ? "um estado só no filtro" : "sem dummies de UF"}</small></div>
      </div>
      <section class="panel" style="margin-top:16px"><h2>Resultados: ${esc(VARS[yi].n)}</h2><p class="sub">Coeficiente, com o erro-padrão robusto entre parênteses. *** p &lt; 0,01; ** p &lt; 0,05; * p &lt; 0,1.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th style="text-align:left">Variável</th><th>Simples</th><th>Múltipla</th><th>IC 95% (múltipla)</th><th>Valor-p</th><th>VIF</th></tr></thead><tbody>
          ${linhasT}<tr><td style="text-align:left">Constante</td><td class="num">—</td><td class="num">${cel(full, 0)}</td><td></td><td></td><td></td></tr>
        </tbody></table></div>
        <p class="nota" style="font-family:var(--mono)">${eq}</p>
        <ul class="nota" style="padding-left:18px;line-height:1.6">${leitura}</ul>
        <p class="nota">${st.regZ ? "Com coeficientes padronizados, Y e X estão em desvios-padrão: os coeficientes podem ser comparados entre si." : "Coeficientes nas unidades originais: reais por habitante, km², pontos da escala ideológica etc. As variáveis marcadas como fração vão de 0 a 1 (0,25 = 25%). Para comparar a importância das variáveis, marque “coeficientes padronizados”."} Correlação condicional ainda não é causa: para isso, veja as abas Economia política e Eleições acirradas.</p></section>
      <section class="panel" style="margin-top:16px"><h2>Resíduos × valores ajustados</h2><p class="sub">Num modelo bem especificado, os pontos se espalham ao redor do zero sem forma definida. Um funil indica heterocedasticidade (por isso o erro-padrão robusto); uma curva sugere relação não linear (experimente logaritmos ou outra variável). Clique num ponto para abrir o município.</p>${resid}${legGrupos()}</section>`}`;
  }

  /* ---------- Moran e LISA (autocorrelação espacial) ---------- */
  const K_VIZ = 6;
  const centroide = c => { const r = MALHA[c][0]; let x = 0, y = 0; for (let i = 0; i < r.length; i += 2){ x += r[i]; y += r[i + 1]; } return [2 * x / r.length, 2 * y / r.length]; };
  /* gerador pseudoaleatório com semente fixa: o resultado das permutações não muda a cada clique */
  const sorteador = semente => () => { semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const cacheLisa = new Map();
  function lisa(ms, v, chave){
    if (cacheLisa.has(chave)) return cacheLisa.get(chave);
    const pts = ms.map(m => ({ m, x: v(m) })).filter(o => o.x != null && isFinite(o.x));
    const n = pts.length; if (n < 30){ cacheLisa.set(chave, null); return null; }
    // vizinhos: os 6 municípios mais próximos (centroides), pesos iguais (matriz padronizada na linha)
    const cs = pts.map(o => centroide(o.m.c)), kc = Math.cos(media(cs.map(c => c[1])) * Math.PI / 180);
    const viz = cs.map((a, i) => { const d = []; cs.forEach((b, j) => { if (j !== i) d.push([j, ((a[0] - b[0]) * kc) ** 2 + (a[1] - b[1]) ** 2]); }); d.sort((p, q) => p[1] - q[1]); return d.slice(0, K_VIZ).map(p => p[0]); });
    const mu = media(pts.map(o => o.x)), sd = Math.sqrt(media(pts.map(o => (o.x - mu) ** 2))) || 1;
    const z = pts.map(o => (o.x - mu) / sd), m2 = z.reduce((s, x) => s + x * x, 0);
    const defasagem = zz => viz.map(vs => vs.reduce((s, j) => s + zz[j], 0) / K_VIZ);
    const lag = defasagem(z), moran = (zz, ll) => zz.reduce((s, x, i) => s + x * ll[i], 0) / m2;
    const I = moran(z, lag), rnd = sorteador(20261025), P = 499;
    let extremos = 0; const zp = z.slice();
    for (let p = 0; p < P; p++){
      for (let i = n - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [zp[i], zp[j]] = [zp[j], zp[i]]; }
      const Ip = moran(zp, defasagem(zp)); if (I >= 0 ? Ip >= I : Ip <= I) extremos++;
    }
    // LISA: permutação condicional (o município fica fixo; os vizinhos são sorteados entre os demais)
    const tipo = new Map(), pl = [];
    z.forEach((zi, i) => {
      const Ii = zi * lag[i]; let ext = 0;
      for (let p = 0; p < P; p++){
        let s = 0; const usados = new Set([i]);
        for (let q = 0; q < K_VIZ; q++){ let j; do { j = Math.floor(rnd() * n); } while (usados.has(j)); usados.add(j); s += z[j]; }
        const Ip = zi * s / K_VIZ; if (Ii >= 0 ? Ip >= Ii : Ip <= Ii) ext++;
      }
      const p = (ext + 1) / (P + 1); pl.push(p);
      tipo.set(pts[i].m.c, p >= .05 ? "ns" : zi > 0 && lag[i] > 0 ? "AA" : zi < 0 && lag[i] < 0 ? "BB" : zi > 0 ? "AB" : "BA");
    });
    const out = { I, p: (extremos + 1) / (P + 1), EI: -1 / (n - 1), n, z, lag, pts, tipo };
    cacheLisa.set(chave, out); return out;
  }
  const TIPOS_LISA = { AA: ["Alto cercado de alto", "#ef4444"], BB: ["Baixo cercado de baixo", "#3b82f6"], AB: ["Alto cercado de baixo", "#fb923c"], BA: ["Baixo cercado de alto", "#93c5fd"], ns: ["Não significativo", "#3f3f46"] };

  /* ---------- aba: método ---------- */
  function metodo(){
    const linhasEscala = Object.entries(D.escala).sort((a, b) => a[1] - b[1]).map(([p, sc]) => { const c = CATS.find(k => sc <= k[2]);
      return `<tr><td>${esc(p)}</td><td class="num">${nf(sc, 2)}</td><td><span class="chip"><i style="background:${c[3]}"></i>${esc(c[1])}</span></td></tr>`; }).join("");
    main.innerHTML = `<div class="grid">
      <div class="explica"><h3>Fontes</h3>
        <p><b>Finanças:</b> Declaração de Contas Anuais (DCA) que cada prefeitura entrega ao Tesouro Nacional (Siconfi). Receita líquida (receitas brutas menos deduções), transferências correntes e de capital, receita tributária, despesa liquidada e <b>investimento</b> (grupo 4.4 da despesa, liquidado). Valores levados a preços de ${REF} pelo IPCA médio de cada ano.</p>
        <p><b>Prefeitos:</b> resultados oficiais do TSE das eleições ordinárias de 2012, 2016, 2020 e 2024; vale o turno decisivo. Cada ano de finanças é atribuído ao prefeito eleito no pleito anterior (2017 a 2020: eleitos em 2016). Eleições suplementares, cassações e trocas de partido durante o mandato não são consideradas.</p>
        <p><b>Agropecuária:</b> IBGE: Produção Agrícola Municipal (área colhida de soja, milho e algodão), Pesquisa da Pecuária Municipal (bovinos) e PIB dos Municípios (peso da agropecuária no PIB). <b>Agro forte</b>: agropecuária com 30% ou mais do PIB, em média, nos três últimos anos publicados; <b>agro médio</b>: 15% a 30%.</p>
        <p><b>População:</b> estimativas do IBGE e Censo 2022, interpoladas nos anos sem estimativa.</p>
        <p><b>Fontes de receita e despesa por função:</b> DCA, Anexos I-C (receitas brutas: FPM, ICMS, ITR, IPVA, CFEM, royalties do petróleo, convênios da União e do estado, transferências especiais e impostos próprios) e I-E (despesa liquidada por função). Os códigos de conta mudaram com o novo ementário de 2022; a coleta usa os dois.</p>
        <p><b>Lei de Responsabilidade Fiscal:</b> Anexo 6 do RGF do Poder Executivo (último quadrimestre ou semestre; municípios com menos de 50 mil habitantes podem publicar o RGF Simplificado): RCL, despesa com pessoal, dívida consolidada líquida, restos a pagar e disponibilidade de caixa; Anexo 14 do RREO (6º bimestre): resultado primário, meta da LDO e percentuais aplicados em saúde e em educação.</p>
        <p><b>Reeleição e governadores:</b> cadastro de candidatos do TSE (prefeito eleito que concorria à reeleição; partido do governador eleito em 2014, 2018 e 2022).</p>
        <p><b>Amazônia:</b> PRODES (Inpe, TerraBrasilis), polígonos anuais de desmatamento da Amazônia e do Cerrado atribuídos ao município pelo ponto central; focos de queimadas do satélite de referência do Inpe; emprego assalariado na agropecuária do Cadastro Central de Empresas do IBGE.</p>
        <p><b>Resultados:</b> mortalidade infantil do SIM e do Sinasc (DATASUS, TabNet), por residência; esgotamento sanitário e alfabetização do Censo 2022. O Ideb não entra porque o Inep bloqueia a coleta automática.</p>
        <p><b>Dados para baixar:</b> na aba Municípios, o painel município-ano completo em CSV, em valores correntes (R$ mil) e com o IPCA para deflacionar.</p>
        <p><b>Recorte:</b> Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR e TO) e, por escolha, Goiás e Mato Grosso do Sul.</p>
        <p>Atualização automática toda semana. Fontes: ${esc(D.fontes)}.</p></div>
      <div class="explica"><h3>Escala ideológica dos partidos</h3>
        <p>Posição de 0 (extrema esquerda) a 10 (extrema direita) atribuída por especialistas: média ponderada das pesquisas de 2018 e 2022 em <b>Bolognesi, Ribeiro, Codato e Silva (2025)</b>, “O desaparecimento do centro ideológico no sistema partidário brasileiro”, <i>Opinião Pública</i>, v. 31. Partidos extintos antes de 2022 (DEM, PSL, PHS, PRP e PPL) usam a média de 2018 de <b>Bolognesi, Ribeiro e Codato (2023)</b>, <i>Dados</i>, v. 66, n. 2. Siglas antigas seguem o partido atual (PMDB → MDB, PR → PL, PRB → Republicanos); o PRD, fusão de PTB e Patriota em 2023, recebe a média dos dois.</p>
        <p>Nenhum partido ficou na faixa de centro (4,5 a 5,5) na pesquisa mais recente; por isso o grupo “Centro” aparece vazio.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Partido</th><th>Escala</th><th>Categoria</th></tr></thead><tbody>${linhasEscala}</tbody></table></div></div>
    </div>`;
  }

  /* ---------- navegação ---------- */
  const ABAS = { geral, fiscal, politica, agro: agroAba, amazonia, resultados, correlacoes, regressao, mapa: mapaAba, mun: munAba, rdd: rddAba, metodo };
  function render(){
    document.querySelectorAll("nav.abas button").forEach(b => b.setAttribute("aria-selected", b.dataset.aba === st.aba));
    (ABAS[st.aba] || ABAS.geral)();
  }
  document.querySelector("nav.abas").addEventListener("click", e => { const b = e.target.closest("[data-aba]"); if (!b) return; st.aba = b.dataset.aba; history.replaceState(null, "", "#" + st.aba); render(); });
  ctl.addEventListener("change", e => { if (e.target.id === "fUf"){ st.uf = e.target.value; render(); } });
  ctl.addEventListener("click", e => { const b = e.target.closest("[data-modo]"); if (!b) return; st.modo = b.dataset.modo; controles(); render(); });
  main.addEventListener("click", e => {
    const t = e.target.closest("[data-met],[data-ord],[data-mun],[data-voltar],[data-st],[data-comp],[data-csv]");
    if (!t) return;
    if (t.dataset.csv){ baixarCsv(t.dataset.csv); return; }
    if (t.dataset.st){ const [k, v] = t.dataset.st.split(":"); st[k] = v; if (k === "uf") controles(); }
    else if (t.dataset.comp){ const c = +t.dataset.comp, i = st.comp.indexOf(c); if (i >= 0) st.comp.splice(i, 1); else { st.comp.push(c); if (st.comp.length > 4) st.comp.shift(); } }
    else if (t.dataset.met) st.met = t.dataset.met;
    else if (t.dataset.ord) st.ord = t.dataset.ord;
    else if ("voltar" in t.dataset) st.mun = null;
    else if (t.dataset.mun){ st.mun = +t.dataset.mun; st.aba = "mun"; window.scrollTo({ top: 0, behavior: "smooth" }); }
    render();
  });
  main.addEventListener("change", e => {
    const id = e.target.id;
    if (id === "fX") st.x = e.target.value;
    else if (id === "fY") st.y = e.target.value;
    else if (id === "rE") st.rddE = e.target.value;
    else if (id === "rY") st.rddY = e.target.value;
    else if (id === "cPY" || id === "cPX"){ const [y, x] = (st.cxy || "6-3").split("-"); st.cxy = id === "cPY" ? `${e.target.value}-${x}` : `${y}-${e.target.value}`; }
    else if (e.target.dataset.stsel) st[e.target.dataset.stsel] = e.target.value;
    else if (e.target.dataset.regx != null){ const j = +e.target.dataset.regx; st.regX = e.target.checked ? [...new Set([...st.regX, j])].sort((a, b) => a - b) : st.regX.filter(q => q !== j); }
    else if (e.target.dataset.regopt) st[e.target.dataset.regopt] = e.target.checked;
    else if (id === "fMun"){ const v = e.target.value, m = M.find(x => `${x.n} - ${x.uf}` === v); if (m){ st.mun = m.c; } else return; }
    else return;
    render();
  });
  main.addEventListener("input", e => {
    if (e.target.id === "fMun"){ const m = M.find(x => `${x.n} - ${x.uf}` === e.target.value); if (m){ st.mun = m.c; render(); } return; }
    if (e.target.id === "rH"){ st.h = +e.target.value; const y = window.scrollY; rddAba(); window.scrollTo(0, y); } });
  let rt, larg = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (D && main.clientWidth !== larg){ larg = main.clientWidth; render(); } }, 200); });

  fetch("data/municipios.json").then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => {
    D = d; prepara();
    const h = location.hash.slice(1); if (ABAS[h]) st.aba = h;
    controles(); render();
  }).catch(() => { ctl.innerHTML = `<span class="status">Os dados dos municípios ainda não foram coletados ou não puderam ser carregados. Tente mais tarde.</span>`; });
})();
