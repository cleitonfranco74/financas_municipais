import requests, json, re, io, os, time
H={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
os.chdir("tmp"); o=[]
def g(u, **k):
    try: return requests.get(u, headers=H, timeout=k.pop("timeout",120), **k)
    except Exception as e: return e
# 1) Painel do TerraBrasilis: endereços de API no JavaScript
base="https://terrabrasilis.dpi.inpe.br/app/"
r=g(base+"dashboard/deforestation/biomes/legal_amazon/rates")
srcs=re.findall(r'src="([^"]+\.js)"', r.text) if not isinstance(r,Exception) else []
o.append(f"== scripts {srcs}")
urls=set()
for s in srcs:
    js=g(base+s if not s.startswith("http") else s)
    if isinstance(js,Exception): continue
    urls |= set(re.findall(r'["\'`](https?://[^"\'`\s]{8,160})["\'`]', js.text)) | set(re.findall(r'["\'`](/[a-z\-]+/api/[^"\'`\s]{0,120})["\'`]', js.text))
o += sorted(u for u in urls if re.search(r"(?i)api|redis|dashboard|geoserver|download", u))[:120]
# 2) WFS: tamanho das camadas a partir de 2016
W="https://terrabrasilis.dpi.inpe.br/geoserver/ows"
for camada in ("prodes-legal-amz:yearly_deforestation","prodes-cerrado-nb:yearly_deforestation"):
    r=g(W, params={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":camada,"resultType":"hits","CQL_FILTER":"year>=2016"})
    o.append(f"== hits {camada} {re.findall(r'numberMatched=\"(\\d+)\"', r.text) if not isinstance(r,Exception) else r}")
    t=time.time(); r=g(W, params={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":camada,"count":2000,"CQL_FILTER":"year>=2016","outputFormat":"application/json","propertyName":"year,area_km,geom"}, timeout=300)
    o.append(f"   2000 feições: {len(r.content) if not isinstance(r,Exception) else r} bytes em {time.time()-t:.1f}s")
# 3) SIDRA: códigos de classificação candidatos
for t, cs in ((6805,[11558,61,1821,11557,11559,12096]),(6803,[11557,11558,12095,61,1822]),(6450,[12762,12761,12763,12760,12764])):
    for c in cs:
        r=g(f"https://apisidra.ibge.gov.br/values/t/{t}/n6/5107909/p/last%201/c{c}/all", timeout=60)
        txt=r.text[:200] if not isinstance(r,Exception) else str(r)
        ok = not isinstance(r,Exception) and r.status_code==200
        o.append(f"== sidra {t} c{c} {getattr(r,'status_code','x')} {txt if not ok else ''}")
        if ok: o += [str({k:v for k,v in x.items() if k in ('V','D2N','D4C','D4N')}) for x in r.json()[1:25]]
# 4) TabNet SINASC
t=g("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sinasc/cnv/nvmt.def")
if not isinstance(t,Exception):
    tt=t.content.decode("latin-1"); arqs=re.findall(r'VALUE="(nvmt\d\d\.dbf)"', tt, flags=re.I)
    o.append(f"== sinasc arquivos {arqs[:12]}"); o += re.findall(r'<OPTION[^>]*VALUE="([^"]+)"[^>]*>', tt, flags=re.I)[:30]
open("expl4.txt","w").write("\n".join(o))
