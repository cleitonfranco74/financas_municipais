"""Atualiza data/complementos.json: dados municipais que vêm de arquivos grandes e mudam no máximo uma vez
por mês, por isso ficam fora da coleta semanal (scripts/atualizar_municipios.py).

- RAIS (Ministério do Trabalho, arquivo de estabelecimentos): estabelecimentos com empregados e vínculos
  ativos em 31 de dezembro, por setor (agropecuária, indústria, construção, comércio, serviços e
  administração pública), por município e ano.
- Novo Caged (Ministério do Trabalho): admissões, desligamentos e saldo do emprego formal, por setor,
  somados por ano (o ano corrente é parcial).
- CNPJ (Receita Federal): estabelecimentos ativos hoje, por setor, e estabelecimentos abertos e fechados
  (baixados) em cada ano; o arquivo é a fotografia mensal mais recente do cadastro.
- Cobertura vacinal (DATASUS, SI-PNI): penta, poliomielite, tríplice viral (1ª dose) e BCG, por município e
  ano, até 2022 (depois disso o Ministério da Saúde mudou de sistema e não há download aberto).

Cada parte reaproveita o que já foi gravado e só baixa o que falta; se uma fonte falha, os dados anteriores
ficam. Roda pela Action .github/workflows/complementos.yml.

A RAIS e o Caged também vão, de forma enxuta, para data/emprego_brasil.json, com todos os municípios do Brasil
(lista de data/brasil.json), usado pelas abas por porte: rais[ano] = [vínculos, vínculos por setor] e
caged[ano] = [admissões, desligamentos, saldo]. Cada arquivo baixado serve às duas saídas.
"""
from __future__ import annotations

import csv
import ftplib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "complementos.json"
SAIDA_BR = RAIZ / "data" / "emprego_brasil.json"
UFS = {"AC": 12, "AM": 13, "AP": 16, "MA": 21, "MT": 51, "PA": 15, "RO": 11, "RR": 14, "TO": 17, "GO": 52, "MS": 50}
INICIO = 2016
SETORES = ("agro", "industria", "construcao", "comercio", "servicos", "adm_publica")
H = {"User-Agent": "Mozilla/5.0 (financas_municipais; dados publicos)"}
FTP_MTE = "ftp.mtps.gov.br"
CNPJ_DAV = "https://arquivos.receitafederal.gov.br/public.php/webdav/"
CNPJ_TOKEN = "YggdBLfdninEJX9"   # compartilhamento público da Receita Federal (dados abertos do CNPJ)
MUNICIPIOS = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv"
PNI = "http://tabnet.datasus.gov.br/cgi/"
PRAZO_CAGED = 120   # minutos para os arquivos mensais do Caged em cada execução


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def sem_acento(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper().strip()


def setor_cnae(divisao: int) -> int:
    """Setor (índice de SETORES) a partir da divisão da CNAE 2.0 (dois primeiros dígitos)."""
    if 1 <= divisao <= 3:
        return 0
    if 5 <= divisao <= 39:
        return 1
    if 41 <= divisao <= 43:
        return 2
    if 45 <= divisao <= 47:
        return 3
    if divisao == 84:
        return 5
    return 4


def setor_secao(secao: str) -> int:
    return {"A": 0, "B": 1, "C": 1, "D": 1, "E": 1, "F": 2, "G": 3, "O": 5}.get((secao or "").strip().upper()[:1], 4)


# ---------------------------------------------------------------- arquivos do Ministério do Trabalho (FTP)
def ftp() -> ftplib.FTP:
    f = ftplib.FTP(FTP_MTE, timeout=300, encoding="latin-1")
    f.login()
    return f


def ftp_lista(caminho: str) -> list[str]:
    f = ftp()
    try:
        return f.nlst(caminho)
    finally:
        f.quit()


def ftp_baixa(caminho: str, destino: str) -> None:
    for t in range(3):
        try:
            f = ftp()
            with open(destino, "wb") as h:
                f.retrbinary("RETR " + caminho, h.write, blocksize=1 << 20)
            f.quit()
            return
        except Exception:  # noqa: BLE001
            if t == 2:
                raise
            time.sleep(20 * (t + 1))


def extrai_7z(arquivo: str, pasta: str) -> list[str]:
    subprocess.run(["7z", "x", "-y", f"-o{pasta}", arquivo], check=True, capture_output=True)
    return [os.path.join(pasta, n) for n in os.listdir(pasta)]


def tabela(caminho: str):
    """Abre um CSV do Ministério do Trabalho (separador ; ou , e codificação variável conforme o ano) e devolve
    (cabeçalho sem acentos e em maiúsculas, iterador de linhas)."""
    with open(caminho, "rb") as h:
        amostra = h.read(400000)
    try:
        amostra[: amostra.rfind(b"\n")].decode("utf-8")
        cod = "utf-8-sig"
    except UnicodeDecodeError:
        cod = "latin-1"
    primeira = amostra.split(b"\n", 1)[0]
    sep = ";" if primeira.count(b";") >= primeira.count(b",") else ","
    h = open(caminho, encoding=cod, errors="replace", newline="")
    r = csv.reader(h, delimiter=sep)
    cab = [sem_acento(c).replace("\ufeff", "") for c in next(r)]
    return cab, r


def coluna(cab: list[str], *inicios: str, contem: str | None = None) -> int | None:
    for i, c in enumerate(cab):
        if any(c.startswith(x) for x in inicios) or (contem and contem in c):
            return i
    return None


def num(v: str) -> float:
    v = (v or "").strip().replace(".", "").replace(",", ".") if "," in (v or "") else (v or "").strip()
    try:
        return float(v)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------- CNPJ (Receita Federal)
def cnpj(ms: dict, antes: dict, meta: dict) -> None:
    """cnpj = {"ativos": [por setor], "abertos": {ano: n}, "fechados": {ano: n}} por município, da fotografia
    mensal mais recente; só baixa de novo quando sai um mês novo."""
    auth = (CNPJ_TOKEN, "")
    r = requests.request("PROPFIND", CNPJ_DAV, auth=auth, headers={**H, "Depth": "1"}, timeout=300)
    meses = sorted(re.findall(r"/webdav/(\d{4}-\d{2})/", r.text))
    if not meses:
        raise RuntimeError("lista de meses do CNPJ vazia")
    mes = meses[-1]
    if meta.get("cnpj_mes") == mes and all(antes.get(c, {}).get("cnpj") for c in list(ms)[:50]):
        log(f"CNPJ: fotografia {mes} já processada.")
        for c, m in ms.items():
            if antes.get(c, {}).get("cnpj"):
                m["cnpj"] = antes[c]["cnpj"]
        return
    siafi = {}
    for l in csv.DictReader(io.StringIO(requests.get(MUNICIPIOS, headers=H, timeout=120).text)):
        if int(l["codigo_ibge"]) in ms:
            siafi[l["siafi_id"].lstrip("0")] = int(l["codigo_ibge"])
    ufs, hoje = set(UFS), date.today().year
    conta = {c: {"ativos": [0] * len(SETORES), "abertos": {}, "fechados": {}} for c in ms}
    pasta = tempfile.mkdtemp()
    try:
        for i in map(int, os.environ.get("CNPJ_ARQUIVOS", "0123456789")):   # a variável serve para testes
            nome = f"Estabelecimentos{i}.zip"
            arq = os.path.join(pasta, nome)
            for t in range(3):
                try:
                    with requests.get(f"{CNPJ_DAV}{mes}/{nome}", auth=auth, headers=H, stream=True, timeout=600) as g:
                        g.raise_for_status()
                        with open(arq, "wb") as h:
                            for bloco in g.iter_content(1 << 22):
                                h.write(bloco)
                    break
                except Exception as e:  # noqa: BLE001
                    if t == 2:
                        raise
                    log(f"CNPJ {nome}: nova tentativa ({e})")
                    time.sleep(30 * (t + 1))
            n = 0
            with zipfile.ZipFile(arq) as z:
                for membro in z.namelist():
                    with z.open(membro) as f:
                        for l in csv.reader(io.TextIOWrapper(f, encoding="latin-1", errors="replace", newline=""), delimiter=";"):
                            if len(l) < 21 or l[19] not in ufs:
                                continue
                            c = siafi.get(l[20].lstrip("0"))
                            if c is None:
                                continue
                            x, n = conta[c], n + 1
                            sit = l[5].lstrip("0")
                            if sit == "2":
                                div = int(l[11][:2]) if l[11][:2].isdigit() else 0
                                x["ativos"][setor_cnae(div)] += 1
                            ini = l[10][:4]
                            if ini.isdigit() and INICIO <= int(ini) <= hoje:
                                x["abertos"][ini] = x["abertos"].get(ini, 0) + 1
                            fim = l[6][:4]
                            if sit == "8" and fim.isdigit() and INICIO <= int(fim) <= hoje:
                                x["fechados"][fim] = x["fechados"].get(fim, 0) + 1
            os.remove(arq)
            log(f"CNPJ {mes} {nome}: {n} estabelecimentos do recorte.")
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    for c, m in ms.items():
        x = conta[c]
        m["cnpj"] = {"ativos": x["ativos"], "abertos": dict(sorted(x["abertos"].items())), "fechados": dict(sorted(x["fechados"].items()))}
    meta["cnpj_mes"] = mes
    log(f"CNPJ: fotografia {mes}, {sum(sum(x['ativos']) for x in conta.values())} estabelecimentos ativos no recorte.")


# ---------------------------------------------------------------- RAIS (estabelecimentos)
# IBGE Subsetor da RAIS → setor (usado quando falta a CNAE): 1 a 14 indústria, 15 construção, 16 e 17 comércio,
# 18 a 23 serviços, 24 administração pública, 25 agropecuária
SUBSETOR = {**{i: 1 for i in range(1, 15)}, 15: 2, 16: 3, 17: 3, **{i: 4 for i in range(18, 24)}, 24: 5, 25: 0}


def rais(ms: dict, antes: dict, meta: dict, br: dict) -> None:
    """rais[ano] = [estabelecimentos com vínculo ativo, vínculos ativos em 31/12, vínculos por setor (SETORES)].
    No painel nacional (br), rais[ano] = [vínculos ativos, vínculos por setor]."""
    for c, m in ms.items():
        m["rais"] = dict(antes.get(c, {}).get("rais", {}))
    feitos, seis = set(meta.get("rais_anos") or []), {str(c)[:6]: c for c in ms}
    feitos_br, seis_br = set(br["rais_anos"]), br["seis"]
    for ano in range(INICIO, date.today().year):
        if str(ano) in feitos and (not seis_br or str(ano) in feitos_br):
            continue
        try:
            nomes = ftp_lista(f"/pdet/microdados/RAIS/{ano}/")
        except Exception as e:  # noqa: BLE001
            log(f"RAIS {ano}: pasta indisponível ({e})")
            continue
        arq = next((n for n in nomes if re.search(r"(RAIS_ESTAB_PUB|ESTB\d{4})\.7z$", n, re.I)), None)
        if not arq:
            log(f"RAIS {ano}: arquivo de estabelecimentos ainda não publicado.")
            continue
        pasta = tempfile.mkdtemp()
        try:
            ftp_baixa(arq if arq.startswith("/") else f"/pdet/microdados/RAIS/{ano}/{arq}", os.path.join(pasta, "estab.7z"))
            os.makedirs(os.path.join(pasta, "x"))
            conta: dict = {}
            for caminho in extrai_7z(os.path.join(pasta, "estab.7z"), os.path.join(pasta, "x")):
                cab, linhas = tabela(caminho)
                iM, iV = coluna(cab, "MUNICIPIO"), coluna(cab, "QTD VINCULOS ATIVOS")
                iC, iS = coluna(cab, "CNAE 2.0 CLASSE"), coluna(cab, "IBGE SUBSETOR")
                if iM is None or iV is None:
                    raise RuntimeError(f"colunas não encontradas: {cab[:30]}")
                for l in linhas:
                    if len(l) <= max(iM, iV):
                        continue
                    k6 = l[iM].strip()[:6]
                    if k6 not in seis and k6 not in seis_br:
                        continue
                    v = int(num(l[iV]))
                    if v <= 0:
                        continue
                    cnae = re.sub(r"\D", "", l[iC]) if iC is not None else ""
                    if len(cnae) >= 2:
                        st = setor_cnae(int(cnae[:2]))
                    else:
                        sub = re.sub(r"\D", "", l[iS])[:2] if iS is not None else ""
                        st = SUBSETOR.get(int(sub), 4) if sub else 4
                    x = conta.setdefault(k6, [0, 0] + [0] * len(SETORES))
                    x[0] += 1
                    x[1] += v
                    x[2 + st] += v
            for k6, c in seis.items():
                if k6 in conta:
                    ms[c]["rais"][str(ano)] = conta[k6]
            for k6, c in seis_br.items():
                if k6 in conta:
                    br["m"].setdefault(c, {}).setdefault("rais", {})[str(ano)] = conta[k6][1:]
            feitos.add(str(ano))
            if seis_br:
                feitos_br.add(str(ano))
            log(f"RAIS {ano}: {len(conta)} municípios, {sum(x[1] for x in conta.values())} vínculos ativos.")
        except Exception as e:  # noqa: BLE001
            log(f"RAIS {ano}: falha ({e})")
        finally:
            shutil.rmtree(pasta, ignore_errors=True)
    for m in ms.values():
        m["rais"] = dict(sorted(m["rais"].items()))
    meta["rais_anos"] = sorted(feitos)
    br["rais_anos"] = sorted(feitos_br)


# ---------------------------------------------------------------- Novo Caged (movimentações mensais)
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def caged(ms: dict, antes: dict, meta: dict, br: dict) -> None:
    """caged[ano] = [admissões, desligamentos, saldo, saldo por setor (SETORES)], somando as movimentações do mês
    (MOV), as declaradas fora do prazo (FOR) e descontando as exclusões (EXC), pelo mês de competência."""
    for c, m in ms.items():
        m["caged"] = {a: list(v) for a, v in antes.get(c, {}).get("caged", {}).items()}
    feitos, seis = set(meta.get("caged_meses") or []), {str(c)[:6]: c for c in ms}
    feitos_br, seis_br = set(br["caged_meses"]), br["seis"]
    raiz = "/pdet/microdados/NOVO CAGED/"
    meses = []
    for ano in sorted(n.rsplit("/", 1)[-1] for n in ftp_lista(raiz) if re.fullmatch(r"\d{4}", n.rsplit("/", 1)[-1])):
        meses += sorted(n.rsplit("/", 1)[-1] for n in ftp_lista(f"{raiz}{ano}/") if re.fullmatch(r"\d{6}", n.rsplit("/", 1)[-1]))
    limite = time.monotonic() + PRAZO_CAGED * 60
    for mes in meses:
        soma_r, soma_br = mes not in feitos, bool(seis_br) and mes not in feitos_br   # cada mês entra uma única vez em cada saída
        if not (soma_r or soma_br) or int(mes[:4]) < INICIO:
            continue
        if time.monotonic() > limite:
            log(f"Caged: prazo esgotado; {mes} e seguintes ficam para a próxima execução.")
            break
        pasta = tempfile.mkdtemp()
        try:
            nomes = ftp_lista(f"{raiz}{mes[:4]}/{mes}/")
            n, mov_r, mov_br = 0, {}, {}   # o mês só entra nas somas depois de lido por inteiro
            for nome in nomes:
                base = nome.rsplit("/", 1)[-1].upper()
                tipo = next((t for t in ("MOV", "FOR", "EXC") if f"CAGED{t}" in base), None)
                if not tipo or not base.endswith(".7Z"):
                    continue
                sinal = -1 if tipo == "EXC" else 1
                ftp_baixa(nome if nome.startswith("/") else f"{raiz}{mes[:4]}/{mes}/{nome}", os.path.join(pasta, base))
                sub = os.path.join(pasta, tipo)
                os.makedirs(sub)
                for caminho in extrai_7z(os.path.join(pasta, base), sub):
                    cab, linhas = tabela(caminho)
                    iM, iS, iC, iT = coluna(cab, "MUNICIPIO"), coluna(cab, "SECAO"), coluna(cab, "COMPETENCIAMOV"), coluna(cab, "SALDOMOVIMENTACAO")
                    if None in (iM, iS, iT):
                        raise RuntimeError(f"colunas não encontradas: {cab[:12]}")
                    for l in linhas:
                        if len(l) <= max(iM, iS, iT):
                            continue
                        k6 = l[iM].strip()[:6]
                        no_r, no_br = soma_r and k6 in seis, soma_br and k6 in seis_br
                        if not (no_r or no_br):
                            continue
                        s = int(num(l[iT])) * sinal
                        ano = (l[iC].strip()[:4] if iC is not None else mes[:4]) or mes[:4]
                        i = 0 if int(num(l[iT])) > 0 else 1
                        if no_r:
                            x = mov_r.setdefault((seis[k6], ano), [0, 0, 0] + [0] * len(SETORES))
                            x[i] += sinal
                            x[2] += s
                            x[3 + setor_secao(l[iS])] += s
                            n += 1
                        if no_br:
                            x = mov_br.setdefault((seis_br[k6], ano), [0, 0, 0])
                            x[i] += sinal
                            x[2] += s
                os.remove(os.path.join(pasta, base))
                shutil.rmtree(sub, ignore_errors=True)
            for (c, ano), v in mov_r.items():
                x = ms[c]["caged"].setdefault(ano, [0, 0, 0] + [0] * len(SETORES))
                for j, y in enumerate(v):
                    x[j] += y
            for (c, ano), v in mov_br.items():
                x = br["m"].setdefault(c, {}).setdefault("caged", {}).setdefault(ano, [0, 0, 0])
                for j, y in enumerate(v):
                    x[j] += y
            if soma_r:
                feitos.add(mes)
                meta["caged_ate"] = f"{MESES[int(mes[4:]) - 1]}/{mes[:4]}"
            if soma_br:
                feitos_br.add(mes)
                br["caged_ate"] = f"{MESES[int(mes[4:]) - 1]}/{mes[:4]}"
            log(f"Caged {mes}: {n} movimentações no recorte" + (f", {sum(1 for _ in mov_br)} pares município-ano no Brasil." if soma_br else "."))
        except Exception as e:  # noqa: BLE001
            log(f"Caged {mes}: falha ({e}); fica para a próxima execução.")
        finally:
            shutil.rmtree(pasta, ignore_errors=True)
    for m in ms.values():
        m["caged"] = dict(sorted(m["caged"].items()))
    meta["caged_meses"] = sorted(feitos)
    br["caged_meses"] = sorted(feitos_br)


# ---------------------------------------------------------------- cobertura vacinal (SI-PNI, TabNet)
VACINAS = ("Penta", "Poliomielite", "Tríplice Viral  D1", "BCG")   # o nome da tríplice tem dois espaços no TabNet
FIM_PNI = 2022


def pni_tabela(pagina: str) -> dict[str, dict[str, float]]:
    """{código do município (6 dígitos): {ano: cobertura}} a partir da resposta do TabNet, que traz os dados num
    DataTable do Google Charts: addColumn('number','2016') ... e linhas ["120001 ACRELANDIA" ,{v: 67.16 ,f: '67,16'}, ...]."""
    cols = re.findall(r"addColumn\('[^']*'\s*,\s*'([^']*)'\)", pagina)
    if not cols:
        raise RuntimeError("resposta do TabNet sem a tabela de dados")
    out = {}
    for nome, resto in re.findall(r'\[\s*"([^"]*)"\s*((?:,\s*(?:\{[^}]*\}|null)\s*)*)\]', pagina):
        m = re.match(r"\s*(\d{6})", nome)
        if not m:
            continue
        vals = re.findall(r"\{v:\s*([-\d.eE]+)|(null)", resto)
        serie = {}
        for k, (v, nulo) in enumerate(vals, start=1):
            if k < len(cols) and re.fullmatch(r"\d{4}", cols[k].strip()) and v and not nulo:
                serie[cols[k].strip()] = float(v)
        out[m.group(1)] = serie
    return out


def vacinacao(ms: dict, antes: dict, meta: dict) -> None:
    """vac[ano] = [penta, poliomielite, tríplice viral (1ª dose), BCG], cobertura em %, de INICIO a 2022."""
    from urllib.parse import quote
    for c, m in ms.items():
        m["vac"] = dict(antes.get(c, {}).get("vac", {}))
    if str(FIM_PNI) in (meta.get("vac_anos") or []) and sum(1 for m in ms.values() if m["vac"]) > 0.9 * len(ms):
        log("Vacinação: série até 2022 já coletada.")
        return
    pg = requests.get(PNI + "dhdat.exe?bd_pni/cpnibr.def", headers=H, timeout=300).content.decode("latin-1")
    opts = lambda nome: re.findall(r'<option[^>]*value="([^"]*)"', (re.search(rf'name="{re.escape(nome)}"[^>]*>(.*?)</select>', pg, re.S | re.I) or [None, ""])[1], re.I)
    linha = next(v for v in opts("Linha") if v.startswith("Município"))
    col = next(v for v in opts("Coluna") if v.startswith("Ano"))
    anos = [v for v in opts("PAno") if v[:4].isdigit() and INICIO <= int(v[:4]) <= FIM_PNI]
    incs = {v.split("|")[0].strip(): v for v in opts("Incremento")}
    filtros = sorted(set(re.findall(r'name="(S[^"]+)"', pg)))
    seis = {str(c)[:6]: c for c in ms}
    nomes_uf = {v.split("|")[1]: v for v in opts("SUnidade da Federação") if "|" in v}
    achados = 0
    for k, vac in enumerate(VACINAS):
        inc = incs.get(vac) or next((v for n, v in incs.items() if sem_acento(n).replace(" ", "") == sem_acento(vac).replace(" ", "")), None)
        if not inc:
            log(f"Vacinação: {vac} não está no TabNet.")
            continue
        for uf, cod in UFS.items():
            campos = [("Linha", linha), ("Coluna", col), ("Incremento", inc)] + [("PAno", a) for a in anos] + [("SUnidade da Federação", nomes_uf[str(cod)])]
            campos += [(f, "TODAS_AS_CATEGORIAS__") for f in filtros if f != "SUnidade da Federação"]
            corpo = "&".join(f"{quote(a, encoding='latin-1')}={quote(b, encoding='latin-1')}" for a, b in campos + [("formato", "table"), ("mostre", "Mostra")])
            try:
                r = requests.post(PNI + "webtabx.exe?bd_pni/cpnibr.def", data=corpo, headers={**H, "Content-Type": "application/x-www-form-urlencoded"}, timeout=300)
                tab = pni_tabela(r.content.decode("latin-1"))
            except Exception as e:  # noqa: BLE001
                log(f"Vacinação {vac} {uf}: falha ({e})")
                continue
            for cod6, serie in tab.items():
                c = seis.get(cod6)
                if c is None:
                    continue
                for a, v in serie.items():
                    x = ms[c]["vac"].setdefault(a, [None] * len(VACINAS))
                    x[k] = round(v, 1)
                    achados += 1
    for m in ms.values():
        m["vac"] = dict(sorted(m["vac"].items()))
    if achados:
        meta["vac_anos"] = sorted({a for m in ms.values() for a in m["vac"]})
    log(f"Vacinação: {achados} coberturas município-ano-vacina.")


# ---------------------------------------------------------------- principal
def main() -> int:
    SAIDA.parent.mkdir(exist_ok=True)
    try:
        ant = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        ant = {}
    antes = {int(c): v for c, v in (ant.get("municipios") or {}).items()}
    meta = {k: ant.get(k) for k in ("cnpj_mes", "rais_anos", "caged_meses", "caged_ate", "vac_anos")}
    base = RAIZ / "data" / "municipios.json"
    ms = {m["c"]: {} for m in json.loads(base.read_text(encoding="utf-8"))["municipios"]} if base.exists() else {}
    if not ms:
        log("Sem data/municipios.json: rode antes a coleta principal.")
        return 0
    br = painel_brasil()
    so = set(sys.argv[1:])   # permite rodar só algumas partes: python complementos.py rais caged
    etapas = (("vacinacao", vacinacao), ("rais", rais), ("cnpj", cnpj), ("caged", caged))
    for nome, f in etapas:
        if so and nome not in so:
            for c, m in ms.items():
                for k in {"vacinacao": ("vac",), "rais": ("rais",), "cnpj": ("cnpj",), "caged": ("caged",)}[nome]:
                    if antes.get(c, {}).get(k) is not None:
                        m[k] = antes[c][k]
            continue
        t0 = time.time()
        try:
            f(ms, antes, meta, br) if nome in ("rais", "caged") else f(ms, antes, meta)
        except Exception as e:  # noqa: BLE001
            log(f"{nome}: falha ({e}); dados anteriores mantidos.")
            for c, m in ms.items():
                for k in ("vac", "rais", "cnpj", "caged"):
                    if k not in m and antes.get(c, {}).get(k) is not None:
                        m[k] = antes[c][k]
        log(f"{nome}: {time.time() - t0:.0f}s")
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fontes": "Ministério do Trabalho e Emprego (RAIS e Novo Caged), Receita Federal (CNPJ), DATASUS (SI-PNI)",
        "unidades": {"rais": "estabelecimentos com vínculo ativo, vínculos ativos em 31/12, vínculos por setor: " + ", ".join(SETORES),
                     "caged": "admissões, desligamentos, saldo, saldo por setor: " + ", ".join(SETORES),
                     "cnpj": "ativos por setor (" + ", ".join(SETORES) + "), abertos e fechados (baixados) por ano: matrizes e filiais, inclusive MEI",
                     "vac": "cobertura vacinal (%): " + ", ".join(VACINAS)},
        "setores": list(SETORES), **{k: v for k, v in meta.items() if v is not None},
        "municipios": {str(c): {k: v for k, v in m.items() if v} for c, m in sorted(ms.items())},
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Complementos gravados: {sum(1 for m in ms.values() if m)} municípios.")
    if br["seis"]:
        grava_brasil(br)
    return 0


def painel_brasil() -> dict:
    """Estado do arquivo nacional de emprego; sem data/brasil.json, a parte nacional fica de fora."""
    try:
        cods = [m["c"] for m in json.loads((RAIZ / "data" / "brasil.json").read_text(encoding="utf-8"))["municipios"]]
    except Exception:  # noqa: BLE001
        cods = []
    try:
        ant = json.loads(SAIDA_BR.read_text(encoding="utf-8")) if SAIDA_BR.exists() else {}
    except Exception:  # noqa: BLE001
        ant = {}
    return {"seis": {str(c)[:6]: c for c in cods}, "rais_anos": ant.get("rais_anos") or [], "caged_meses": ant.get("caged_meses") or [],
            "caged_ate": ant.get("caged_ate"), "m": {int(c): v for c, v in (ant.get("municipios") or {}).items()}}


def grava_brasil(br: dict) -> None:
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fontes": "Ministério do Trabalho e Emprego (RAIS e Novo Caged)",
        "unidades": {"rais": "vínculos ativos em 31/12, vínculos por setor: " + ", ".join(SETORES), "caged": "admissões, desligamentos e saldo"},
        "setores": list(SETORES), "rais_anos": br["rais_anos"], "caged_meses": br["caged_meses"], "caged_ate": br["caged_ate"],
        "municipios": {str(c): {k: dict(sorted(v.items())) for k, v in m.items() if v} for c, m in sorted(br["m"].items()) if m},
    }
    SAIDA_BR.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Emprego do Brasil gravado: {len(saida['municipios'])} municípios, RAIS {br['rais_anos'][:1]}…{br['rais_anos'][-1:]}, Caged até {br['caged_ate']}.")


if __name__ == "__main__":
    sys.exit(main())
