import sys, json, re, io, csv, zipfile
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
def t(nome, f):
    try: o.append(f"== {nome}\n{str(f())[:20000]}")
    except Exception as e: o.append(f"== {nome} ERRO {e}")
def lin(i): return " | ".join(str(i.get(k))[:70] for k in ("cod_conta","conta","valor"))
for ano in (2018, 2020):
    r=A.get(A.SICONFI+"dca", {"an_exercicio":ano,"id_ente":5107909,"no_anexo":"DCA-Anexo I-C"}, timeout=90).json()["items"]
    t(f"dca{ano}", lambda: "\n".join(sorted({lin(i) for i in r if i["coluna"]=="Receitas Brutas Realizadas" and i["cod_conta"].startswith(("RO1.7.1.8","RO1.7.2.8","RO2.4","RO1.7.1.9","RO1.7.2.9"))})))
t("emp", lambda: A.get("https://apisidra.ibge.gov.br/values/t/6450/n6/in%20n3%2051/v/708/p/last%208/c12762/117897,116830", timeout=200).text[:600])
t("cand2008", lambda: A.get(A.TSE_CAND.format(2008), timeout=600).status_code)
orig=A.requests.post
def post(*a, **k):
    r=orig(*a, **k); x=r.content.decode("latin-1"); o.append("== RAW\n"+"\n".join(l for l in x.splitlines() if "SINOP" in l or "Munic" in l)[:3000]); return r
A.requests.post=post
t("tab", lambda: A.tabnet("sinasc","MT",list(range(2016,2027))).get("510790"))
open("tmp/teste_coletor.txt","w").write("\n".join(o))
