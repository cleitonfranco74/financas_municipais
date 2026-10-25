import sys
sys.path.insert(0, "scripts")
import atualizar_municipios as A
r=A.get(A.SICONFI+"rreo", {"an_exercicio":2023,"nr_periodo":6,"co_tipo_demonstrativo":"RREO","no_anexo":"RREO-Anexo 14","id_ente":5107909}, timeout=120).json()["items"]
open("tmp/teste_coletor.txt","w").write("\n".join(sorted({f'{i.get("cod_conta")} | {i.get("coluna")} | {i.get("valor")}' for i in r if "Saude" in str(i.get("cod_conta")) or "Ensino" in str(i.get("cod_conta")) or "%" in str(i.get("coluna"))})))
