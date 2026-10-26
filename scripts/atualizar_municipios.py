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
- Banco Central (SGS 433): IPCA, para a página levar os valores a preços constantes;
- Siconfi, também: anexo I-E da DCA (despesa liquidada por função), RGF simplificado do Executivo
  (anexo 06: receita corrente líquida, despesa com pessoal e dívida consolidada líquida em % da RCL,
  restos a pagar e caixa) e RREO simplificado do 6º bimestre (anexo 14: resultado primário e meta);
  no anexo I-C, as principais fontes de receita (FPM, ICMS, ITR, CFEM, royalties de petróleo, IPVA,
  convênios da União e do estado e transferências especiais, as "emendas Pix");
- TSE, cadastro de candidatos: prefeitos eleitos para o segundo mandato (reeleição) e partido dos
  governadores eleitos em 2014, 2018 e 2022 (para o alinhamento partidário);
- IBGE (Sidra): pessoal ocupado assalariado, total e na agropecuária (Cempre, 6450); domicílios com
  esgotamento pela rede geral (6805) e taxa de alfabetização (9543), do Censo 2022;
- DATASUS (TabNet): óbitos infantis (SIM) e nascidos vivos (Sinasc) por município de residência;
- Inpe: desmatamento anual (PRODES Amazônia Legal e Cerrado) e focos de queimadas, em espaciais.py.
A posição ideológica dos partidos não é coletada: fica em ESCALA, a partir de Bolognesi, Ribeiro,
Codato e Silva (Opinião Pública, 2025) e, para partidos extintos, de Bolognesi, Ribeiro e Codato
(Dados, 2023).

O Siconfi é consultado município a município (cerca de 1 s por consulta); os anos já gravados são
reaproveitados e só se buscam os que faltam e os dois últimos anos. As eleições, o Censo e os anos
fechados das demais fontes também não são baixados de novo. Roda pela GitHub Action em
.github/workflows/atualizar.yml.
"""
from __future__ import annotations

import csv
import io
import json
import html
import re
import sys
import threading
import time
import unicodedata
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
TSE_CAND = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{}.zip"
TSE_IBGE = "https://raw.githubusercontent.com/betafcc/Municipios-Brasileiros-TSE/master/municipios_brasileiros_tse.csv"
TABNET = "http://tabnet.datasus.gov.br/cgi/"
LAVOURAS = {"40124": "soja", "40122": "milho", "40099": "algodao"}
GOVERNADORES = (2014, 2018, 2022)
TRABALHADORES = 8          # consultas simultâneas ao Siconfi (o ritmo comum limita os pedidos por segundo)
MAX_PARES = 20000          # teto de pares município-ano por execução (a primeira carga tem cerca de 11 mil)
PRAZO_SICONFI = 190        # minutos; o que faltar fica para a execução seguinte (a primeira carga leva duas ou três)

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


class Ritmo:
    """Ritmo comum a todas as consultas ao Siconfi: um intervalo mínimo entre pedidos, que cresce a cada
    HTTP 429 (com uma pausa geral) e volta a diminuir devagar quando as respostas vêm normais."""
    def __init__(self, intervalo: float):
        self.intervalo, self.minimo, self.proximo, self.trava = intervalo, intervalo, 0.0, threading.Lock()

    def espera(self) -> None:
        with self.trava:
            agora = time.monotonic()
            vez = max(agora, self.proximo)
            self.proximo = vez + self.intervalo
        time.sleep(max(0.0, vez - agora))

    def recusado(self, pausa: float) -> None:
        with self.trava:
            self.intervalo = min(2.0, self.intervalo * 1.25)
            self.proximo = max(self.proximo, time.monotonic() + pausa)

    def aceito(self) -> None:
        with self.trava:
            self.intervalo = max(self.minimo, self.intervalo * 0.995)


RITMO = Ritmo(0.2)   # até 5 pedidos por segundo ao Siconfi


def get(url: str, params: dict | None = None, timeout: int = 120, tentativas: int = 4):
    siconfi = url.startswith(SICONFI)
    if siconfi:
        tentativas = max(tentativas, 8)
    for t in range(tentativas):
        try:
            if siconfi:
                RITMO.espera()
            r = requests.get(url, params=params, headers=H, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                if siconfi and r.status_code == 429:
                    ra = r.headers.get("Retry-After", "")
                    RITMO.recusado(float(ra) if ra.isdigit() else 15 * (t + 1))
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            if siconfi:
                RITMO.aceito()
            return r
        except Exception:  # noqa: BLE001
            if t == tentativas - 1:
                raise
            time.sleep(min(60, 2 ** (t + 1)))


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
    # PIB e valor adicionado: agropecuária, indústria, serviços (exceto administração pública) e administração pública
    ordem = {"37": 0, "513": 1, "517": 2, "6575": 3, "525": 4}
    for l in sidra("t/5938/{}/v/37,513,517,6575,525/p/all"):
        if int(l["D3C"]) < INICIO:
            continue
        pib.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [None] * 5)[ordem[l["D2C"]]] = valor(l["V"])
    for c, m in ms.items():
        anos = sorted(set(lav.get(c, {})) | set(boi.get(c, {})))
        # [soja ha, milho ha, algodão ha, valor das três lavouras (R$ mil), bovinos (cabeças)]
        m["agro"] = {a: [round(lav.get(c, {}).get(a, {}).get(k, 0)) for k in ("soja", "milho", "algodao", "valor")]
                     + [round(boi.get(c, {}).get(a, 0))] for a in anos}
        # [PIB, valor adicionado da agropecuária, da indústria, dos serviços e da administração pública], R$ mil
        m["pib"] = {a: v for a, v in sorted(pib.get(c, {}).items())}


# ---------------------------------------------------------------- Siconfi
# Fontes de receita do anexo I-C: códigos do ementário antigo (até 2017) e do novo (desde 2018).
# A ordem é a da lista RC_NOMES; cada fonte soma os códigos encontrados.
RC_NOMES = ("fpm", "icms", "itr", "cfem", "petroleo", "ipva", "conv_uniao", "conv_estado", "especial", "impostos")
RC_CODIGOS = {
    "fpm": ("RO1.7.1.8.01.2.0", "RO1.7.1.8.01.3.0", "RO1.7.1.8.01.4.0", "RO1.7.1.1.51.0.0", "RO1.7.2.1.01.02.00", "RO1.7.2.1.01.03.00", "RO1.7.2.1.01.04.00"),
    "icms": ("RO1.7.2.8.01.1.0", "RO1.7.2.1.50.0.0", "RO1.7.2.2.01.01.00"),
    "itr": ("RO1.7.1.8.01.5.0", "RO1.7.1.1.52.0.0", "RO1.7.2.1.01.05.00"),
    "cfem": ("RO1.7.1.8.02.2.0", "RO1.7.1.2.51.0.0", "RO1.7.2.1.22.20.00"),
    "petroleo": ("RO1.7.1.8.02.3.0", "RO1.7.1.8.02.6.0", "RO1.7.1.2.52.0.0", "RO1.7.2.1.22.10.00", "RO1.7.2.1.22.70.00"),
    "ipva": ("RO1.7.2.8.01.2.0", "RO1.7.2.1.51.0.0", "RO1.7.2.2.01.02.00"),
    "conv_uniao": ("RO1.7.1.8.10.0.0", "RO2.4.1.8.10.0.0", "RO1.7.1.4.00.0.0", "RO2.4.1.4.00.0.0", "RO1.7.6.1.00.00.00", "RO2.4.7.1.00.00.00"),
    "conv_estado": ("RO1.7.2.8.10.0.0", "RO2.4.2.8.10.0.0", "RO1.7.2.4.00.0.0", "RO2.4.2.2.00.0.0", "RO1.7.6.2.00.00.00", "RO2.4.7.2.00.00.00"),
    "especial": ("RO2.4.1.9.51.0.0", "RO1.7.1.9.51.0.0"),
    "impostos": ("RO1.1.1.0.00.0.0", "RO1.1.1.0.00.00.00"),
}


# Repasses classificados pelo nome da conta do anexo I-C da DCA: os códigos mudaram três vezes (até 2017,
# 2018 a 2021 e desde 2022) e até dentro de um mesmo ementário; o nome e a esfera de origem são estáveis.
TR_NOMES = ("fundeb", "sus_uniao", "sus_estado", "fnde", "educ_estado", "assist_uniao", "assist_estado")


def _sem_acento(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()


def _esfera(cod: str) -> str | None:
    """U (União), E (estados) ou F (fundos multigovernamentais, como o FUNDEB) a partir do código da receita."""
    c = cod[2:]
    if len(c.split(".")) == 7 and len(c.split(".")[5]) == 2:        # ementário até 2017
        for pref, e in ((("1.7.2.1", "2.4.2.1", "1.7.6.1", "2.4.7.1"), "U"), (("1.7.2.2", "2.4.2.2", "1.7.6.2", "2.4.7.2"), "E"), (("1.7.2.4", "2.4.2.4"), "F")):
            if c.startswith(pref):
                return e
        return None
    return "U" if c.startswith(("1.7.1", "2.4.1")) else "E" if c.startswith(("1.7.2", "2.4.2")) else "F" if c.startswith(("1.7.5", "2.4.5")) else None


def _item_repasse(cod: str, conta: str) -> str | None:
    n, e = _sem_acento(conta), _esfera(cod)
    if not e or "CONVENIO" in n:
        return None
    if re.search(r"FUNDO DE MANUTENCAO E DESENVOLVIMENTO|FUNDEB|COMPLEMENTACAO DA UNIAO", n):
        return "fundeb"
    if re.search(r"SISTEMA UNICO DE SAUDE|\bSUS\b|PROGRAMAS DE SAUDE|SERVICOS PUBLICOS DE SAUDE", n):
        return "sus_uniao" if e == "U" else "sus_estado" if e == "E" else None
    if re.search(r"ASSISTENCIA SOCIAL", n):
        return "assist_uniao" if e == "U" else "assist_estado" if e == "E" else None
    if e == "U" and re.search(r"DESENVOLVIMENTO DA EDUCACAO|FNDE|SALARIO.EDUCACAO|ALIMENTACAO ESCOLAR|TRANSPORTE ESCOLAR|PROGRAMAS DE EDUCACAO", n):
        return "fnde"
    if e == "E" and re.search(r"EDUCACAO|TRANSPORTE ESCOLAR|ALIMENTACAO ESCOLAR", n):
        return "educ_estado"
    return None


def repasses(rec: list) -> list:
    """Soma, em R$ mil, cada repasse de TR_NOMES, sem contar duas vezes uma conta e a sua conta-mãe."""
    sig = lambda cod: tuple(cod[2:].split("."))[: max([0] + [i + 1 for i, x in enumerate(cod[2:].split(".")) if x.strip("0")])]
    achados: dict = {k: [] for k in TR_NOMES}
    for i in rec:
        if i.get("coluna") != "Receitas Brutas Realizadas":
            continue
        k = _item_repasse(str(i.get("cod_conta", "")), i.get("conta", ""))
        if k:
            achados[k].append((sig(str(i["cod_conta"])), i.get("valor") or 0))
    out = []
    for k in TR_NOMES:
        cods = achados[k]
        total = sum(v for s, v in cods if not any(o != s and s[: len(o)] == o for o, _ in cods))
        out.append(round(total / 1e3, 1))
    return out


def siconfi(cod: int, ano: int, so_lrf: bool = False, pequeno: bool = False, so_ic: bool = False) -> dict:
    """Contas de um município num ano, em R$ mil:
    fin: [receita líquida, transferências, receita tributária, despesa liquidada, investimento liquidado];
    rc: fontes de receita na ordem de RC_NOMES; fn: {função: despesa liquidada};
    lrf: [RCL, pessoal % RCL, dívida consolidada líquida % RCL, restos a pagar não processados, caixa líquido,
          resultado primário, meta de resultado primário, % aplicado em saúde, % aplicado em educação (MDE)]."""
    p = lambda anexo: {"an_exercicio": ano, "id_ente": cod, "no_anexo": anexo}
    itens = lambda r: r.json().get("items", [])
    out: dict = {}
    rec = [] if so_lrf else itens(get(SICONFI + "dca", p("DCA-Anexo I-C"), timeout=90))
    if so_ic:   # só os repasses e as fontes de receita (anos já coletados antes da classificação dos repasses)
        if rec:
            brutas = {i.get("cod_conta"): i.get("valor") or 0 for i in rec if i.get("coluna") == "Receitas Brutas Realizadas"}
            out["rc"] = [round(sum(brutas.get(k, 0) for k in RC_CODIGOS[n]) / 1e3, 1) for n in RC_NOMES]
        out["tr"] = repasses(rec)
        return out
    desp = [] if so_lrf else itens(get(SICONFI + "dca", p("DCA-Anexo I-D"), timeout=90))
    if rec or desp:
        def soma(lista, prefixo, coluna):
            return sum(i.get("valor") or 0 for i in lista if str(i.get("cod_conta", "")).startswith(prefixo) and coluna(i.get("coluna", "")))
        bruta = lambda c: c == "Receitas Brutas Realizadas"
        deducao = lambda c: c.startswith("Dedu") or c.startswith("Outras Dedu")
        liquidada = lambda c: c == "Despesas Liquidadas"
        receita = soma(rec, "TotalReceitas", bruta) - soma(rec, "TotalReceitas", deducao)
        transf = soma(rec, "RO1.7.0.0.00.", bruta) + soma(rec, "RO2.4.0.0.00.", bruta)
        trib = soma(rec, "RO1.1.0.0.00.", bruta)
        despesa = soma(desp, "DO3.0.00.00.00", liquidada) + soma(desp, "DO4.0.00.00.00", liquidada)
        invest = soma(desp, "DO4.4.00.00.00", liquidada)
        if receita or despesa:
            out["fin"] = [round(x / 1e3, 1) for x in (receita, transf, trib, despesa, invest)]
        brutas = {i.get("cod_conta"): i.get("valor") or 0 for i in rec if bruta(i.get("coluna", ""))}
        out["rc"] = [round(sum(brutas.get(k, 0) for k in RC_CODIGOS[n]) / 1e3, 1) for n in RC_NOMES]
        out["tr"] = repasses(rec)
    funcoes = [] if so_lrf else itens(get(SICONFI + "dca", p("DCA-Anexo I-E"), timeout=90))
    fn = {}
    for i in funcoes:
        m = re.match(r"^\s*(\d\d) - ", i.get("conta") or "")
        if m and i.get("coluna") == "Despesas Liquidadas":
            fn[m.group(1)] = fn.get(m.group(1), 0) + (i.get("valor") or 0)
    if fn:
        out["fn"] = {k: round(v / 1e3, 1) for k, v in sorted(fn.items())}
    # RGF do Executivo, Anexo 6 (demonstrativo simplificado): 3º quadrimestre ou 2º semestre. Municípios com menos
    # de 50 mil habitantes podem publicar o "RGF Simplificado", semestral, e o "RREO Simplificado".
    rgf = []
    tentativas = (("RGF", "Q", 3), ("RGF Simplificado", "S", 2), ("RGF", "S", 2), ("RGF Simplificado", "Q", 3))
    if pequeno:   # quem tem menos de 50 mil habitantes costuma publicar o simplificado: tenta ele primeiro
        tentativas = (tentativas[1], tentativas[0], tentativas[2], tentativas[3])
    for tipo, periodicidade, periodo in tentativas:
        rgf = itens(get(SICONFI + "rgf", {"an_exercicio": ano, "in_periodicidade": periodicidade, "nr_periodo": periodo,
                                         "co_tipo_demonstrativo": tipo, "no_anexo": "RGF-Anexo 06", "co_poder": "E", "id_ente": cod}, timeout=90))
        if rgf:
            break
    rreo = []
    for tipo in (("RREO Simplificado", "RREO") if pequeno else ("RREO", "RREO Simplificado")):
        rreo = itens(get(SICONFI + "rreo", {"an_exercicio": ano, "nr_periodo": 6, "co_tipo_demonstrativo": tipo,
                                           "no_anexo": "RREO-Anexo 14", "id_ente": cod}, timeout=90))
        if rreo:
            break
    def acha(lista, conta, coluna):
        for i in lista:
            if conta(str(i.get("cod_conta", ""))) and coluna(str(i.get("coluna", "")).upper()):
                return i.get("valor")
        return None
    if rgf or rreo:
        rcl = acha(rgf, lambda c: c == "ReceitaCorrenteLiquida", lambda c: c.startswith("VALOR")) or \
              acha(rreo, lambda c: c == "ReceitaCorrenteLiquidaDemonstrativoSimplificado", lambda c: True)
        pessoal = acha(rgf, lambda c: "DespesaTotalComPessoal" in c, lambda c: "%" in c)
        divida = acha(rgf, lambda c: "DividaConsolidadaLiquida" in c, lambda c: "%" in c)
        rp = acha(rgf, lambda c: "ValorTotalRestosAPagar" in c, lambda c: c.startswith("RESTOS A PAGAR EMPENHADOS"))
        caixa = acha(rgf, lambda c: "ValorTotalRestosAPagar" in c, lambda c: c.startswith("DISPONIBILIDADE"))
        primario = acha(rreo, lambda c: "ResultadoPrimario" in c and "Simplificado" in c, lambda c: c.startswith("RESULTADO APURADO"))
        meta = acha(rreo, lambda c: "ResultadoPrimario" in c and "Simplificado" in c, lambda c: c.startswith("META"))
        saude = acha(rreo, lambda c: "ServicosPublicosDeSaude" in c, lambda c: c.startswith("% APLICADO"))
        ensino = acha(rreo, lambda c: "ManutencaoEDesenvolvimentoDoEnsino" in c, lambda c: c.startswith("% APLICADO"))
        mil = lambda x: round(x / 1e3, 1) if x is not None else None
        out["lrf"] = [mil(rcl), pessoal, divida, mil(rp), mil(caixa), mil(primario), mil(meta), saude, ensino]
    else:
        out["lrf"] = [None] * 9   # nada publicado: marca como consultado (os dois últimos anos são sempre revistos)
    return out


def financas(ms: dict, antes: dict) -> None:
    fim = date.today().year - 1                       # a DCA de um ano sai no ano seguinte
    chaves = ("fin", "rc", "fn", "lrf", "tr")
    pendentes, revisar = [], []
    for c, m in ms.items():
        for k in chaves:
            m[k] = {a: v for a, v in antes.get(c, {}).get(k, {}).items() if v}
        for a in range(INICIO, fim + 1):
            if str(a) not in m["fin"]:
                pendentes.append((c, a, "tudo"))
            elif a >= fim - 1:                            # os dois últimos anos podem ser retificados
                revisar.append((c, a, "tudo"))
            elif len(m["lrf"].get(str(a), [])) < 9:       # falta a LRF (ou os campos novos): só RGF e RREO
                revisar.append((c, a, "lrf"))
            elif str(a) not in m["tr"]:                    # faltam os repasses classificados: só o anexo I-C
                revisar.append((c, a, "ic"))
    # primeiro o que falta (anos recentes antes), depois as revisões, se sobrar tempo
    pendentes = (sorted(pendentes, key=lambda p: -p[1]) + sorted(revisar, key=lambda p: -p[1]))[:MAX_PARES]
    limite = time.monotonic() + PRAZO_SICONFI * 60
    def tarefa(c, a, modo):
        pop = ms[c].get("pop", {}).get(str(a)) or 0
        return siconfi(c, a, modo == "lrf", 0 < pop < 50000, modo == "ic") if time.monotonic() < limite else None
    log(f"Siconfi: {len(pendentes)} pares município-ano a consultar.")
    feitos = erros = adiados = 0
    with ThreadPoolExecutor(TRABALHADORES) as ex:
        fut = {ex.submit(tarefa, *p): p[:2] for p in pendentes}
        for f in as_completed(fut):
            c, a = fut[f]
            try:
                r = f.result()
                if r is None:
                    adiados += 1
                    continue
                for k, v in r.items():
                    ms[c][k][str(a)] = v
            except Exception as e:  # noqa: BLE001
                erros += 1
                if erros <= 5:
                    log(f"Siconfi {c}/{a}: {e}")
            feitos += 1
            if feitos % 1000 == 0:
                log(f"  {feitos}/{len(pendentes)}")
    for m in ms.values():
        for k in chaves:
            m[k] = dict(sorted(m[k].items()))
    log(f"Siconfi: {feitos} pares, {erros} erros, {adiados} adiados para a próxima execução (prazo).")


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


def candidatos(ano: int, mapa: dict[str, int] | None) -> dict:
    """Do cadastro de candidatos: {ibge: identificação do prefeito eleito (nome e data de nascimento)}
    nas eleições municipais, ou {uf: partido do governador eleito} nas eleições gerais."""
    z = zipfile.ZipFile(io.BytesIO(get(TSE_CAND.format(ano), timeout=900).content))
    out: dict = {}
    for uf in UFS:
        nome = next((n for n in z.namelist() if n.endswith(f"_{ano}_{uf}.csv")), None)
        if not nome:
            continue
        with z.open(nome) as f:
            for l in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
                if l.get("CD_TIPO_ELEICAO") != "2" or l.get("DS_SIT_TOT_TURNO", "").upper() != "ELEITO":
                    continue
                if mapa is not None and l["CD_CARGO"] == "11":
                    ibge = mapa.get(l["SG_UE"].zfill(5))
                    if ibge:
                        out[ibge] = " ".join(l.get("NM_CANDIDATO", "").upper().split()) + "|" + re.sub(r"\D", "", l.get("DT_NASCIMENTO", ""))
                elif mapa is None and l["CD_CARGO"] == "3":
                    out[uf] = l["SG_PARTIDO"]
    log(f"TSE candidatos {ano}: {len(out)} registros.")
    return out


def reeleicao_e_governos(ms: dict, antes: dict, gov_antes: dict) -> dict:
    """Marca em ms[c]["reel"][eleição] com 1 os prefeitos reeleitos (a mesma pessoa venceu a eleição
    anterior: começa o segundo mandato) e devolve {uf: {ano da eleição: partido do governador}}.
    O cadastro do TSE não traz mais o campo de candidatura à reeleição; a comparação usa nome e data de nascimento."""
    mapa, eleitos = None, {}
    for ano in ELEICOES:
        a = str(ano)
        ja = {c: m["reel"][a] for c, m in antes.items() if a in m.get("reel", {})}
        if len(ja) > 0.9 * len(ms):
            res = ja
        else:
            try:
                mapa = mapa or tse_ibge()
                for e in (ano - 4, ano):
                    if e not in eleitos:
                        eleitos[e] = candidatos(e, mapa)
                ant, atual = eleitos[ano - 4], eleitos[ano]
                res = {c: int(atual[c] == ant[c]) for c in atual if c in ant}
                log(f"Reeleição {ano}: {sum(res.values())} de {len(res)} prefeitos reeleitos.")
            except Exception as e:  # noqa: BLE001
                log(f"TSE candidatos {ano}: falha ({e})")
                res = ja
        for c, m in ms.items():
            if c in res:
                m.setdefault("reel", {})[a] = res[c]
    gov = {uf: dict(v) for uf, v in gov_antes.items()}
    for ano in GOVERNADORES:
        if all(str(ano) in gov.get(uf, {}) for uf in UFS):
            continue
        try:
            for uf, partido in candidatos(ano, None).items():
                gov.setdefault(uf, {})[str(ano)] = partido
        except Exception as e:  # noqa: BLE001
            log(f"TSE governadores {ano}: falha ({e})")
    return gov


# ---------------------------------------------------------------- emprego, Censo 2022 e saúde
def emprego(ms: dict) -> None:
    """Pessoal ocupado assalariado (Cempre): [total, na agropecuária] por ano."""
    out: dict = {}
    # 117897: total; 116830: seção A da CNAE (agricultura, pecuária, produção florestal, pesca e aquicultura)
    for l in sidra("t/6450/{}/v/708/p/last%208/c12762/117897,116830"):
        if l.get("D4C") not in ("117897", "116830"):
            continue
        x = out.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [0, 0])
        x[0 if l["D4C"] == "117897" else 1] = round(valor(l["V"]) or 0)
    for c, m in ms.items():
        m["emp"] = {a: v for a, v in sorted(out.get(c, {}).items()) if int(a) >= INICIO}


SETORES = ("agro", "industria", "construcao", "comercio", "servicos", "adm_publica")
SECAO_SETOR = {"A": 0, "B": 1, "C": 1, "D": 1, "E": 1, "F": 2, "G": 3, "O": 5}   # as demais seções da CNAE: serviços


def cempre(ms: dict) -> None:
    """Cadastro Central de Empresas (IBGE): cempre[ano] = [empresas e outras organizações, pessoal ocupado total,
    assalariado, salários (R$ mil)] e cempre_set[ano] = pessoal assalariado por setor (SETORES)."""
    tot: dict = {}
    for l in sidra("t/6449/{}/v/all/p/all/c12762/117897"):
        if int(l["D3C"]) < INICIO or "percentual" in l.get("D2N", "").lower():
            continue
        i = next((k for k, txt in enumerate(("número de empresas", "pessoal ocupado total", "pessoal ocupado assalariado", "salários")) if l["D2N"].lower().startswith(txt)), None)
        if i is not None:
            tot.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [None] * 4)[i] = valor(l["V"])
    # códigos das seções da CNAE na classificação 12762 (as categorias cujo nome começa com uma letra e espaço)
    d = get(SIDRA + "t/6450/n1/all/v/708/p/last%201/c12762/all", timeout=240).json()[1:]
    secoes = {l["D4C"]: l["D4N"][0] for l in d if re.match(r"^[A-U] ", l.get("D4N", ""))}
    setor: dict = {}
    for l in sidra("t/6450/{}/v/708/p/all/c12762/" + ",".join(secoes)):
        if int(l["D3C"]) < INICIO or l.get("D4C") not in secoes:
            continue
        x = setor.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [0] * len(SETORES))
        x[SECAO_SETOR.get(secoes[l["D4C"]], 4)] += round(valor(l["V"]) or 0)
    for c, m in ms.items():
        m["cempre"] = {a: v for a, v in sorted(tot.get(c, {}).items())}
        m["cempre_set"] = {a: v for a, v in sorted(setor.get(c, {}).items())}
    log(f"Cempre: {sum(1 for m in ms.values() if m['cempre'])} municípios, {len(secoes)} seções da CNAE.")


def censo(ms: dict, antes: dict) -> None:
    """Censo 2022: [% de domicílios com esgoto pela rede geral ou pluvial, taxa de alfabetização (15 anos ou mais)]."""
    if sum(1 for m in antes.values() if m.get("censo")) > 0.9 * len(ms):
        for c, m in ms.items():
            if antes.get(c, {}).get("censo"):
                m["censo"] = antes[c]["censo"]
        return
    esg: dict = {}
    for l in sidra("t/6805/{}/v/381/p/all/c11558/all"):
        nome = next((l[k] for k in ("D4N", "D5N") if k in l and l[k] and l[k] != "Domicílios particulares permanentes ocupados"), "")
        x = esg.setdefault(int(l["D1C"]), [0, 0])
        if nome == "Total":
            x[1] = valor(l["V"]) or 0
        elif nome.startswith("Rede geral"):
            x[0] += valor(l["V"]) or 0
    alf: dict = {}
    for l in sidra("t/9543/{}/v/all/p/all"):
        if l.get("D2N", "").startswith("Taxa de alfabetização"):
            alf[int(l["D1C"])] = valor(l["V"])
    for c, m in ms.items():
        e = esg.get(c)
        m["censo"] = [round(100 * e[0] / e[1], 1) if e and e[1] else None, alf.get(c)]


def tabnet(sistema: str, uf: str, anos: list[int]) -> dict[str, dict[str, int]]:
    """Consulta o TabNet do DATASUS: {código do município com 6 dígitos: {ano: casos}}."""
    from urllib.parse import quote
    defin = {"sim": f"sim/cnv/inf10{uf.lower()}.def", "sinasc": f"sinasc/cnv/nv{uf.lower()}.def"}[sistema]
    pagina = get(TABNET + "deftohtm.exe?" + defin).content.decode("latin-1")
    opcoes = lambda campo: re.findall(r'<OPTION[^>]*VALUE="([^"]+)"', re.search(rf'NAME="{campo}"(.*?)</SELECT>', pagina, re.S | re.I).group(1), re.I)
    coluna = next(o for o in opcoes("Coluna") if o.startswith("Ano_do"))
    incremento = next(o for o in opcoes("Incremento") if "esid" in o)
    prefixo = "inf" if sistema == "sim" else "nv"
    arquivos = [f"{prefixo}{uf.lower()}{str(a)[2:]}.dbf" for a in anos if f"{prefixo}{uf.lower()}{str(a)[2:]}.dbf" in pagina.lower()]
    q = lambda s: quote(s, encoding="latin-1", safe="")
    corpo = "&".join([f"Linha={q('Município')}", f"Coluna={q(coluna)}", f"Incremento={q(incremento)}"]
                     + [f"Arquivos={a}" for a in arquivos] + [f"{q('SMunicípio')}=TODAS_AS_CATEGORIAS__", "formato=prn", "mostre=Mostra"])
    r = requests.post(TABNET + "tabcgi.exe?" + defin, data=corpo, timeout=300,
                      headers={**H, "Content-Type": "application/x-www-form-urlencoded"})
    texto = r.content.decode("latin-1")
    pre = re.search(r"<PRE>(.*?)</PRE>", texto, re.S | re.I)
    if not pre:
        raise ValueError(f"TabNet {sistema} {uf}: resposta sem tabela")
    linhas = [l.strip() for l in html.unescape(pre.group(1)).strip().splitlines() if l.strip()]   # "Munic&iacute;pio" tem ";"
    cab = [c.strip('"') for c in linhas[0].split(";")]
    out: dict = {}
    for l in linhas[1:]:
        cel = [c.strip().strip('"') for c in l.split(";")]
        m = re.match(r"(\d{6})", cel[0])
        if not m:
            continue
        out[m.group(1)] = {cab[i]: int(cel[i]) if cel[i].isdigit() else 0 for i in range(1, len(cab)) if cab[i].isdigit()}
    return out


def mortalidade(ms: dict, antes: dict) -> None:
    """Óbitos infantis (residência) e nascidos vivos por município e ano: {ano: [óbitos < 1 ano, nascidos vivos]}."""
    fim = date.today().year
    seis = {str(c)[:6]: c for c in ms}
    for c, m in ms.items():
        m["tmi"] = dict(antes.get(c, {}).get("tmi", {}))
    for uf in UFS:
        try:
            anos = list(range(INICIO, fim + 1))
            obitos, nascidos = tabnet("sim", uf, anos), tabnet("sinasc", uf, anos)
        except Exception as e:  # noqa: BLE001
            log(f"TabNet {uf}: falha ({e}); mantidos os dados anteriores.")
            continue
        for cod6, c in seis.items():
            if ms[c]["uf"] != uf:
                continue
            o, n = obitos.get(cod6, {}), nascidos.get(cod6, {})
            for a in sorted(set(n) | set(o)):
                if n.get(a):
                    ms[c]["tmi"][a] = [o.get(a, 0), n[a]]
    log(f"TabNet: {sum(1 for m in ms.values() if m['tmi'])} municípios com mortalidade infantil.")


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
    SAIDA.parent.mkdir(exist_ok=True)
    try:
        ms = municipios()
    except Exception as e:  # noqa: BLE001
        log(f"Municípios: falha ao listar os entes do Siconfi ({e}); mantido o arquivo anterior.")
        return 0
    log(f"{len(ms)} municípios em {len(UFS)} UFs.")
    try:
        gov_antes = json.loads(SAIDA.read_text(encoding="utf-8")).get("gov", {}) if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        gov_antes = {}
    gov = gov_antes
    def governos():
        nonlocal gov
        gov = reeleicao_e_governos(ms, antes, gov_antes)
    def espacial():
        import espaciais
        geo = espaciais.malhas()
        espaciais.grava_malha(geo)
        for nome, f in (("PRODES", lambda: espaciais.prodes(ms, antes, geo)), ("queimadas", lambda: espaciais.focos(ms, antes))):
            try:
                f()
            except Exception as e:  # noqa: BLE001
                log(f"{nome}: falha ({e}); dados anteriores mantidos.")
    etapas = (("população", lambda: populacao(ms)), ("agropecuária", lambda: agro(ms)),
              ("finanças", lambda: financas(ms, antes)), ("eleições", lambda: eleicoes(ms, antes)),
              ("reeleição e governadores", governos), ("emprego", lambda: emprego(ms)), ("Cempre", lambda: cempre(ms)), ("Censo 2022", lambda: censo(ms, antes)),
              ("mortalidade infantil", lambda: mortalidade(ms, antes)), ("dados espaciais", espacial))
    for nome, f in etapas:
        try:
            f()
        except Exception as e:  # noqa: BLE001
            log(f"{nome}: falha ({e}); dados anteriores mantidos.")
    # o que uma etapa não conseguiu atualizar fica como estava no arquivo anterior
    for c, m in ms.items():
        for k in ("pop", "agro", "pib", "fin", "rc", "fn", "lrf", "tr", "ele", "reel", "emp", "cempre", "cempre_set", "censo", "tmi", "desm", "fogo"):
            if not m.get(k) and antes.get(c, {}).get(k):
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
        "fontes": "Tesouro Nacional (Siconfi: DCA, RGF e RREO), TSE (resultados e candidatos), IBGE (Sidra: população, PAM, PPM, PIB dos Municípios, Cempre e Censo 2022), DATASUS (SIM e Sinasc), Inpe (PRODES e queimadas) e Banco Central (IPCA)",
        "unidades": {"fin": "R$ mil correntes: receita líquida, transferências, receita tributária, despesa liquidada, investimento liquidado",
                     "rc": "R$ mil correntes, receitas brutas: " + ", ".join(RC_NOMES),
                     "fn": "R$ mil correntes: despesa liquidada por função (código da função)",
                     "lrf": "RCL (R$ mil), pessoal % RCL, dívida consolidada líquida % RCL, restos a pagar não processados (R$ mil), caixa líquido (R$ mil), resultado primário (R$ mil), meta (R$ mil), % da receita de impostos aplicado em saúde e em manutenção e desenvolvimento do ensino (RREO, Anexo 14)",
                     "agro": "soja, milho e algodão (ha colhidos), valor das três lavouras (R$ mil), bovinos (cabeças)",
                     "pib": "PIB e valor adicionado da agropecuária, da indústria, dos serviços (exceto administração pública) e da administração pública (R$ mil correntes; setores até 2021)",
                     "tr": "R$ mil correntes, repasses recebidos: " + ", ".join(TR_NOMES),
                     "cempre": "Cempre: empresas e outras organizações, pessoal ocupado total, pessoal assalariado, salários (R$ mil)",
                     "cempre_set": "Cempre: pessoal assalariado por setor: " + ", ".join(SETORES),
                     "ele": "partido do vencedor, votos, partido do 2º colocado, votos, votos válidos, turno",
                     "reel": "1 se o prefeito eleito foi reeleito (começa o segundo mandato)",
                     "emp": "pessoal ocupado assalariado: total e na agropecuária (Cempre)",
                     "censo": "% de domicílios com esgoto pela rede geral ou pluvial e taxa de alfabetização (15+), Censo 2022",
                     "tmi": "óbitos de menores de 1 ano e nascidos vivos (residência)",
                     "desm": "desmatamento PRODES (km², ano PRODES de agosto a julho)",
                     "fogo": "focos de queimadas (satélite de referência)"},
        "rc_nomes": list(RC_NOMES),
        "tr_nomes": list(TR_NOMES),
        "setores": list(SETORES),
        "gov": gov,
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
