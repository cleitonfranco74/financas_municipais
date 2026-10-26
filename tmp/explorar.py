import re, time, requests
o = []
def t(nome, f, lim=3000):
    t0 = time.time()
    try: r = f(); o.append(f"== {nome} ({time.time()-t0:.0f}s)\n{str(r)[:lim]}")
    except Exception as e: o.append(f"== {nome} ERRO {type(e).__name__}: {str(e)[:300]}")
H = {"User-Agent": "Mozilla/5.0"}
pg = requests.get("http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=180).content.decode("latin-1")
t("dhdat links", lambda: re.findall(r'(?:href|HREF|value|VALUE)="([^"]*\.def[^"]*)"', pg)[:40])
defs = re.findall(r'deftohtm\.exe\?([^"\'&]+\.def)', pg)
for d in list(dict.fromkeys(defs))[:6]:
    def f(d=d):
        p = requests.get("http://tabnet.datasus.gov.br/cgi/deftohtm.exe?" + d, headers=H, timeout=180).content.decode("latin-1")
        sel = lambda n: re.findall(r'VALUE="([^"]+)"', (re.search(rf'NAME="{n}"(.*?)</SELECT>', p, re.S | re.I) or [None, ""])[1])[:40]
        return {"titulo": re.findall(r"<title>(.*?)</title>", p, re.I | re.S), "Linha": sel("Linha"), "Coluna": sel("Coluna"), "Incremento": sel("Incremento"), "Arquivos": sel("Arquivos")}
    t(f"def {d}", f, 4000)
# CNPJ: WebDAV público do compartilhamento
def dav(caminho=""):
    r = requests.request("PROPFIND", "https://arquivos.receitafederal.gov.br/public.php/webdav/" + caminho, auth=("YggdBLfdninEJX9", ""), headers={**H, "Depth": "1"}, timeout=120)
    return r.status_code, re.findall(r"<d:href>([^<]+)</d:href>", r.text)[-20:], re.findall(r"<d:getcontentlength>(\d+)</d:getcontentlength>", r.text)[-20:]
t("cnpj webdav raiz", dav)
t("cnpj webdav 2026-09", lambda: dav("2026-09/"))
t("cnpj head Estab0", lambda: (lambda r: (r.status_code, r.headers.get("content-length"), r.headers.get("content-type")))(requests.head("https://arquivos.receitafederal.gov.br/public.php/webdav/2026-09/Estabelecimentos0.zip", auth=("YggdBLfdninEJX9", ""), headers=H, timeout=120, allow_redirects=True)))
t("kelvins municipios", lambda: requests.get("https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv", timeout=60).text[:400])
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
