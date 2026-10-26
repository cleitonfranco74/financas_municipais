import sys, json, time, os
sys.path.insert(0, "scripts")
os.environ["CNPJ_ARQUIVOS"] = "6"
import complementos as C
o = []
base = json.load(open("data/municipios.json"))["municipios"]
def novo(): return {m["c"]: {} for m in base}
def t(nome, f):
    t0 = time.time()
    try: r = f(); o.append(f"== {nome} OK {time.time()-t0:.0f}s\n{json.dumps(r, ensure_ascii=False)[:2500]}")
    except Exception as e:
        import traceback; o.append(f"== {nome} ERRO {e}\n{traceback.format_exc()[-1500:]}")
amostra = lambda ms, k: {c: ms[c].get(k) for c in (5107909, 5103403, 1200013, 2111300) if c in ms}
ms = novo(); meta = {}
t("vacinacao", lambda: (C.vacinacao(ms, {}, meta), amostra(ms, "vac"), meta.get("vac_anos"), sum(1 for m in ms.values() if m["vac"]))[1:])
ms = novo(); meta = {"rais_anos": [str(a) for a in range(2016, 2024)]}
t("rais 2024", lambda: (C.rais(ms, {}, meta), amostra(ms, "rais"), meta)[1:])
ms = novo(); meses = []
for a in ("2024", "2025"):
    meses += [n.rsplit("/", 1)[-1] for n in C.ftp_lista(f"/pdet/microdados/NOVO CAGED/{a}/")]
meta = {"caged_meses": [m for m in meses if m != "202509"] + [f"{a}{m:02d}" for a in range(2020, 2024) for m in range(1, 13)] + [f"2026{m:02d}" for m in range(1, 13)]}
t("caged 202509", lambda: (C.caged(ms, {}, meta), amostra(ms, "caged"), meta.get("caged_ate"))[1:])
ms = novo(); meta = {}
t("cnpj arquivo 6", lambda: (C.cnpj(ms, {}, meta), amostra(ms, "cnpj"), meta)[1:])
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
