import requests, json, re, io, zipfile, csv, time, os, html
H={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
os.chdir("tmp")
def g(u, **k):
    try:
        r=requests.get(u, headers=H, timeout=k.pop("timeout",120), **k); return r
    except Exception as e: return e
def salva(nome, txt): open(nome,"w").write(txt if isinstance(txt,str) else json.dumps(txt,ensure_ascii=False,indent=1))
S="https://apidatalake.tesouro.gov.br/ords/siconfi/tt/"
out=[]
# A) Siconfi
for ano in (2017, 2023):
    r=g(S+"dca", params={"an_exercicio":ano,"id_ente":5107909,"no_anexo":"DCA-Anexo I-E"}).json()["items"]
    out.append(f"== DCA I-E {ano} {len(r)}")
    out += sorted({f"{i['cod_conta']} | {i['conta']} | {i['coluna']}" for i in r if i['coluna']=='Despesas Liquidadas' and re.match(r'^\d\d - ', i['conta'] or '')})
    r=g(S+"dca", params={"an_exercicio":ano,"id_ente":5107909,"no_anexo":"DCA-Anexo I-C"}).json()["items"]
    out.append(f"== DCA I-C {ano} contas de interesse")
    out += sorted({f"{i['cod_conta']} | {i['conta']} | {i['coluna']}" for i in r if re.search(r"(?i)fundo de participa|icms|recursos minerais|royalt|petr[oó]leo|territorial rural|conv[eê]nio|especia|ipva|iptu|iss", i['conta'] or '') and i['coluna']=='Receitas Brutas Realizadas'})
for anexo in ("RREO-Anexo 03","RREO-Anexo 06","RREO-Anexo 08","RREO-Anexo 12","RREO-Anexo 14"):
    r=g(S+"rreo", params={"an_exercicio":2023,"nr_periodo":6,"co_tipo_demonstrativo":"RREO","no_anexo":anexo,"id_ente":5107909})
    try: it=r.json().get("items",[])
    except Exception: it=[]; out.append(str(r)[:200])
    out.append(f"== {anexo} 2023/6 {len(it)}")
    out += [f"{i.get('cod_conta')} | {i.get('conta')} | {i.get('coluna')} | {i.get('valor')}" for i in it][:400]
for per,tipo in ((3,"Q"),(2,"S")):
    for anexo in ("RGF-Anexo 01","RGF-Anexo 02","RGF-Anexo 06"):
        r=g(S+"rgf", params={"an_exercicio":2023,"in_periodicidade":tipo,"nr_periodo":per,"co_tipo_demonstrativo":"RGF","no_anexo":anexo,"co_poder":"E","id_ente":5107909})
        try: it=r.json().get("items",[])
        except Exception: it=[]
        out.append(f"== {anexo} {tipo}{per} {len(it)}")
        out += [f"{i.get('cod_conta')} | {i.get('conta')} | {i.get('coluna')} | {i.get('valor')}" for i in it][:300]
# município pequeno (semestral?)
r=g(S+"rgf", params={"an_exercicio":2023,"in_periodicidade":"S","nr_periodo":2,"co_tipo_demonstrativo":"RGF","no_anexo":"RGF-Anexo 01","co_poder":"E","id_ente":5100102})
out.append(f"== Acorizal RGF S2 {len(r.json().get('items',[]))}")
r=g(S+"extrato_entregas", params={"id_ente":5100102,"an_referencia":2023})
out.append(f"== extrato {str(r.json())[:1500] if not isinstance(r,Exception) else r}")
salva("siconfi2.txt","\n".join(out))
# B) TSE consulta_cand
o=[]
for ano in (2020, 2022):
    r=g(f"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip", timeout=600)
    z=zipfile.ZipFile(io.BytesIO(r.content)); o.append(f"== {ano} {len(r.content)} {[n for n in z.namelist()][:40]}")
    nome=next(n for n in z.namelist() if n.endswith("_MT.csv") or n.endswith("_BRASIL.csv"))
    with z.open(nome) as f:
        rd=csv.DictReader(io.TextIOWrapper(f,encoding="latin-1"),delimiter=";"); o.append(str(rd.fieldnames))
        k=0
        for l in rd:
            if l["CD_CARGO"] in ("11","3") and "ELEITO" in l.get("DS_SIT_TOT_TURNO",""):
                o.append(str({c:l[c] for c in ("SG_UF","SG_UE","NM_UE","CD_CARGO","SQ_CANDIDATO","NR_CPF_CANDIDATO","SG_PARTIDO","ST_REELEICAO","DS_SIT_TOT_TURNO") if c in l})); k+=1
            if k>6: break
salva("tse_cand.txt","\n".join(o))
# C) INPE
o=[]
for u in ["https://terrabrasilis.dpi.inpe.br/download/","https://terrabrasilis.dpi.inpe.br/downloads/","http://www.dpi.inpe.br/prodesdigital/tabelatexto.php?ano=2023&estado=MT&ordem=MUNICIPIO&type=tabela&output=txt",
          "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/anual/Brasil_sat_ref/"]:
    r=g(u); 
    if isinstance(r,Exception): o.append(f"== {u} ERRO {r}"); continue
    t=r.text; o.append(f"== {u} {r.status_code} {len(t)}")
    o += sorted(set(re.findall(r'href="([^"]+)"', t)))[:200]
    if "tabelatexto" in u: o.append(t[:2000])
r=g("https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/anual/Brasil_sat_ref/focos_br_ref_2023.zip", timeout=300)
if not isinstance(r,Exception) and r.status_code==200:
    z=zipfile.ZipFile(io.BytesIO(r.content)); n=z.namelist()[0]
    o.append(f"== focos 2023 {len(r.content)} {n}"); o.append(z.open(n).read(1500).decode("latin-1"))
salva("inpe.txt","\n".join(o))
# D) IBGE: catálogo de agregados (registro civil, cempre, censo 2022 saneamento) e malha
r=g("https://servicodados.ibge.gov.br/api/v3/agregados", timeout=180)
o=[f"status {getattr(r,'status_code',r)}"]
try:
    for p in r.json():
        for a in p.get("agregados",[]):
            nm=a["nome"]
            if re.search(r"(?i)nascidos vivos|óbitos|obitos|mortalidade|esgot|abastecimento de água|pessoal ocupado|unidades locais|IDH|alfabeti", nm):
                o.append(f"{p.get('id')} {p.get('nome')} | {a['id']} {nm}")
except Exception as e: o.append(f"erro {e} {str(r)[:300]}")
salva("ibge_cat.txt","\n".join(o))
r=g("https://servicodados.ibge.gov.br/api/v3/malhas/estados/51?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio", timeout=180)
salva("malha.txt", f"{getattr(r,'status_code',r)} {len(r.content) if not isinstance(r,Exception) else ''} {r.text[:600] if not isinstance(r,Exception) else ''}")
# E) Ideb
o=[]
for u in ["https://download.inep.gov.br/ideb/resultados/divulgacao_anos_iniciais_municipios_2023.zip","https://download.inep.gov.br/ideb/resultados/divulgacao_anos_finais_municipios_2023.zip"]:
    r=g(u, timeout=300); o.append(f"== {u} {getattr(r,'status_code',r)} {len(r.content) if not isinstance(r,Exception) else ''}")
    if not isinstance(r,Exception) and r.status_code==200:
        z=zipfile.ZipFile(io.BytesIO(r.content)); o.append(str(z.namelist()))
        import openpyxl
        x=next(n for n in z.namelist() if n.endswith("xlsx"))
        wb=openpyxl.load_workbook(io.BytesIO(z.read(x)),read_only=True)
        ws=wb.worksheets[0]
        for i,row in enumerate(ws.iter_rows(values_only=True)):
            if i<14 or (row and row[0]=="MT" and i<400): o.append(str(row)[:600])
            if i>300: break
salva("ideb.txt","\n".join(o))
