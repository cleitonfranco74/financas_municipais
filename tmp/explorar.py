import sys, json, time
sys.path.insert(0, "scripts")
import complementos as C
import atualizar_municipios as A
o = []
base = json.load(open("data/municipios.json"))["municipios"]
def t(nome, f):
    t0 = time.time()
    try: r = f(); o.append(f"== {nome} OK {time.time()-t0:.0f}s\n{json.dumps(r, ensure_ascii=False)[:2000]}")
    except Exception as e:
        import traceback; o.append(f"== {nome} ERRO {e}\n{traceback.format_exc()[-1500:]}")
am = lambda ms, k: {c: ms[c].get(k) for c in (5107909, 1200013, 2111300) if c in ms}
ms = {m["c"]: {} for m in base}; meta = {}
t("vacinacao", lambda: (C.vacinacao(ms, {}, meta), am(ms, "vac"), meta.get("vac_anos"), sum(1 for m in ms.values() if m["vac"]))[1:])
ms2 = {m["c"]: {"c": m["c"], "uf": m["uf"]} for m in base}
t("cempre", lambda: (A.cempre(ms2), {c: (ms2[c]["cempre"], ms2[c]["cempre_set"]) for c in (5107909, 1200013)})[1])
def pib():
    out = {}
    ordem = {"37": 0, "513": 1, "517": 2, "6575": 3, "525": 4}
    for l in A.get(A.SIDRA + "t/5938/n6/5107909/v/37,513,517,6575,525/p/all", timeout=120).json()[1:]:
        if int(l["D3C"]) >= 2019: out.setdefault(l["D3C"], [None] * 5)[ordem[l["D2C"]]] = A.valor(l["V"])
    return out
t("pib setores Sinop", pib)
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
