import requests, json
H={"User-Agent":"BrasilEmDados/1.0 (painel educacional; github.com/cleitonfranco74/financas_municipais)"}
def g(u,**k):
    try:
        r=requests.get(u,headers=H,timeout=60,**k); return r
    except Exception as e: print("ERRO",u,e); return None
for t in ["cesta","necess","gasolina","GLP","horas","botij","etanol","diesel","rendimento"]:
    r=g("http://www.ipeadata.gov.br/api/odata4/Metadados",params={"$filter":f"contains(SERNOME,'{t}')","$select":"SERCODIGO,SERNOME,FNTSIGLA,PERNOME,SERSTATUS,SERMAXDATA"})
    if r is None: continue
    print("==",t,r.status_code)
    try:
        for x in r.json().get("value",[])[:60]: print(" ",x)
    except Exception as e: print(r.text[:300])
for tab in ["7531","7533","7535"]:
    r=g(f"https://apisidra.ibge.gov.br/values/t/{tab}/n1/all/v/allxp/p/last%202")
    print("== sidra",tab, r.status_code if r else None, r.text[:900] if r else "")
for c in ["22707","22708","22709","22704","22705","4192","1178"]:
    r=g(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{c}/dados/ultimos/3",params={"formato":"json"})
    print("== sgs",c, r.status_code if r else None, r.text[:300] if r else "")
