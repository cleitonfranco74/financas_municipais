import os, sys, json, time, subprocess, collections
os.environ["BRASIL_AMOSTRA"] = "40"
t0 = time.time()
r = subprocess.run([sys.executable, "scripts/brasil.py"], capture_output=True, text=True)
o = [f"tempo {time.time()-t0:.0f}s", "stderr:\n" + r.stderr[-4000:]]
try:
    d = json.load(open("data/brasil.json"))
    ms = d["municipios"]
    o.append(f"municipios {len(ms)}; por UF {collections.Counter(m['uf'] for m in ms).most_common(5)}")
    for k in ("pop", "pib", "fin", "rc", "tr", "fn", "ele", "reel"):
        o.append(f"{k}: {sum(1 for m in ms if m.get(k))}")
    o.append("gov: " + json.dumps(d["gov"])[:600])
    ex = next(m for m in ms if m.get("fin") and m["uf"] == "SP")
    o.append("exemplo SP: " + json.dumps(ex, ensure_ascii=False)[:1500])
    o.append(f"tamanho: {os.path.getsize('data/brasil.json')} bytes")
except Exception as e:
    o.append(f"ERRO {e}")
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
