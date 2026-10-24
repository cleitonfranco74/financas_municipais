import requests, json, re, io, os, html
H={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
os.chdir("tmp"); o=[]
def g(u, **k):
    try: return requests.get(u, headers=H, timeout=k.pop("timeout",120), **k)
    except Exception as e: return e
W="https://terrabrasilis.dpi.inpe.br/geoserver/ows"
for camada in ("prodes-legal-amz:yearly_deforestation","prodes-cerrado-nb:yearly_deforestation","prodes-legal-amz:municipalities_legal_amazon","prodes-cerrado-nb:municipalities_cerrado_biome"):
    r=g(W, params={"service":"WFS","version":"2.0.0","request":"DescribeFeatureType","typeNames":camada})
    o.append(f"== describe {camada} {getattr(r,'status_code',r)}"); 
    if not isinstance(r,Exception): o += re.findall(r'name="([^"]+)"[^>]*type="([^"]+)"', r.text)[:40].__repr__().split("), (")
    r=g(W, params={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":camada,"count":3,"outputFormat":"csv"})
    o.append(f"== amostra {getattr(r,'status_code',r)}"); o.append(r.text[:1500] if not isinstance(r,Exception) else "")
    r=g(W, params={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":camada,"resultType":"hits"})
    o.append(f"== hits {r.text[:400] if not isinstance(r,Exception) else r}")
# TabNet: óbitos infantis por município de residência e ano (MT)
tab="http://tabnet.datasus.gov.br/cgi/tabcgi.exe?sim/cnv/inf10mt.def"
r=g("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/inf10mt.def")
if not isinstance(r,Exception):
    t=r.content.decode("latin-1")
    o.append("== form selects"); o += re.findall(r'<SELECT[^>]*NAME="([^"]+)"', t, flags=re.I)
    o.append("== linha opts"); o += re.findall(r'<OPTION[^>]*VALUE="([^"]+)"[^>]*>([^<\n]*)', t, flags=re.I)[:60].__repr__().split("), (")
    arqs=re.findall(r'VALUE="(inf[a-z]{2}\d\d\.dbf)"', t, flags=re.I); o.append(f"arquivos {arqs}")
    body="Linha=Munic%EDpio&Coluna=Ano_do_%D3bito&Incremento=%D3bitos_p%2FResid%EAnc&"+"&".join(f"Arquivos={a}" for a in arqs[:3])+"&SMunic%EDpio=TODAS_AS_CATEGORIAS__&formato=prn&mostre=Mostra"
    r2=requests.post(tab, data=body, headers={**H,"Content-Type":"application/x-www-form-urlencoded"}, timeout=120)
    o.append(f"== post {r2.status_code}"); o.append(r2.content.decode("latin-1")[:3000])
# SIDRA values: tabelas candidatas
for t in (2609,2612,2654,2681,2683,1685,6449,6450,6805,6803,9543,9542,9606,9512,9515,9520,9550,9584):
    r=g(f"https://apisidra.ibge.gov.br/values/t/{t}/n6/5107909/v/all/p/last%201", timeout=60)
    if isinstance(r,Exception): o.append(f"== sidra {t} ERRO"); continue
    try:
        d=r.json(); o.append(f"== sidra {t} {r.status_code} cab={d[0]}"); o += [str({k:v for k,v in x.items() if k in ('V','D2N','D3N','D4N','D5N')}) for x in d[1:6]]
    except Exception: o.append(f"== sidra {t} {r.status_code} {r.text[:150]}")
open("expl3.txt","w").write("\n".join(o))
