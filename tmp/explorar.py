import re, sys, json, requests
from urllib.parse import quote
sys.path.insert(0, "scripts")
o = []
H = {"User-Agent": "Mozilla/5.0"}
U = "http://tabnet.datasus.gov.br/cgi/"
pg = requests.get(U + "dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=180).content.decode("latin-1")
o.append("== campos: " + str(sorted(set(re.findall(r'name="([^"]+)"', pg, re.I)))))
o.append("== radios/checks: " + str(re.findall(r'<input[^>]*type="(?:radio|checkbox)"[^>]*>', pg, re.I)[:20]))
opts = lambda nome: re.findall(r'<option[^>]*value="([^"]*)"', (re.search(rf'name="{re.escape(nome)}"[^>]*>(.*?)</select>', pg, re.S | re.I) or [None, ""])[1], re.I)
inc = opts("Incremento")
o.append("== incrementos: " + str([i.split("|")[0] for i in inc]))
linha = next(v for v in opts("Linha") if v.startswith("Município"))
col = next(v for v in opts("Coluna") if v.startswith("Ano"))
anos = [v for v in opts("PAno") if v[:4].isdigit() and 2016 <= int(v[:4]) <= 2022]
ufmt = next(v for v in opts("SUnidade da Federação") if v.startswith("Mato Grosso|"))
penta = next(v for v in inc if v.startswith("Penta"))
campos = [("Linha", linha), ("Coluna", col), ("Incremento", penta)] + [("PAno", a) for a in anos] + [("SUnidade da Federação", ufmt)]
for n in sorted(set(re.findall(r'name="(S[^"]+)"', pg))):
    if n != "SUnidade da Federação":
        campos.append((n, "TODAS_AS_CATEGORIAS__"))
for formato in ("prn", "table"):
    corpo = "&".join(f"{quote(k, encoding='latin-1')}={quote(v, encoding='latin-1')}" for k, v in campos + [("formato", formato), ("mostre", "Mostra")])
    r = requests.post(U + "webtabx.exe?bd_pni/cpnibr.def", data=corpo, headers={**H, "Content-Type": "application/x-www-form-urlencoded"}, timeout=300)
    t = r.content.decode("latin-1")
    o.append(f"== resposta {formato}: {r.status_code} {len(t)}\n" + re.sub(r"\s+", " ", t)[:2500])
    o.append("links: " + str(re.findall(r'href="([^"]+)"', t, re.I)[:20]))
    pre = re.search(r"<PRE>(.*?)</PRE>", t, re.S | re.I)
    if pre: o.append("PRE:\n" + pre.group(1)[:1500])
# repasses classificados, com a API real
import atualizar_municipios as A
for ano in (2017, 2020, 2023):
    rec = A.get(A.SICONFI + "dca", {"an_exercicio": ano, "id_ente": 5107909, "no_anexo": "DCA-Anexo I-C"}, timeout=90).json()["items"]
    o.append(f"== repasses Sinop {ano}: " + str(dict(zip(A.TR_NOMES, A.repasses(rec)))))
rec = A.get(A.SICONFI + "dca", {"an_exercicio": 2022, "id_ente": 1200013, "no_anexo": "DCA-Anexo I-C"}, timeout=90).json()["items"]
o.append(f"== repasses Acrelândia 2022: " + str(dict(zip(A.TR_NOMES, A.repasses(rec)))))
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
