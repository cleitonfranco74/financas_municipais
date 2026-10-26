import re, sys, requests
from urllib.parse import quote
sys.path.insert(0, "scripts")
import complementos as C
H = {"User-Agent": "Mozilla/5.0"}
pg = requests.get(C.PNI + "dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=300).content.decode("latin-1")
opts = lambda nome: re.findall(r'<option[^>]*value="([^"]*)"', (re.search(rf'name="{re.escape(nome)}"[^>]*>(.*?)</select>', pg, re.S | re.I) or [None, ""])[1], re.I)
linha = next(v for v in opts("Linha") if v.startswith("Município"))
col = next(v for v in opts("Coluna") if v.startswith("Ano"))
anos = [v for v in opts("PAno") if v[:4].isdigit() and 2016 <= int(v[:4]) <= 2022]
inc = next(v for v in opts("Incremento") if v.startswith("Penta"))
uf = next(v for v in opts("SUnidade da Federação") if v.split("|")[1:2] == ["12"])
campos = [("Linha", linha), ("Coluna", col), ("Incremento", inc)] + [("PAno", a) for a in anos] + [("SUnidade da Federação", uf)]
campos += [(f, "TODAS_AS_CATEGORIAS__") for f in sorted(set(re.findall(r'name="(S[^"]+)"', pg))) if f != "SUnidade da Federação"]
corpo = "&".join(f"{quote(a, encoding='latin-1')}={quote(b, encoding='latin-1')}" for a, b in campos + [("formato", "table"), ("mostre", "Mostra")])
t = requests.post(C.PNI + "webtabx.exe?bd_pni/cpnibr.def", data=corpo, headers={**H, "Content-Type": "application/x-www-form-urlencoded"}, timeout=300).content.decode("latin-1")
depois = t[t.find("-->"):]
open("tmp/teste_coletor.txt", "w").write(depois[:7000])
