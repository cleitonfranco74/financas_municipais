import requests, json, re, io, zipfile, os, html
H={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
os.chdir("tmp"); o=[]
def g(u, **k):
    try: return requests.get(u, headers=H, timeout=k.pop("timeout",90), **k)
    except Exception as e: return e
def mostra(u, n=600, **k):
    r=g(u, **k)
    if isinstance(r,Exception): o.append(f"== {u} ERRO {str(r)[:150]}"); return None
    o.append(f"== {u} {r.status_code} {len(r.content)} {r.headers.get('content-type')}"); o.append(r.text[:n].replace("\n"," ")); return r
# SIDRA: busca de tabelas
for q in ["nascidos vivos","óbitos menores de 1 ano","óbitos","esgotamento sanitário","abastecimento de água","alfabetização","pessoal ocupado assalariado","Cadastro Central de Empresas"]:
    r=g("https://sidra.ibge.gov.br/Busca", params={"q":q})
    if isinstance(r,Exception): o.append(f"== busca {q} ERRO {str(r)[:120]}"); continue
    ids=re.findall(r'/[Tt]abela/(\d+)', r.text); nomes=re.findall(r'Tabela (\d+)\s*[-–]\s*([^<"]{5,160})', html.unescape(r.text))
    o.append(f"== busca {q} {r.status_code} ids={sorted(set(ids))[:40]}"); o += [f"   {a} {b.strip()}" for a,b in nomes[:40]]
for t in (2609,2612,2654,2681,2683,1685,6449,6450,6805,6803,9543,9542,9606,9512):
    mostra(f"https://apisidra.ibge.gov.br/desc/t/{t}", 500)
# TerraBrasilis: painel e geoserver
for u in ["https://terrabrasilis.dpi.inpe.br/dashboard/api/v1/redis-cli/config/prodes-legal-amz",
          "https://terrabrasilis.dpi.inpe.br/dashboard/api/v1/redis-cli/prodes-legal-amz/loi-loinames",
          "https://terrabrasilis.dpi.inpe.br/app/dashboard/configs/legal_amazon",
          "https://terrabrasilis.dpi.inpe.br/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities"]:
    r=mostra(u, 1500)
    if r is not None and "GetCapabilities" in u and r.status_code==200:
        o += sorted(set(n for n in re.findall(r"<Name>([^<]+)</Name>", r.text) if re.search(r"(?i)mun|prodes|yearly|increment", n)))[:200]
# malhas no GitHub
r=mostra("https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-51-mun.json", 300)
# DATASUS e INEP
mostra("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/inf10mt.def", 300)
mostra("http://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_municipios_2023.zip", 100, timeout=60)
mostra("https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SINASC/DNOPEN22.csv", 200, timeout=60, stream=True)
open("expl2.txt","w").write("\n".join(o))
