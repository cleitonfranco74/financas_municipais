import re, time, ftplib, subprocess, os, io, zipfile, requests, shutil
o = []
def t(nome, f, lim=3000):
    t0 = time.time()
    try: r = f(); o.append(f"== {nome} ({time.time()-t0:.0f}s)\n{str(r)[:lim]}")
    except Exception as e: o.append(f"== {nome} ERRO {type(e).__name__}: {str(e)[:400]}")
H = {"User-Agent": "Mozilla/5.0"}
o.append("7z: " + str(shutil.which("7z")) + " " + str(shutil.which("7za")))
def ftp(): f = ftplib.FTP("ftp.mtps.gov.br", timeout=120, encoding="latin-1"); f.login(); return f
def lista(p):
    f = ftp(); out = []; f.retrlines("LIST " + p, out.append); f.quit(); return "\n".join(out)
for a in (2016, 2019, 2021, 2022):
    t(f"rais {a}", lambda a=a: lista(f"/pdet/microdados/RAIS/{a}/"), 1500)
t("caged 202509", lambda: lista("/pdet/microdados/NOVO CAGED/2025/202509/"), 1500)
t("caged 202001", lambda: lista("/pdet/microdados/NOVO CAGED/2020/202001/"), 1500)
def baixa(p, dest):
    f = ftp(); 
    with open(dest, "wb") as h: f.retrbinary("RETR " + p, h.write, blocksize=1 << 20)
    f.quit(); return os.path.getsize(dest)
def cabeca(arq7z):
    os.makedirs("x", exist_ok=True); subprocess.run(["7z", "x", "-y", "-ox", arq7z], check=True, capture_output=True)
    out = []
    for n in os.listdir("x"):
        with open(os.path.join("x", n), "rb") as h:
            linhas = [h.readline().decode("latin-1").rstrip() for _ in range(4)]
        out.append((n, os.path.getsize(os.path.join("x", n)), linhas))
    return out
t("rais 2024 estab", lambda: (baixa("/pdet/microdados/RAIS/2024/RAIS_ESTAB_PUB.7z", "estab.7z"), cabeca("estab.7z")), 4000)
# valores distintos de algumas colunas da RAIS 2024
def distintos():
    n = [x for x in os.listdir("x") if "ESTAB" in x.upper()][0]
    import csv, collections
    c = collections.Counter(); c2 = collections.Counter(); tot = 0
    with open(os.path.join("x", n), encoding="latin-1") as h:
        r = csv.reader(h, delimiter=";"); cab = next(r)
        iS = next(i for i, x in enumerate(cab) if "Subsetor" in x and "IBGE" in x)
        for l in r:
            c[l[iS]] += 1; tot += 1
    return cab, tot, c.most_common(30)
t("rais 2024 subsetor", distintos, 4000)
shutil.rmtree("x", ignore_errors=True)
def caged():
    p = "/pdet/microdados/NOVO CAGED/2025/202509/"
    f = ftp(); nomes = f.nlst(p); f.quit()
    mov = [n for n in nomes if "MOV" in n.upper()][0]
    tam = baixa(mov, "mov.7z"); return tam, cabeca("mov.7z")
t("caged mov", caged, 4000)
shutil.rmtree("x", ignore_errors=True)
# PNI: javascript do formulário
pg = requests.get("http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=180).content.decode("latin-1")
scripts = re.findall(r"<script[^>]*>(.*?)</script>", pg, re.S | re.I)
srcs = re.findall(r'<script[^>]*src="([^"]+)"', pg, re.I)
o.append("== pni script srcs: " + str(srcs))
for s in scripts: o.append("== pni script inline:\n" + s[:3000])
o.append("== pni hidden/inputs: " + str(re.findall(r"<input[^>]*>", pg, re.I)[:40]))
for s in srcs[:5]:
    u = s if s.startswith("http") else "http://tabnet.datasus.gov.br/cgi/" + s.lstrip("/")
    t(f"pni js {s}", lambda u=u: requests.get(u, headers=H, timeout=60).text[:6000], 6000)
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
