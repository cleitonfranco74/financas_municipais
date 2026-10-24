import sys, json, time, os, io, csv, zipfile, re, requests
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
def t(nome, f):
    try: o.append(f"== {nome}\n{str(f())[:3000]}")
    except Exception as e: o.append(f"== {nome} ERRO {e}")
S="https://apisidra.ibge.gov.br/values/"
for c in ["t/6450/n6/5107909/v/708/p/last%201/c12762/all","t/6450/n6/5107909/v/all/p/last%201","t/6450/n3/51/v/708/p/all/c12762/117897","t/6450/n6/in%20n3%2051/v/708/p/2021/c12762/all","t/6450/n6/5107909/v/708/p/all"]:
    t(c, lambda: requests.get(S+c, timeout=120).text[:1500])
# DCA 2020 pequeno
r=A.get(A.SICONFI+"dca", {"an_exercicio":2020,"id_ente":5100102,"no_anexo":"DCA-Anexo I-C"}, timeout=90).json()["items"]
t("dca2020 contas", lambda: "\n".join(sorted({f'{i["cod_conta"]} | {i["conta"][:60]} | {i["coluna"]} | {i["valor"]}' for i in r if i["cod_conta"].startswith(("RO1.7","RO2.4","RO1.1.1"))}))
# candidatos 2020
z=zipfile.ZipFile(io.BytesIO(A.get(A.TSE_CAND.format(2020), timeout=900).content))
nome=next(n for n in z.namelist() if n.endswith("_2020_MT.csv"))
with z.open(nome) as f:
    rows=list(csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"))
t("cab", lambda: list(rows[0].keys()))
el=[l for l in rows if l["CD_CARGO"]=="11" and l.get("DS_SIT_TOT_TURNO","").upper()=="ELEITO"]
from collections import Counter
t("eleitos", lambda: (len(el), Counter(l["CD_TIPO_ELEICAO"] for l in el), Counter(l.get("ST_REELEICAO") for l in el)))
t("sit", lambda: Counter(l.get("DS_SIT_TOT_TURNO") for l in rows if l["CD_CARGO"]=="11"))
# tabnet raw
defin="sinasc/cnv/nvmt.def"
import atualizar_municipios as AA
orig=AA.requests.post
def post(*a, **k):
    r=orig(*a, **k); o.append("== RAW\n"+re.search(r"<PRE>(.*?)</PRE>", r.content.decode("latin-1"), re.S|re.I).group(1)[:1200]); return r
AA.requests.post=post
t("tab", lambda: AA.tabnet("sinasc","MT",list(range(2016,2027))).get("510790"))
open("tmp/teste_coletor.txt","w").write("\n".join(o))
