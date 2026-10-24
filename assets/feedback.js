/* Feedback de quem usa o site.
 * - Botão fixo "Dê sua opinião": nota (1 a 5), perfil, comentário e e-mail opcional para resposta.
 * - "Esta ferramenta foi útil?" (👍/👎) em cada elemento <div data-fb-util="Nome da ferramenta">.
 * - Nota média do site em cada elemento com o atributo data-fb-media.
 * As respostas vão para uma Planilha Google (script em scripts/feedback_planilha.gs, que também
 * avisa por e-mail). Enquanto PLANILHA estiver vazia, a caixa envia pelo FormSubmit e o 👍/👎 e a
 * nota média ficam escondidos.
 * Uso: <script src="feedback.js" data-site="Nome do site" data-cor="#c8f250" data-perfis="A|B|Outro" defer></script> */
(() => {
  const PLANILHA = "";   // URL do app da Web do Apps Script (termina em /exec)
  const RESERVA = "https://formsubmit.co/ajax/cleitonfranco@unemat.br";
  const MIN_AVAL = 5;    // avaliações mínimas para mostrar a nota média
  const me = document.currentScript;
  const SITE = me?.dataset.site || document.title, COR = me?.dataset.cor || "#c8f250";
  const PERFIS = me?.dataset.perfis ? me.dataset.perfis.split("|") :
    ["Aluno(a) de graduação", "Aluno(a) de pós-graduação", "Professor(a)", "Investidor(a) ou poupador(a)", "Produtor(a) rural", "Profissional do mercado financeiro", "Outro"];
  const ROTULOS = ["", "Ruim", "Fraco", "Bom", "Muito bom", "Excelente"];
  const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const grava = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const limpa = s => String(s).replace(/[<>&"]/g, "");

  const css = `
  .fb-btn{position:fixed;right:18px;bottom:18px;z-index:9998;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border-radius:999px;border:0;
    background:${COR};color:#0b0d06;font:700 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,0,0,.6)}
  .fb-btn.fb-mini{width:44px;padding:0;font-size:18px}
  .fb-btn.fb-mini .fb-rot{display:none}
  .fb-btn:hover{filter:brightness(1.06)}
  .fb-btn:focus-visible,.fb-box :focus-visible,.fb-util :focus-visible{outline:2px solid ${COR};outline-offset:3px}
  @media print{.fb-btn,.fb-box,.fb-util{display:none!important}}
  @media (max-width:600px){body{padding-bottom:64px}}
  .fb-box{position:fixed;right:18px;bottom:74px;z-index:9999;width:min(380px,calc(100vw - 36px));max-height:calc(100vh - 100px);overflow:auto;
    background:#121412;color:#eef0ea;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;box-shadow:0 24px 60px -12px rgba(0,0,0,.75);
    font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
  .fb-box[hidden]{display:none}
  .fb-box h2{margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em}
  .fb-box p{margin:0 0 12px;color:#a7ada2;font-size:13px}
  .fb-box label{display:block;margin:12px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a7ada2}
  .fb-box label small{text-transform:none;letter-spacing:0;font-weight:400}
  .fb-stars{display:flex;gap:4px;align-items:center}
  .fb-stars button{border:0;background:none;padding:2px;font-size:28px;line-height:1;cursor:pointer;color:#3a3f38}
  .fb-stars button.on{color:${COR}}
  .fb-stars span{margin-left:8px;font-size:13px;color:#a7ada2}
  .fb-box select,.fb-box textarea,.fb-box input[type=email],.fb-util textarea{width:100%;box-sizing:border-box;background:#0b0c0b;color:#eef0ea;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 10px;font:inherit}
  .fb-box textarea{min-height:96px;resize:vertical}
  .fb-row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}
  .fb-send{border:0;border-radius:999px;background:${COR};color:#0b0d06;padding:10px 18px;cursor:pointer;font:inherit;font-weight:800}
  .fb-send[disabled]{opacity:.55;cursor:default}
  .fb-close{position:absolute;top:10px;right:12px;border:0;background:none;color:#a7ada2;font-size:22px;line-height:1;cursor:pointer}
  .fb-msg{font-size:13px;color:#a7ada2}
  .fb-msg.err{color:#ff7a6b}
  .fb-ok{text-align:center;padding:18px 4px}
  .fb-ok b{display:block;font-size:30px;margin-bottom:6px}
  .fb-hp{position:absolute;left:-5000px}
  .fb-util{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:18px 0;padding:12px 16px;border-radius:14px;
    border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:inherit}
  .fb-util .fb-uq{flex:1 1 200px;font-weight:700}
  .fb-util .fb-ub{display:flex;gap:8px}
  .fb-util button{border:1px solid rgba(255,255,255,.18);background:none;color:inherit;border-radius:999px;padding:7px 14px;font:inherit;cursor:pointer}
  .fb-util button:hover{border-color:${COR}}
  .fb-util button.fb-send{background:${COR};border-color:${COR};color:#0b0d06;font-weight:800}
  .fb-util textarea{flex:1 1 100%;min-height:64px;resize:vertical}
  .fb-util .fb-msg{flex:1 1 auto}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const pagina = () => (location.pathname.split("/").pop() || "index.html") + location.hash;

  /* Envia para a planilha; sem planilha, a caixa usa o FormSubmit (que só manda e-mail). */
  async function enviar(d){
    if (PLANILHA){
      // corpo em text/plain: o Apps Script não responde à verificação prévia (preflight) de CORS
      const r = await fetch(PLANILHA, { method: "POST", body: JSON.stringify({ site: SITE, pagina: pagina(), ...d }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || "falha");
      return;
    }
    const r = await fetch(RESERVA, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        _subject: `Feedback ${SITE}: ${d.nota ? d.nota + "/5" : "sem nota"}${d.perfil ? " · " + d.perfil : ""}`,
        _template: "table", _captcha: "false", ...(d.email ? { _replyto: d.email } : {}),
        Site: SITE, "Página": pagina(), Nota: d.nota ? `${d.nota} de 5 (${ROTULOS[d.nota]})` : "não informada",
        Perfil: d.perfil || "não informado", "Comentário": d.comentario || "(sem comentário)",
        "E-mail para resposta": d.email || "não informado", Data: new Date().toLocaleString("pt-BR"),
      }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.success) !== "true") throw new Error(j.message || "falha");
  }

  /* ---------- Caixa de opinião ---------- */
  const CHAVE_ENVIO = "fb:enviado:" + SITE;
  const btn = document.createElement("button");
  btn.className = "fb-btn" + (ler(CHAVE_ENVIO) ? " fb-mini" : ""); btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-controls", "fb-box"); btn.setAttribute("aria-label", "Dê sua opinião");
  btn.innerHTML = `<span aria-hidden="true">💬</span><span class="fb-rot" aria-hidden="true">Dê sua opinião</span>`;
  const box = document.createElement("div");
  box.className = "fb-box"; box.id = "fb-box"; box.hidden = true; box.setAttribute("role", "dialog"); box.setAttribute("aria-labelledby", "fb-tit");
  const form = () => `
    <button type="button" class="fb-close" aria-label="Fechar">×</button>
    <h2 id="fb-tit">O que você achou?</h2>
    <p>Sua opinião ajuda a melhorar o ${limpa(SITE)}. O envio é anônimo, a menos que você deixe seu e-mail.</p>
    <form novalidate>
      <label id="fb-nl">Nota</label>
      <div class="fb-stars" role="radiogroup" aria-labelledby="fb-nl">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="false" data-n="${n}" aria-label="${n} de 5: ${ROTULOS[n]}">★</button>`).join("")}<span id="fb-rot">escolha de 1 a 5</span></div>
      <label for="fb-perfil">Você é</label>
      <select id="fb-perfil" name="perfil"><option value="">Selecione</option>${PERFIS.map(p=>`<option>${limpa(p)}</option>`).join("")}</select>
      <label for="fb-txt">Comentário</label>
      <textarea id="fb-txt" name="comentario" maxlength="2000" placeholder="O que foi útil? O que faltou ou não funcionou? Sugestões são bem-vindas."></textarea>
      <label for="fb-mail">Quer resposta? <small>Deixe seu e-mail (opcional)</small></label>
      <input id="fb-mail" name="email" type="email" maxlength="120" autocomplete="email" placeholder="seu@email.com">
      <input class="fb-hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="fb-row"><span class="fb-msg" id="fb-msg" aria-live="polite"></span><button type="submit" class="fb-send">Enviar</button></div>
    </form>`;
  box.innerHTML = form();
  document.body.append(btn, box);

  let nota = 0;
  const abrir = () => { box.hidden = false; btn.setAttribute("aria-expanded", "true"); (box.querySelector(".fb-stars button") || box.querySelector(".fb-close")).focus(); };
  const fechar = () => { box.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); };
  const pinta = n => box.querySelectorAll(".fb-stars button").forEach(b => { b.classList.toggle("on", +b.dataset.n <= n); b.setAttribute("aria-checked", String(+b.dataset.n === n)); });
  btn.addEventListener("click", () => box.hidden ? abrir() : fechar());
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) fechar(); });
  box.addEventListener("click", e => {
    if (e.target.closest(".fb-close")) return fechar();
    const s = e.target.closest(".fb-stars button");
    if (s){ nota = +s.dataset.n; pinta(nota); box.querySelector("#fb-rot").textContent = `${nota} de 5 · ${ROTULOS[nota]}`; box.querySelector("#fb-msg").textContent = ""; }
  });
  box.addEventListener("input", () => { const m = box.querySelector("#fb-msg"); if (m?.classList.contains("err")) m.textContent = ""; });
  box.addEventListener("mouseover", e => { const s = e.target.closest(".fb-stars button"); if (s) pinta(+s.dataset.n); });
  box.addEventListener("mouseout", e => { if (e.target.closest(".fb-stars")) pinta(nota); });
  box.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, msg = box.querySelector("#fb-msg"), envia = box.querySelector(".fb-send");
    const comentario = f.comentario.value.trim(), perfil = f.perfil.value, email = f.email.value.trim();
    if (f._honey.value) return;                                   // robô preencheu o campo escondido
    const erro = t => { msg.className = "fb-msg err"; msg.textContent = t; };
    if (!nota && !comentario) return erro("Dê uma nota ou escreva um comentário.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("Confira o e-mail ou deixe o campo em branco.");
    envia.disabled = true; msg.className = "fb-msg"; msg.textContent = "Enviando…";
    try {
      await enviar({ tipo: "caixa", nota, perfil, comentario, email });
      grava(CHAVE_ENVIO, new Date().toISOString()); btn.classList.add("fb-mini");
      box.innerHTML = `<button type="button" class="fb-close" aria-label="Fechar">×</button><div class="fb-ok" role="status"><b aria-hidden="true">🙏</b><h2 id="fb-tit">Obrigado!</h2><p>Seu feedback foi enviado.${email ? " Se couber resposta, ela chega no seu e-mail." : ""}</p></div>`;
      box.querySelector(".fb-close").focus();
      setTimeout(() => { if (!box.hidden) fechar(); box.innerHTML = form(); nota = 0; }, 4000);
    } catch {
      envia.disabled = false; erro("Não foi possível enviar agora. Tente de novo em instantes.");
    }
  });

  if (!PLANILHA) return;

  /* ---------- "Esta ferramenta foi útil?" ---------- */
  function montaUtil(el){
    el.dataset.fbOk = "1";
    const nome = el.dataset.fbUtil, chave = `fb:util:${SITE}:${nome}`;
    if (ler(chave)) return;                                       // já avaliou esta ferramenta
    el.classList.add("fb-util");
    const pergunta = () => { el.innerHTML = `<span class="fb-uq">Esta ferramenta foi útil?</span><span class="fb-ub"><button type="button" data-u="1">👍 Sim</button><button type="button" data-u="0">👎 Não</button></span>`; };
    const manda = async (util, comentario) => {
      el.innerHTML = `<span class="fb-msg" aria-live="polite">Enviando…</span>`;
      try {
        await enviar({ tipo: "util", util, ferramenta: nome, comentario });
        grava(chave, util ? "sim" : "nao");
        el.innerHTML = `<span class="fb-uq" role="status">Obrigado! 🙏</span>`;
      } catch {
        pergunta(); el.insertAdjacentHTML("beforeend", `<span class="fb-msg err" role="status" style="flex-basis:100%">Não foi possível enviar agora. Tente de novo em instantes.</span>`);
      }
    };
    pergunta();
    el.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.u === "1") return manda(true, "");
      if (b.dataset.u === "0"){
        el.innerHTML = `<label class="fb-uq" for="fb-u-${chave.length}">O que faltou ou não funcionou? <small style="font-weight:400">(opcional)</small></label>
          <textarea id="fb-u-${chave.length}" maxlength="1000"></textarea><button type="button" class="fb-send" data-env>Enviar</button>`;
        return el.querySelector("textarea").focus();
      }
      if ("env" in b.dataset) manda(false, el.querySelector("textarea").value.trim());
    });
  }
  const varre = () => document.querySelectorAll("[data-fb-util]:not([data-fb-ok])").forEach(montaUtil);
  let agendado = 0;
  new MutationObserver(() => { if (!agendado) agendado = requestAnimationFrame(() => { agendado = 0; varre(); }); })
    .observe(document.body, { childList: true, subtree: true });
  varre();

  /* ---------- Nota média do site ---------- */
  const alvos = document.querySelectorAll("[data-fb-media]");
  if (alvos.length) (async () => {
    let res;
    try { res = JSON.parse(sessionStorage.getItem("fb:resumo")); } catch {}
    if (!res || Date.now() - res.t > 6e5){
      try { const r = await fetch(PLANILHA); res = { t: Date.now(), d: await r.json() }; try { sessionStorage.setItem("fb:resumo", JSON.stringify(res)); } catch {} }
      catch { return; }
    }
    const s = res.d?.sites?.[SITE];
    if (!s || !(s.n >= MIN_AVAL)) return;
    alvos.forEach(el => {
      el.innerHTML = `<span style="color:${COR}" aria-hidden="true">★</span> <b>${s.media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b> de 5 · ${s.n.toLocaleString("pt-BR")} avaliações`;
      el.title = "Nota média dada por quem usa o site"; el.hidden = false;
    });
  })();
})();
