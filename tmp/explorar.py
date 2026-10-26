import sys, json, re, time, ftplib
sys.path.insert(0, "scripts")
import requests
import atualizar_municipios as A
o = []
def t(nome, f, lim=2500):
    t0 = time.time()
    try: r = f(); o.append(f"== {nome} ({time.time()-t0:.0f}s)\n{str(r)[:lim]}")
    except Exception as e: o.append(f"== {nome} ERRO {type(e).__name__}: {str(e)[:300]}")
H = {"User-Agent": "Mozilla/5.0"}
# PNI TabNet (legado)
for d in ("pni/cnv/cpniuf.def", "pni/cnv/cpnimt.def", "pni/cnv/cpnimun.def"):
    t(f"pni deftohtm {d}", lambda d=d: (lambda r: (r.status_code, len(r.content), r.content.decode("latin-1")[:1200]))(requests.get("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?" + d, headers=H, timeout=180)), 1500)
t("pni dhdat", lambda: (lambda r: (r.status_code, r.content.decode("latin-1")[:1500]))(requests.get("http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=180)), 1800)
t("sipni web", lambda: requests.get("http://sipni.datasus.gov.br/si-pni-web/faces/relatorio/consolidado/coberturaVacinal.jsf", headers=H, timeout=60).status_code)
# OpenDataSUS SI-PNI rotina
t("opendatasus pni", lambda: [(r.get("name"), r.get("url")) for r in requests.get("https://opendatasus.saude.gov.br/api/3/action/package_search?q=pni&rows=20", headers=H, timeout=60).json()["result"]["results"]], 4000)
# CNPJ
for u in ("https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/", "https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/2026-09/", "https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9", "https://dados-abertos-rf-cnpj.casadosdados.com.br/"):
    t(f"cnpj {u}", lambda u=u: (lambda r: (r.status_code, r.url, re.findall(r'href="([^"]+)"', r.text)[:40]))(requests.get(u, headers=H, timeout=60)), 3000)
# RAIS e Novo Caged
def lista(p):
    f = ftplib.FTP("ftp.mtps.gov.br", timeout=60, encoding="latin-1"); f.login(); out = []
    f.retrlines("LIST " + p, out.append); f.quit(); return "\n".join(out[-40:])
t("rais", lambda: lista("/pdet/microdados/RAIS/"), 4000)
t("rais 2023", lambda: lista("/pdet/microdados/RAIS/2023/"), 4000)
t("rais 2024", lambda: lista("/pdet/microdados/RAIS/2024/"), 4000)
t("novo caged", lambda: lista("/pdet/microdados/NOVO CAGED/"), 3000)
t("novo caged 2025", lambda: lista("/pdet/microdados/NOVO CAGED/2025/"), 3000)
# SIOPS indicadores municipais (TabNet)
for u in ("http://siops-asp.datasus.gov.br/CGI/deftohtm.exe?SIOPS/serhist/municipio/indicMun.def", "http://siops.datasus.gov.br/rel_indicadores.php"):
    t(f"siops {u}", lambda u=u: (lambda r: (r.status_code, r.content.decode("latin-1")[:1500]))(requests.get(u, headers=H, timeout=90)), 1800)
# MSC orçamentária: despesa por função e natureza
def msc():
    r = A.get(A.SICONFI + "msc_orcamentaria", {"id_ente": 5107909, "an_referencia": 2023, "me_referencia": 12, "co_tipo_matriz": "MSCC", "classe_conta": 6, "id_tv": "period_change"}, timeout=180).json()
    it = r.get("items", [])
    return len(it), r.get("hasMore"), it[:3], sorted({(i.get("conta_contabil"), i.get("natureza_despesa", "")[:2] if i.get("natureza_despesa") else None, i.get("funcao")) for i in it if i.get("funcao") in ("10", "12")})[:40]
t("msc", msc, 5000)
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
