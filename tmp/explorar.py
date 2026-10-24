import sys, json
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
def t(nome, f):
    try: o.append(f"== {nome}\n{json.dumps(f(), ensure_ascii=False)[:1500]}")
    except Exception as e:
        import traceback; o.append(f"== {nome} ERRO {e}\n{traceback.format_exc()[-1200:]}")
t("siconfi pequeno 2020", lambda: A.siconfi(5100102, 2020))
t("siconfi sinop 2018", lambda: A.siconfi(5107909, 2018))
A.UFS={"MT":51}
ms={5107909:{"c":5107909,"n":"Sinop","uf":"MT"}, 5100102:{"c":5100102,"n":"Acorizal","uf":"MT"}, 5103403:{"c":5103403,"n":"Cuiabá","uf":"MT"}}
A.ELEICOES=(2016,2020)
t("reeleicao", lambda: (A.reeleicao_e_governos(ms, {}, {}), {c:m.get("reel") for c,m in ms.items()})[1])
t("emprego", lambda: (A.emprego(ms), {c:m["emp"] for c,m in ms.items()})[1])
t("mortalidade", lambda: (A.mortalidade(ms, {}), {c:m["tmi"] for c,m in ms.items()})[1])
open("tmp/teste_coletor.txt","w").write("\n".join(o))
