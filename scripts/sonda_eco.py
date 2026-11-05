import requests
H={"User-Agent":"BrasilEmDados/1.0 (painel educacional; github.com/cleitonfranco74/financas_municipais)"}
B="http://www.ipeadata.gov.br/api/odata4/"
def g(u,**k):
    try: return requests.get(u,headers=H,timeout=90,**k)
    except Exception as e: print("ERRO",u,e)
for f in ["FNTSIGLA eq 'DIEESE'","FNTSIGLA eq 'ANP'","contains(SERNOME,'Cesta')","contains(SERNOME,'GLP')"]:
    r=g(B+"Metadados",params={"$filter":f})
    print("==",f,r.status_code if r is not None else None)
    try:
        for x in r.json().get("value",[])[:80]: print("  ",x.get("SERCODIGO"),"|",x.get("SERNOME"),"|",x.get("PERNOME"),"|",x.get("UNINOME"),"|",x.get("SERSTATUS"),"|",x.get("SERMAXDATA") or x.get("SERFIMDATA"))
    except Exception: print(r.text[:400] if r is not None else "")
r=g(B+"Metadados",params={"$top":"1"}); print("== top1", r.status_code if r is not None else None, r.text[:800] if r is not None else "")
for u in ["https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/mensal-brasil-desde-jan2013.xlsx",
          "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/mensal/mensal-brasil-2001-a-2012.xlsx"]:
    r=g(u); print("== anp",u[-40:], r.status_code if r is not None else None, r.headers.get("content-type") if r is not None else "", len(r.content) if r is not None else 0)
    if r is not None and r.ok:
        import io, openpyxl
        wb=openpyxl.load_workbook(io.BytesIO(r.content),read_only=True)
        for ws in wb.worksheets[:2]:
            print(" aba",ws.title)
            for i,row in enumerate(ws.iter_rows(values_only=True)):
                if i<20 or i%400==0: print("  ",row[:12])
                if i>30: break
