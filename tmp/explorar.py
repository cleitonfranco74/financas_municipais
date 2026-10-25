import sys, json, collections
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
for cod in (1200013, 1300060, 2100055, 1700251, 5000203):
    for ano in (2023,):
        try:
            r=A.get(A.SICONFI+"rgf", {"an_exercicio":ano,"id_ente":cod}, timeout=120).json().get("items",[])
            c=collections.Counter((i.get("in_periodicidade"),i.get("nr_periodo"),i.get("co_poder"),i.get("anexo")) for i in r)
            o.append(f"== rgf {cod} {ano}: {len(r)}\n"+"\n".join(f"{k} {v}" for k,v in sorted(c.items(), key=str)[:40]))
            r=A.get(A.SICONFI+"rreo", {"an_exercicio":ano,"id_ente":cod,"nr_periodo":6}, timeout=120).json().get("items",[])
            c=collections.Counter((i.get("anexo"),i.get("demonstrativo") or i.get("co_tipo_demonstrativo")) for i in r)
            o.append(f"== rreo {cod} {ano}: {len(r)}\n"+"\n".join(f"{k} {v}" for k,v in sorted(c.items(), key=str)[:40]))
            ex=A.get(A.SICONFI+"extrato_entregas", {"id_ente":cod,"an_referencia":ano}, timeout=120).json().get("items",[])
            o.append(f"== extrato {cod}: "+"\n".join(f'{i.get("entregavel")} | {i.get("periodicidade")} {i.get("periodo")} | {i.get("forma_envio")} | {i.get("status_relatorio")}' for i in ex if "RGF" in str(i.get("entregavel")) or "RREO" in str(i.get("entregavel")))[:2500])
        except Exception as e:
            o.append(f"== {cod} ERRO {e}")
open("tmp/teste_coletor.txt","w").write("\n".join(o))
