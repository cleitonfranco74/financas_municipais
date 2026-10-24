"""Atualiza data/municipios.json: finanças públicas, prefeitos e agropecuária dos municípios da
Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR, TO) mais Goiás e Mato Grosso do Sul, desde 2016.

Fontes, todas públicas e sem chave:
- Tesouro Nacional, Siconfi (API de dados abertos): Declaração de Contas Anuais (DCA) de cada
  município. Anexo I-C: receitas brutas, deduções, transferências e receita tributária; Anexo I-D:
  despesas liquidadas, totais e de investimento (4.4);
- TSE, votação por candidato (prefeito) nas eleições de 2012, 2016, 2020 e 2024: partido do
  vencedor e do segundo colocado, votos e turno decisivo (para a análise de eleições acirradas);
- IBGE (Sidra): população estimada (6579) e do Censo 2022 (4709); área colhida e valor da produção
  de soja, milho e algodão (PAM, 5457); rebanho bovino (PPM, 3939); PIB e valor adicionado da
  agropecuária (5938);
- Banco Central (SGS 433): IPCA, para a página levar os valores a preços constantes.
A posição ideológica dos partidos não é coletada: fica em ESCALA, a partir de Bolognesi, Ribeiro,
Codato e Silva (Opinião Pública, 2025) e, para partidos extintos, de Bolognesi, Ribeiro e Codato
(Dados, 2023).

O Siconfi é consultado município a município (cerca de 1 s por consulta); os anos já gravados são
reaproveitados e só se buscam os que faltam e os dois últimos anos. As eleições já gravadas também
não são baixadas de novo. Roda pela GitHub Action em .github/workflows/atualizar.yml.
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "municipios.json"
H = {"User-Agent": "Mozilla/5.0 (dashboard-financeiro; +github.com/cleitonfranco74/dashboard_financeiro)"}
UFS = {"AC": 12, "AM": 13, "AP": 16, "MA": 21, "MT": 51, "PA": 15, "RO": 11, "RR": 14, "TO": 17, "GO": 52, "MS": 50}
INICIO = 2016
ELEICOES = (2012, 2016, 2020, 2024)
SICONFI = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/"
SIDRA = "https://apisidra.ibge.gov.br/values/"
TSE = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_{}.zip"
TSE_IBGE = "https://raw.githubusercontent.com/betafcc/Municipios-Brasileiros-TSE/master/municipios_brasileiros_tse.csv"
LAVOURAS = {"40124": "soja", "40122": "milho", "40099": "algodao"}
TRABALHADORES = 8          # consultas simultâneas ao Siconfi
MAX_CONSULTAS = 30000      # teto por execução (a primeira carga tem cerca de 23 mil)

# Escala esquerda (0) – direita (10). Média ponderada das rodadas de 2018 e 2022 em Bolognesi, Ribeiro,
# Codato e Silva (2025); partidos extintos ou renomeados antes de 2022 com a média de 2018 (Dados, 2023).
ESCALA = {
    "PSTU": 0.525, "PCO": 0.566, "PCB": 0.711, "PSOL": 1.453, "UP": 1.679, "PCDOB": 1.834, "PT": 2.761,
    "PSB": 3.699, "REDE": 3.802, "PDT": 3.977, "PV": 4.245, "SOLIDARIEDADE": 6.193, "CIDADANIA": 6.358,
    "AVANTE": 6.667, "MDB": 6.698, "PMN": 6.945, "PSDB": 6.966, "PSD": 7.151, "PMB": 7.512, "PODE": 7.666,
    "PROS": 7.677, "PRTB": 7.718, "AGIR": 7.780, "PTB": 7.955, "PP": 8.398, "DC": 8.460, "REPUBLICANOS": 8.584,
    "PSC": 8.666, "UNIAO": 8.749, "PATRIOTA": 8.862, "NOVO": 8.934, "PL": 9.068,
    # extintos (média de 2018)
    "DEM": 8.57, "PSL": 8.11, "PHS": 6.96, "PRP": 7.59, "PPL": 7.27,
    # PRD (2023) = fusão de PTB e Patriota: média dos dois, imputada
    "PRD": 8.409,
}
# siglas antigas ou grafias do TSE → sigla da escala
SINONIMOS = {"PC DO B": "PCDOB", "PCDOB": "PCDOB", "PT DO B": "AVANTE", "PTDOB": "AVANTE", "SD": "SOLIDARIEDADE",
             "PPS": "CIDADANIA", "PMDB": "MDB", "PTN": "PODE", "PODEMOS": "PODE", "PEN": "PATRIOTA", "PATRI": "PATRIOTA",
             "PRB": "REPUBLICANOS", "PR": "PL", "PTC": "AGIR", "PSDC": "DC", "PROGRESSISTAS": "PP", "UNIÃO": "UNIAO",
             "MOBILIZA": "PMN", "SOLIDARIEDADE": "SOLIDARIEDADE"}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def get(url: str, params: dict | None = None, timeout: int = 120, tentativas: int = 4):
    for t in range(tentativas):
        try:
            r = requests.get(url, params=params, headers=H, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            return r
        except Exception:  # noqa: BLE001
            if t == tentativas - 1:
                raise
            time.sleep(2 * (t + 1))


def sigla_escala(sg: str) -> str:
    s = sg.strip().upper()
    return SINONIMOS.get(s, s)


# ---------------------------------------------------------------- municípios e IBGE
def municipios() -> dict[int, dict]:
    r = get(SICONFI + "entes").json()["items"]
    return {e["cod_ibge"]: {"c": e["cod_ibge"], "n": e["ente"], "uf": e["uf"]}
            for e in r if e.get("esfera") == "M" and e.get("uf") in UFS}


def sidra(caminho: str) -> list[dict]:
    """Consulta o Sidra para os municípios das UFs do recorte (um pedido por UF, para caber no limite)."""
    out = []
    for cod in UFS.values():
        d = get(SIDRA + caminho.format(f"n6/in%20n3%20{cod}"), timeout=240).json()
        out += d[1:]
    return out


def valor(v: str) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None   # "-", "...", "X" (sigilo)


def populacao(ms: dict) -> None:
    pop: dict = {}
    for l in sidra("t/6579/{}/v/9324/p/all"):
        if (v := valor(l["V"])) is not None:
            pop.setdefault(int(l["D1C"]), {})[int(l["D3C"])] = v
    for l in sidra("t/4709/{}/v/93/p/2022"):
        if (v := valor(l["V"])) is not None:
            pop.setdefault(int(l["D1C"]), {})[2022] = v
    fim = date.today().year
    for c, m in ms.items():
        p = pop.get(c, {})
        anos = sorted(p)
        serie = {}
        for a in range(INICIO, fim + 1):
            if a in p:
                serie[a] = p[a]
            elif anos:   # interpola entre os anos vizinhos; nas pontas, repete o mais próximo
                ant = max((x for x in anos if x < a), default=None)
                pos = min((x for x in anos if x > a), default=None)
                if ant and pos:
                    serie[a] = p[ant] + (p[pos] - p[ant]) * (a - ant) / (pos - ant)
                else:
                    serie[a] = p[ant or pos]
        m["pop"] = {str(a): round(v) for a, v in serie.items()}


def agro(ms: dict) -> None:
    lav: dict = {}
    for l in sidra(f"t/5457/{{}}/v/216,215/p/last%2012/c782/{','.join(LAVOURAS)}"):
        c, a = int(l["D1C"]), l["D3C"]
        if int(a) < INICIO:
            continue
        x = lav.setdefault(c, {}).setdefault(a, {"soja": 0, "milho": 0, "algodao": 0, "valor": 0})
        v = valor(l["V"]) or 0
        if l["D2C"] == "216":
            x[LAVOURAS[l["D4C"]]] += v
        else:
            x["valor"] += v
    boi: dict = {}
    for l in sidra("t/3939/{}/v/105/p/last%2012/c79/2670"):
        if int(l["D3C"]) >= INICIO:
            boi.setdefault(int(l["D1C"]), {})[l["D3C"]] = valor(l["V"]) or 0
    pib: dict = {}
    for l in sidra("t/5938/{}/v/37,513/p/all"):
        if int(l["D3C"]) < INICIO:
            continue
        pib.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [None, None])[0 if l["D2C"] == "37" else 1] = valor(l["V"])
    for c, m in ms.items():
        anos = sorted(set(lav.get(c, {})) | set(boi.get(c, {})))
        # [soja ha, milho ha, algodão ha, valor das três lavouras (R$ mil), bovinos (cabeças)]
        m["agro"] = {a: [round(lav.get(c, {}).get(a, {}).get(k, 0)) for k in ("soja", "milho", "algodao", "valor")]
                     + [round(boi.get(c, {}).get(a, 0))] for a in anos}
        # [PIB, valor adicionado da agropecuária], R$ mil
        m["pib"] = {a: v for a, v in sorted(pib.get(c, {}).items())}


# ---------------------------------------------------------------- Siconfi
def dca(cod: int, ano: int) -> list | None:
    """[receita líquida, transferências, receita tributária, despesa liquidada, investimento liquidado] em R$ mil."""
    rec = get(SICONFI + "dca", {"an_exercicio": ano, "id_ente": cod, "no_anexo": "DCA-Anexo I-C"}, timeout=90).json().get("items", [])
    desp = get(SICONFI + "dca", {"an_exercicio": ano, "id_ente": cod, "no_anexo": "DCA-Anexo I-D"}, timeout=90).json().get("items", [])
    if not rec and not desp:
        return None
    def soma(itens, prefixo, coluna):
        return sum(i.get("valor") or 0 for i in itens if str(i.get("cod_conta", "")).startswith(prefixo) and coluna(i.get("coluna", "")))
    bruta = lambda c: c == "Receitas Brutas Realizadas"
    deducao = lambda c: c.startswith("Dedu") or c.startswith("Outras Dedu")
    liquidada = lambda c: c == "Despesas Liquidadas"
    receita = soma(rec, "TotalReceitas", bruta) - soma(rec, "TotalReceitas", deducao)
    transf = soma(rec, "RO1.7.0.0.00.", bruta) + soma(rec, "RO2.4.0.0.00.", bruta)
    trib = soma(rec, "RO1.1.0.0.00.", bruta)
    despesa = soma(desp, "DO3.0.00.00.00", liquidada) + soma(desp, "DO4.0.00.00.00", liquidada)
    invest = soma(desp, "DO4.4.00.00.00", liquidada)
    return [round(x / 1e3, 1) for x in (receita, transf, trib, despesa, invest)]


def financas(ms: dict, antes: dict) -> None:
    fim = date.today().year - 1                       # a DCA de um ano sai no ano seguinte
    pendentes = []
    for c, m in ms.items():
        velho = antes.get(c, {}).get("fin", {})
        m["fin"] = {a: v for a, v in velho.items() if v}
        for a in range(INICIO, fim + 1):
            if str(a) not in m["fin"] or a >= fim - 1:   # os dois últimos anos podem ser retificados
                pendentes.append((c, a))
    pendentes = pendentes[:MAX_CONSULTAS // 2]
    log(f"Siconfi: {len(pendentes)} declarações a consultar.")
    feitos = erros = 0
    with ThreadPoolExecutor(TRABALHADORES) as ex:
        fut = {ex.submit(dca, c, a): (c, a) for c, a in pendentes}
        for f in as_completed(fut):
            c, a = fut[f]
            try:
                v = f.result()
                if v and (v[0] or v[3]):
                    ms[c]["fin"][str(a)] = v
            except Exception as e:  # noqa: BLE001
                erros += 1
                if erros <= 5:
                    log(f"Siconfi {c}/{a}: {e}")
            feitos += 1
            if feitos % 1000 == 0:
                log(f"  {feitos}/{len(pendentes)}")
    for m in ms.values():
        m["fin"] = dict(sorted(m["fin"].items()))
    log(f"Siconfi: {feitos} consultas, {erros} erros.")


# ---------------------------------------------------------------- TSE
def tse_ibge() -> dict[str, int]:
    r = get(TSE_IBGE).text
    return {l["codigo_tse"].zfill(5): int(l["codigo_ibge"]) for l in csv.DictReader(io.StringIO(r)) if l["uf"] in UFS}


def eleicao(ano: int, mapa: dict[str, int]) -> dict[int, list]:
    """{ibge: [partido do vencedor, votos, partido do 2º, votos, votos válidos no turno, turno]} da eleição ordinária."""
    z = zipfile.ZipFile(io.BytesIO(get(TSE.format(ano), timeout=900).content))
    votos: dict = {}
    for uf in UFS:
        nome = next((n for n in z.namelist() if n.endswith(f"_{ano}_{uf}.csv")), None)
        if not nome:
            log(f"TSE {ano}: sem arquivo de {uf}")
            continue
        with z.open(nome) as f:
            for l in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
                if l["CD_CARGO"] != "11" or l["CD_TIPO_ELEICAO"] != "2":
                    continue
                q = l.get("QT_VOTOS_NOMINAIS_VALIDOS") or l["QT_VOTOS_NOMINAIS"]
                chave = (l["CD_MUNICIPIO"].zfill(5), int(l["NR_TURNO"]))
                cand = votos.setdefault(chave, {}).setdefault(l["SQ_CANDIDATO"], [l["SG_PARTIDO"], 0, l["DS_SIT_TOT_TURNO"]])
                cand[1] += int(q or 0)
    out: dict[int, list] = {}
    for (tse, turno), cands in votos.items():
        ibge = mapa.get(tse)
        if not ibge or (ibge in out and out[ibge][5] > turno):
            continue
        ordem = sorted(cands.values(), key=lambda x: -x[1])
        if not ordem or ordem[0][1] == 0:
            continue
        v = next((x for x in ordem if x[2].upper().startswith("ELEITO")), ordem[0])
        s = next((x for x in ordem if x is not v), None)
        out[ibge] = [v[0], v[1], s[0] if s else None, s[1] if s else 0, sum(x[1] for x in ordem), turno]
    log(f"TSE {ano}: {len(out)} municípios.")
    return out


def eleicoes(ms: dict, antes: dict) -> None:
    mapa = None
    for ano in ELEICOES:
        a = str(ano)
        ja = {c: m["ele"][a] for c, m in antes.items() if a in m.get("ele", {})}
        if len(ja) > 0.9 * len(ms):
            res = ja
        else:
            try:
                mapa = mapa or tse_ibge()
                res = eleicao(ano, mapa)
            except Exception as e:  # noqa: BLE001
                log(f"TSE {ano}: falha ({e}); mantidos os dados anteriores.")
                res = ja
        for c, m in ms.items():
            if c in res:
                m.setdefault("ele", {})[a] = res[c]


def ipca() -> dict[str, float]:
    """IPCA médio de cada ano (índice, base: dez/1993 = 100) a partir da variação mensal (SGS 433)."""
    d = get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados", {"formato": "json", "dataInicial": "01/01/2016"}).json()
    idx, soma, n, out = 100.0, {}, {}, {}
    for l in d:
        idx *= 1 + float(l["valor"]) / 100
        a = l["data"][-4:]
        soma[a] = soma.get(a, 0) + idx
        n[a] = n.get(a, 0) + 1
    return {a: round(soma[a] / n[a], 4) for a in soma}


def main() -> int:
    try:
        antes = {m["c"]: m for m in json.loads(SAIDA.read_text(encoding="utf-8"))["municipios"]} if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        antes = {}
    try:
        ms = municipios()
    except Exception as e:  # noqa: BLE001
        log(f"Municípios: falha ao listar os entes do Siconfi ({e}); mantido o arquivo anterior.")
        return 0
    log(f"{len(ms)} municípios em {len(UFS)} UFs.")
    etapas = (("população", lambda: populacao(ms)), ("agropecuária", lambda: agro(ms)),
              ("finanças", lambda: financas(ms, antes)), ("eleições", lambda: eleicoes(ms, antes)))
    for nome, f in etapas:
        try:
            f()
        except Exception as e:  # noqa: BLE001
            log(f"{nome}: falha ({e}); dados anteriores mantidos.")
            for c, m in ms.items():
                for k in ("pop", "agro", "pib", "fin", "ele"):
                    if k not in m and k in antes.get(c, {}):
                        m[k] = antes[c][k]
    try:
        deflator = ipca()
    except Exception as e:  # noqa: BLE001
        log(f"IPCA: falha ({e})")
        deflator = json.loads(SAIDA.read_text(encoding="utf-8")).get("ipca", {}) if SAIDA.exists() else {}
    com_fin = sum(1 for m in ms.values() if m.get("fin"))
    if com_fin < 0.5 * len(ms):
        log(f"Municípios: só {com_fin} com finanças; mantido o arquivo anterior.")
        return 0
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fontes": "Tesouro Nacional (Siconfi, DCA), TSE (resultados das eleições), IBGE (Sidra: população, PAM, PPM, PIB dos Municípios) e Banco Central (IPCA)",
        "unidades": {"fin": "R$ mil correntes: receita líquida, transferências, receita tributária, despesa liquidada, investimento liquidado",
                     "agro": "soja, milho e algodão (ha colhidos), valor das três lavouras (R$ mil), bovinos (cabeças)",
                     "pib": "PIB e valor adicionado da agropecuária (R$ mil correntes)",
                     "ele": "partido do vencedor, votos, partido do 2º colocado, votos, votos válidos, turno"},
        "ufs": list(UFS),
        "eleicoes": list(map(str, ELEICOES)),
        "escala": ESCALA,
        "sinonimos": SINONIMOS,
        "ipca": deflator,
        "municipios": sorted(ms.values(), key=lambda m: (m["uf"], m["n"])),
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Municípios: {len(ms)} gravados ({com_fin} com finanças).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
