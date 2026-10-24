import sys, json, time, os
sys.path.insert(0, "scripts")
os.makedirs("data", exist_ok=True)
import atualizar_municipios as A
o=[]
def t(nome, f):
    t0=time.time()
    try: r=f(); o.append(f"== {nome} OK {time.time()-t0:.1f}s\n{json.dumps(r, ensure_ascii=False)[:1500]}")
    except Exception as e:
        import traceback; o.append(f"== {nome} ERRO {e}\n{traceback.format_exc()[-1500:]}")
t("siconfi 2023", lambda: A.siconfi(5107909, 2023))
t("siconfi 2017", lambda: A.siconfi(5107909, 2017))
t("siconfi pequeno 2020", lambda: A.siconfi(5100102, 2020))
ms={5107909:{"c":5107909,"n":"Sinop","uf":"MT"}, 5100102:{"c":5100102,"n":"Acorizal","uf":"MT"}, 5200050:{"c":5200050,"n":"Abadia de Goiás","uf":"GO"}}
A.UFS={"MT":51,"GO":52}
t("candidatos 2020", lambda: {str(k):v for k,v in list(A.candidatos(2020, A.tse_ibge()).items())[:8]})
t("governadores 2022", lambda: A.candidatos(2022, None))
t("emprego", lambda: (A.emprego(ms), {c:m["emp"] for c,m in ms.items()})[1])
t("censo", lambda: (A.censo(ms, {}), {c:m["censo"] for c,m in ms.items()})[1])
t("tabnet sim MT", lambda: dict(list(A.tabnet("sim","MT",list(range(2016,2027))).items())[:3]))
t("mortalidade", lambda: (A.mortalidade(ms, {}), {c:m["tmi"] for c,m in ms.items()})[1])
import espaciais as E
E.UFS={"MT":51}
geo={}
t("malhas MT", lambda: (geo.update(E.malhas()), len(geo))[1])
t("grava malha", lambda: (E.grava_malha(geo), os.path.getsize("data/malha.json"))[1])
ms2={c:{"c":c,"n":"x","uf":"MT"} for c in geo}
E.INICIO=2024
t("prodes 2024+", lambda: (E.prodes(ms2, {}, geo), {k:v["desm"] for k,v in list(ms2.items()) if v["desm"] and sum(v["desm"].values())>20})[1])
ms3={5107909:{"c":5107909,"n":"Sinop","uf":"MT"}, 5103403:{"c":5103403,"n":"Cuiabá","uf":"MT"}, 5106224:{"c":5106224,"n":"Nova Ubiratã","uf":"MT"}}
E.INICIO=2024
t("focos 2024+", lambda: (E.focos(ms3, {}), {c:m["fogo"] for c,m in ms3.items()})[1])
open("tmp/teste_coletor.txt","w").write("\n".join(o))
