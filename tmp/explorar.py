import re, requests
H = {"User-Agent": "Mozilla/5.0"}
pg = requests.get("http://tabnet.datasus.gov.br/cgi/dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=180).content.decode("latin-1")
o = [re.sub(r"\s+", " ", re.sub(r"<script.*?</script>", "", pg, flags=re.S))[:2500]]
for nome, corpo in re.findall(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', pg, re.S | re.I):
    o.append(f"== {nome}: " + " | ".join(re.findall(r'value="([^"]*)"[^>]*>([^<]*)', corpo, re.I)[:60].__str__()[:1500].split("), (")))
o.append("forms: " + str(re.findall(r'<form[^>]*>', pg, re.I)))
open("tmp/teste_coletor.txt", "w").write("\n".join(o))
