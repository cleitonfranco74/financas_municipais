import sys, json, collections
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
for cod in (1200013, 1300060, 1700251):
    for tipo in ("RGF", "RGF Simplificado"):
        for per, n in (("Q", 3), ("S", 2)):
            r=A.get(A.SICONFI+"rgf", {"an_exercicio":2023,"id_ente":cod,"in_periodicidade":per,"nr_periodo":n,"co_tipo_demonstrativo":tipo,"co_poder":"E"}, timeout=120).json().get("items",[])
            c=collections.Counter(i.get("anexo") for i in r)
            o.append(f"== rgf {cod} {tipo} {per}{n}: {len(r)} {dict(c)}")
            if tipo == "RGF Simplificado" and r:
                o.append("\n".join(sorted({f'{i.get("anexo")} | {i.get("cod_conta")} | {i.get("coluna")} | {i.get("valor")}' for i in r}))[:4000])
    for tipo in ("RREO", "RREO Simplificado"):
        r=A.get(A.SICONFI+"rreo", {"an_exercicio":2023,"id_ente":cod,"nr_periodo":6,"co_tipo_demonstrativo":tipo}, timeout=120).json().get("items",[])
        c=collections.Counter(i.get("anexo") for i in r)
        o.append(f"== rreo {cod} {tipo}: {len(r)} {dict(c)}")
        if tipo == "RREO Simplificado" and r:
            o.append("\n".join(sorted({f'{i.get("anexo")} | {i.get("cod_conta")} | {i.get("coluna")} | {i.get("valor")}' for i in r if "14" in str(i.get("anexo")) or "Simplificado" in str(i.get("cod_conta"))}))[:3000])
open("tmp/teste_coletor.txt","w").write("\n".join(o))
