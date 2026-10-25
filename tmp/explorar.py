import sys, json
sys.path.insert(0, "scripts")
import atualizar_municipios as A
o=[]
for cod, ano, so in ((1200013, 2023, True), (1300060, 2021, False), (5107909, 2023, True), (5107909, 2017, True)):
    try: o.append(f"== {cod} {ano} so_lrf={so}\n{json.dumps(A.siconfi(cod, ano, so))[:900]}")
    except Exception as e: o.append(f"== {cod} ERRO {e}")
open("tmp/teste_coletor.txt","w").write("\n".join(o))
