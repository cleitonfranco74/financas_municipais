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
  const st = { aba: "geral", uf: "", modo: "4", met: "invpc", mun: null, x: "peso", y: "inv", h: 20, rddE: "2016+2020", rddY: "inv", ord: "invpc" };

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
        f: Object.fromEntries(Object.entries(m.fin || {}).map(([a, v]) => [a, { rec: v[0] * 1e3 * deflator(a), tr: v[1] * 1e3 * deflator(a), trib: v[2] * 1e3 * deflator(a),
          desp: v[3] * 1e3 * deflator(a), inv: v[4] * 1e3 * deflator(a), pop: m.pop?.[a] || null }])) };
    });
  }
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
  };
  const agrega = (ms, a, met) => {
    let n = 0, d = 0, c = 0;
    ms.forEach(m => { const x = m.f[a]; if (!x || !x.pop) return; n += MET[met].num(x); d += MET[met].den(x); c++; });
    return d > 0 ? { v: n / d, n: c } : { v: null, n: c };
  };
  const indiv = (m, a, met) => { const x = m.f[a]; return x && x.pop && MET[met].den(x) > 0 ? MET[met].num(x) / MET[met].den(x) : null; };

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
        <div class="seg" role="group" aria-label="Indicador">${Object.entries(MET).map(([k2, v]) => `<button type="button" data-met="${k2}" aria-pressed="${st.met === k2}">${esc(v.n.replace(" por habitante", "/hab.").replace(" em % da despesa", " % desp.").replace("Transferências em % da receita", "Transferências %").replace("Receita tributária própria", "Receita própria"))}</button>`).join("")}</div></div>
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
    const busca = `<div class="ctl" style="margin-bottom:16px"><label class="f busca" style="flex:1 1 280px"><span>Município</span><input type="search" id="fMun" list="lMun" placeholder="Digite o nome, por exemplo Sinop" value="${m ? esc(`${m.n} - ${m.uf}`) : ""}"></label>${m ? `<button type="button" class="seg" data-voltar style="height:40px;padding:0 14px;font-weight:700">Ver ranking</button>` : ""}${lista}</div>`;
    if (!m){
      const ords = { invpc: "Investimento por habitante", invdesp: "Investimento em % da despesa", tribpc: "Receita própria por habitante", transf: "Dependência de transferências" };
      const rows = ms.map(x => ({ m: x, v: indiv(x, REF, st.ord) })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
      main.innerHTML = busca + `<section class="panel"><div class="hd"><div><h2>Ranking de ${REF}</h2><p class="sub">${rows.length} municípios com contas de ${REF}${st.uf ? ` em ${st.uf}` : ""}. Clique para abrir a ficha.</p></div>
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
      return `<tr><td>${MANDATO[e]}</td><td><b>${esc(v[0])}</b></td><td>${chipGrupo(sc)}</td><td class="num">${sc != null ? nf(sc, 2) : "—"}</td><td class="num">${v[2] ? `${pct(marg)} sobre ${esc(v[2])}` : "candidato único"}${v[5] === 2 ? " · 2º turno" : ""}</td></tr>`; }).join("");
    const x = m.f[REF];
    main.innerHTML = busca + `
      <section class="panel"><h2>${esc(m.n)} <small style="color:var(--muted);font-weight:600">${m.uf}</small></h2><p class="sub">${nf(m.pop?.[REF])} habitantes em ${REF} · agropecuária ${m.peso != null ? `com ${pct(m.peso, 0)} do PIB` : "sem dado de PIB"}</p>
        <div class="kpis">
          <div class="kpi"><span>Investimento ${REF}</span><b>${brlC(x?.inv)}</b><small>${brl(indiv(m, REF, "invpc"))} por habitante</small></div>
          <div class="kpi"><span>Investimento na despesa</span><b>${pct(indiv(m, REF, "invdesp"))}</b><small>despesa de ${brlC(x?.desp)}</small></div>
          <div class="kpi"><span>Receita ${REF}</span><b>${brlC(x?.rec)}</b><small>${pct(indiv(m, REF, "transf"), 0)} de transferências</small></div>
          <div class="kpi"><span>Receita própria</span><b>${brl(indiv(m, REF, "tribpc"))}</b><small>por habitante (impostos e taxas)</small></div>
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
  };
  function periodoMandato(m, E, met){ const v = [1, 2, 3, 4].map(i => indiv(m, String(E + i), met)).filter(x => x != null); return v.length ? media(v) : null; }
  function amostraRdd(){
    const eleicoes = st.rddE === "2016+2020" ? [2016, 2020] : [+st.rddE];
    const out = [];
    sel().forEach(m => eleicoes.forEach(E => {
      const v = m.ele?.[String(E)]; if (!v || !v[2] || !v[4]) return;
      const l1 = lado(nota(v[0])), l2 = lado(nota(v[2]));
      if (!l1 || !l2 || l1 === l2) return;
      const vE = l1 === "E" ? v[1] : v[3], vD = l1 === "E" ? v[3] : v[1];
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
    const pts = amostraRdd(), h = st.h, Y = RDDY[st.rddY];
    const dir = wls(pts.filter(p => p.x >= 0), h), esq = wls(pts.filter(p => p.x < 0), h);
    const tau = dir && esq ? dir.a - esq.a : null, ep = dir && esq ? Math.sqrt(dir.ep ** 2 + esq.ep ** 2) : null;
    const z = tau != null && ep ? tau / ep : null, p = z != null ? normalP(z) : null;
    // médias por faixa de 2,5 pontos para o gráfico
    const bw = Math.max(1, h / 8), bins = {};
    pts.filter(q => Math.abs(q.x) <= h).forEach(q => { const k = Math.floor(q.x / bw); (bins[k] = bins[k] || []).push(q.y); });
    const meios = Object.entries(bins).map(([k, ys]) => ({ x: (+k + .5) * bw, y: media(ys), n: ys.length }));
    const w = largura(), alto = 340, pl = 64, pr = 12, pt = 14, pb = 36;
    const ysV = [...meios.map(b => b.y), ...(esq ? [esq.a, esq.a - esq.b * h] : []), ...(dir ? [dir.a, dir.a + dir.b * h] : [])];
    let svg = `<p class="nota">Poucas eleições entre esquerda e direita nesta faixa. Aumente a faixa ou escolha outro recorte.</p>`;
    if (ysV.length > 1){
      let lo = Math.min(...ysV), hi = Math.max(...ysV); const pad = (hi - lo) * .15 || 1; lo -= pad; hi += pad;
      const X = v => pl + (v + h) / (2 * h) * (w - pl - pr), Yp = v => pt + (hi - v) / (hi - lo) * (alto - pt - pb);
      const tk = [0, .25, .5, .75, 1].map(t => lo + t * (hi - lo));
      svg = `<svg class="ch" viewBox="0 0 ${w} ${alto}" role="img" aria-label="Regressão descontínua">
        ${tk.map(t => `<line class="gl" x1="${pl}" x2="${w - pr}" y1="${Yp(t)}" y2="${Yp(t)}"/><text class="ax" x="${pl - 6}" y="${Yp(t) + 4}" text-anchor="end">${esc(Y.f(t))}</text>`).join("")}
        ${[-h, -h / 2, 0, h / 2, h].map(t => `<text class="ax" x="${X(t)}" y="${alto - 18}" text-anchor="middle">${t > 0 ? "+" : ""}${nf(t, 0)}</text>`).join("")}
        <text class="ax" x="${(pl + w - pr) / 2}" y="${alto - 2}" text-anchor="middle">Margem da esquerda sobre a direita (pontos percentuais)</text>
        <line x1="${X(0)}" x2="${X(0)}" y1="${pt}" y2="${alto - pb}" stroke="var(--ink-2)" stroke-dasharray="4 4"/>
        <text class="ax" x="${X(-h / 2)}" y="${pt + 12}" text-anchor="middle">venceu a direita</text><text class="ax" x="${X(h / 2)}" y="${pt + 12}" text-anchor="middle">venceu a esquerda</text>
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
      <div class="explica"><h3>A ideia</h3><p>Comparar todos os municípios governados pela esquerda com todos os governados pela direita mistura o efeito do prefeito com as diferenças entre os lugares. A <b>regressão descontínua</b> olha só para eleições <b>decididas por pouco</b> entre um candidato de esquerda e um de direita: perto da margem zero, quem venceu é quase um sorteio, e os municípios dos dois lados são parecidos. O <b>salto</b> da linha no zero estima o efeito de eleger um prefeito de esquerda em vez de um de direita.</p></div>
      <div class="ctl" style="margin-top:16px">
        <label class="f"><span>Eleições</span><select id="rE">${[["2016+2020", "2016 e 2020 (mandatos completos)"], ["2016", "2016 (mandato 2017–2020)"], ["2020", "2020 (mandato 2021–2024)"], ["2024", "2024 (só os primeiros anos)"]].map(([k, n]) => `<option value="${k}" ${k === st.rddE ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="f"><span>Resultado</span><select id="rY">${Object.entries(RDDY).map(([k, v]) => `<option value="${k}" ${k === st.rddY ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select></label>
        <label class="f"><span>Faixa em torno do zero: ±${h} p.p.</span><input type="range" id="rH" min="4" max="50" step="1" value="${h}"></label>
      </div>
      <section class="panel" style="margin-top:16px"><h2>${esc(Y.n)} × margem da esquerda</h2><p class="sub">${pts.length} eleições entre esquerda (escala &lt; 4,5) e direita (&gt; 5,5) no recorte; ${(esq?.n || 0) + (dir?.n || 0)} dentro da faixa. Pontos: médias por faixa de ${nf(bw, 1)} p.p.; linhas: regressão linear local com peso triangular.</p>
        ${svg}
        <div class="res">
          <div class="kpi"><span>Efeito estimado (salto)</span><b style="color:var(--accent)">${tau == null ? "—" : `${tau >= 0 ? "+" : "−"}${Y.f(Math.abs(tau))}`}</b><small>${sig}</small></div>
          <div class="kpi"><span>Erro-padrão robusto</span><b>${ep == null ? "—" : Y.f(ep)}</b><small>intervalo de 95%: ${tau == null ? "—" : `${Y.f(tau - 1.96 * ep)} a ${Y.f(tau + 1.96 * ep)}`}</small></div>
          <div class="kpi"><span>Valor-p</span><b>${p == null ? "—" : nf(p, 3)}</b><small>teste z bicaudal</small></div>
          <div class="kpi"><span>Eleições na faixa</span><b>${(esq?.n || 0) + (dir?.n || 0)}</b><small>${esq?.n || 0} venceu a direita · ${dir?.n || 0} venceu a esquerda</small></div>
        </div>
        <p class="nota">${tau == null ? "" : `Leitura: nas eleições decididas por pouco, municípios que elegeram um prefeito de esquerda tiveram, em média, ${Y.f(Math.abs(tau))} ${tau >= 0 ? "a mais" : "a menos"} de ${Y.n.toLowerCase()} do que os que elegeram um de direita. ${p != null && p >= .1 ? "A diferença não é estatisticamente significativa: não dá para descartar que seja zero." : `A diferença é estatisticamente ${sig}.`}`} Mude a faixa: se o efeito muda muito de sinal ou tamanho, a estimativa é frágil.</p>
      </section>
      <div class="grid" style="margin-top:16px">
        <section class="panel"><h2>Quantas eleições em cada margem</h2><p class="sub">Se houvesse manipulação do resultado, apareceria um acúmulo logo de um lado do zero (teste de McCrary).</p>${hist}</section>
        <div class="explica"><h3>Cuidados</h3><p>• Só entram eleições em que os dois primeiros colocados ficaram em lados opostos da escala; partidos sem classificação ficam de fora.</p><p>• A amostra é pequena, e o erro-padrão é grande; a escolha da faixa troca viés por variância (faixas estreitas têm menos viés e mais ruído).</p><p>• O efeito vale para municípios com eleições disputadas, não para todos.</p><p>• Para um trabalho acadêmico, use a faixa ótima de Calonico, Cattaneo e Titiunik (pacote <b>rdrobust</b> no R ou no Stata) e agrupe os erros por município.</p></div>
      </div>`;
  }

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
        <p><b>Recorte:</b> Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR e TO) e, por escolha, Goiás e Mato Grosso do Sul.</p>
        <p>Atualização automática toda semana. Fontes: ${esc(D.fontes)}.</p></div>
      <div class="explica"><h3>Escala ideológica dos partidos</h3>
        <p>Posição de 0 (extrema esquerda) a 10 (extrema direita) atribuída por especialistas: média ponderada das pesquisas de 2018 e 2022 em <b>Bolognesi, Ribeiro, Codato e Silva (2025)</b>, “O desaparecimento do centro ideológico no sistema partidário brasileiro”, <i>Opinião Pública</i>, v. 31. Partidos extintos antes de 2022 (DEM, PSL, PHS, PRP e PPL) usam a média de 2018 de <b>Bolognesi, Ribeiro e Codato (2023)</b>, <i>Dados</i>, v. 66, n. 2. Siglas antigas seguem o partido atual (PMDB → MDB, PR → PL, PRB → Republicanos); o PRD, fusão de PTB e Patriota em 2023, recebe a média dos dois.</p>
        <p>Nenhum partido ficou na faixa de centro (4,5 a 5,5) na pesquisa mais recente; por isso o grupo “Centro” aparece vazio.</p>
        <div class="tbwrap"><table class="tb"><thead><tr><th>Partido</th><th>Escala</th><th>Categoria</th></tr></thead><tbody>${linhasEscala}</tbody></table></div></div>
    </div>`;
  }

  /* ---------- navegação ---------- */
  const ABAS = { geral, agro: agroAba, mun: munAba, rdd: rddAba, metodo };
  function render(){
    document.querySelectorAll("nav.abas button").forEach(b => b.setAttribute("aria-selected", b.dataset.aba === st.aba));
    ABAS[st.aba]();
  }
  document.querySelector("nav.abas").addEventListener("click", e => { const b = e.target.closest("[data-aba]"); if (!b) return; st.aba = b.dataset.aba; history.replaceState(null, "", "#" + st.aba); render(); });
  ctl.addEventListener("change", e => { if (e.target.id === "fUf"){ st.uf = e.target.value; render(); } });
  ctl.addEventListener("click", e => { const b = e.target.closest("[data-modo]"); if (!b) return; st.modo = b.dataset.modo; controles(); render(); });
  main.addEventListener("click", e => {
    const t = e.target.closest("[data-met],[data-ord],[data-mun],[data-voltar]");
    if (!t) return;
    if (t.dataset.met) st.met = t.dataset.met;
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
