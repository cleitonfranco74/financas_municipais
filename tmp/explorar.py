import sys, json, re, time, ftplib, socket
sys.path.insert(0, "scripts")
import requests
import atualizar_municipios as A
o = []
def t(nome, f, lim=2500):
    t0 = time.time()
    try: o.append(f"== {nome} ({time.time()-t0:.0f}s)\n{str(f())[:lim]}")
    except Exception as e: o.append(f"== {nome} ERRO {type(e).__name__}: {str(e)[:300]}")
S = "https://apisidra.ibge.gov.br/values/"
def sid(c):
    d = requests.get(S + c, timeout=120).json()
    return "\n".join(" | ".join(str(l.get(k)) for k in ("D2N", "D3N", "D4C", "D4N", "V")) for l in d[1:])
# 1 Cempre: unidades locais e empresas por seção CNAE, último ano
t("cempre 6450 Sinop", lambda: sid("t/6450/n6/5107909/v/706,707,708/p/last%201/c12762/all"), 6000)
t("cempre 6449?", lambda: sid("t/6449/n6/5107909/v/all/p/last%201"), 1500)
# 2 PIB por setor 2021
t("pib 5938 Sinop", lambda: sid("t/5938/n6/5107909/v/37,498,513,517,6575,525/p/2020,2021,2022,2023"), 3000)
# 3 DCA I-C: todas as transferências (códigos), três ementários
for ano in (2017, 2020, 2023):
    def f(ano=ano):
        r = A.get(A.SICONFI + "dca", {"an_exercicio": ano, "id_ente": 5107909, "no_anexo": "DCA-Anexo I-C"}, timeout=90).json()["items"]
        return "\n".join(sorted({f'{i["cod_conta"]} | {i["conta"][:75]} | {round(i["valor"] or 0)}' for i in r if i["coluna"] == "Receitas Brutas Realizadas" and re.match(r"RO(1\.7|2\.4)", i["cod_conta"])}))
    t(f"dca {ano} transferências", f, 9000)
# 4 RREO Anexo 12 (saúde) e 08 (MDE)
for anexo in ("RREO-Anexo 12", "RREO-Anexo 08"):
    def g(anexo=anexo):
        r = A.get(A.SICONFI + "rreo", {"an_exercicio": 2023, "nr_periodo": 6, "co_tipo_demonstrativo": "RREO", "no_anexo": anexo, "id_ente": 5107909}, timeout=90).json()["items"]
        return f"{len(r)} linhas\n" + "\n".join(sorted({f'{i["cod_conta"][:70]} | {i["coluna"][:40]} | {i["valor"]}' for i in r if re.search("Investiment|Capital|FUNDEB|Fundeb|TotalDasDespesas|Pessoal", i["cod_conta"] or "")}))
    t(f"rreo 2023 {anexo}", g, 5000)
# 5 Receita Federal CNPJ
for u in ("https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/", "https://dadosabertos.rfb.gov.br/CNPJ/"):
    t(f"cnpj {u}", lambda u=u: (lambda r: (r.status_code, re.findall(r'href="([^"]+)"', r.text)[-15:]))(requests.get(u, timeout=60)))
# 6 PNI TabNet
for d in ("pni/cnv/cpnimt.def", "pni/cnv/cpniuf.def", "pni/cnv/dpnimt.def"):
    def h(d=d):
        r = requests.get("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?" + d, timeout=60)
        pg = r.content.decode("latin-1")
        return r.status_code, re.findall(r"<title>(.*?)</title>", pg, re.I), re.findall(r'VALUE="([a-z]{3,6}\d\d\.dbf)"', pg, re.I)[:30], re.findall(r'NAME="(Linha|Coluna|Incremento)"(.*?)</SELECT>', pg, re.S | re.I)[:3] and [re.findall(r'VALUE="([^"]+)"', x[1])[:25] for x in re.findall(r'NAME="(Linha|Coluna|Incremento)"(.*?)</SELECT>', pg, re.S | re.I)]
    t(f"pni {d}", h, 3000)
# 7 Tesouro Transparente: transferências constitucionais
t("tesouro ckan", lambda: [ (r["name"], r.get("url")) for r in requests.get("https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=transferencias-constitucionais-realizadas", timeout=60).json()["result"]["resources"]][:20])
# 8 PDET FTP (RAIS / Novo Caged)
def ftp():
    f = ftplib.FTP("ftp.mtps.gov.br", timeout=40); f.login(); out = f.nlst("/pdet/microdados/"); f.quit(); return out
t("pdet ftp", ftp)
# 9 FNDE dados abertos (SIOPE)
t("fnde ckan", lambda: requests.get("https://www.fnde.gov.br/dadosabertos/api/3/action/package_search?q=siope&rows=10", timeout=60).text[:1500])
# 10 SIOPS
t("siops", lambda: requests.get("http://siops.datasus.gov.br/consleirespfiscal.php", timeout=60).status_code)
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
