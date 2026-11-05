"""Atualiza data/governos.json e os retratos em assets/governos/: indicadores nacionais por ano (1994 em diante)
para comparar os mandatos presidenciais, e os retratos oficiais dos presidentes com autor e licença.

Fontes, públicas e sem chave:
- Banco Mundial (API v2): PIB, PIB por habitante, desemprego (estimativa da OIT), homicídios, Gini, pobreza,
  expectativa de vida, mortalidade infantil, gasto público em saúde e educação, matrículas no ensino superior,
  área de florestas e emissões de gases de efeito estufa;
- Banco Central (SGS): inflação (IPCA), Selic, dólar, salário mínimo, dívida bruta e líquida e resultado primário;
- Wikipédia e Wikimedia Commons: retrato do verbete de cada presidente, com autor e licença.
Se uma fonte falhar, os valores anteriores são mantidos. Roda pela Action .github/workflows/governos.yml.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "data" / "governos.json"
FOTOS = RAIZ / "assets" / "governos"
H = {"User-Agent": "BrasilEmDados/1.0 (painel educacional; github.com/cleitonfranco74/financas_municipais)"}
INICIO = 1994

# pessoas (retrato) e mandatos; o ano fica com quem governou a maior parte dele (2016: Dilma)
PESSOAS = {
    "fhc": ("Fernando Henrique Cardoso", "Fernando_Henrique_Cardoso", "PSDB"),
    "lula": ("Luiz Inácio Lula da Silva", "Luiz_Inácio_Lula_da_Silva", "PT"),
    "dilma": ("Dilma Rousseff", "Dilma_Rousseff", "PT"),
    "temer": ("Michel Temer", "Michel_Temer", "MDB"),
    "bolsonaro": ("Jair Bolsonaro", "Jair_Bolsonaro", "PL"),
}
MANDATOS = [
    ("fhc1", "fhc", "FHC 1", "FHC", 1995, 1998, "1º mandato"), ("fhc2", "fhc", "FHC 2", "FHC", 1999, 2002, "2º mandato"),
    ("lula1", "lula", "Lula 1", "Lula", 2003, 2006, "1º mandato"), ("lula2", "lula", "Lula 2", "Lula", 2007, 2010, "2º mandato"),
    ("dilma1", "dilma", "Dilma 1", "Dilma", 2011, 2014, "1º mandato"), ("dilma2", "dilma", "Dilma 2", "Dilma", 2015, 2016, "2º mandato, interrompido pelo impeachment em 2016"),
    ("temer", "temer", "Temer", "Temer", 2017, 2018, "mandato após o impeachment (assumiu em 2016)"), ("bolsonaro", "bolsonaro", "Bolsonaro", "Bolsonaro", 2019, 2022, "mandato único"),
    ("lula3", "lula", "Lula 3", "Lula", 2023, 2026, "3º mandato, em andamento"),
]

# indicadores: chave, nome, tema, fonte (wb:código | sgs:código), unidade, sentido (+1 maior é melhor, −1 pior, 0 neutro),
# tipo (nivel: compara início e fim; fluxo: compara a média do mandato), tolerância de "estável" por ano, nota
IND = [
    ("pib_cresc", "Crescimento da economia", "Economia", "wb:NY.GDP.MKTP.KD.ZG", "pct", 1, "fluxo", .5, "Variação real do PIB no ano."),
    ("pib_pc", "PIB por habitante", "Economia", "wb:NY.GDP.PCAP.CD", "usd", 1, "nivel", .01, "Em dólares correntes."),
    ("inflacao", "Inflação (IPCA)", "Economia", "sgs:13522", "pct", -1, "fluxo", .5, "IPCA acumulado em 12 meses, em dezembro."),
    ("selic", "Juros básicos (Selic)", "Economia", "sgs:432", "pct", 0, "nivel", .5, "Meta da Selic no fim do ano."),
    ("dolar", "Dólar", "Economia", "sgs:3698", "brl", 0, "nivel", .02, "Média de dezembro, venda."),
    ("desemprego", "Desemprego", "Trabalho e renda", "wb:SL.UEM.TOTL.ZS", "pct", -1, "nivel", .2, "Estimativa da OIT, comparável desde 1991."),
    ("salario_minimo", "Salário mínimo real", "Trabalho e renda", "sgs:1619", "brl", 1, "nivel", .01, "Em dezembro, em reais de hoje (IPCA)."),
    ("divida_bruta", "Dívida bruta do governo", "Contas públicas", "sgs:13762", "pctpib", -1, "nivel", .5, "Governo geral, % do PIB, em dezembro (desde 2006)."),
    ("divida_liquida", "Dívida líquida do setor público", "Contas públicas", "sgs:4513", "pctpib", -1, "nivel", .5, "% do PIB, em dezembro (desde 2001)."),
    ("primario", "Resultado primário", "Contas públicas", "sgs:5793", "pctpib", 1, "fluxo", .3, "Setor público consolidado, % do PIB no ano; positivo é superávit."),
    ("gini", "Desigualdade (Gini)", "Social", "wb:SI.POV.GINI", "gini", -1, "nivel", .003, "De 0 a 1; mais perto de 1, mais desigual."),
    ("pobreza_extrema", "Pobreza extrema", "Social", "wb:SI.POV.DDAY", "pct", -1, "nivel", .2, "Pessoas com menos de US$ 3,00 por dia (PPC de 2021)."),
    ("pobreza", "Pobreza", "Social", "wb:SI.POV.UMIC", "pct", -1, "nivel", .3, "Pessoas com menos de US$ 8,30 por dia (PPC de 2021)."),
    ("expectativa", "Expectativa de vida", "Saúde", "wb:SP.DYN.LE00.IN", "anos", 1, "nivel", .1, "Ao nascer, em anos."),
    ("mort_infantil", "Mortalidade infantil", "Saúde", "wb:SP.DYN.IMRT.IN", "pormil", -1, "nivel", .2, "Por mil nascidos vivos."),
    ("gasto_saude", "Gasto público em saúde", "Saúde", "wb:SH.XPD.GHED.GD.ZS", "pctpib", 1, "nivel", .05, "Governo geral, % do PIB."),
    ("gasto_educ", "Gasto público em educação", "Educação", "wb:SE.XPD.TOTL.GD.ZS", "pctpib", 1, "nivel", .05, "Governo geral, % do PIB."),
    ("ensino_superior", "Matrículas no ensino superior", "Educação", "wb:SE.TER.ENRR", "pct", 1, "nivel", .5, "Taxa bruta de matrícula (desde 2012)."),
    ("homicidios", "Homicídios", "Segurança", "wb:VC.IHR.PSRC.P5", "por100mil", -1, "nivel", .3, "Por 100 mil habitantes."),
    ("floresta", "Área de florestas", "Meio ambiente", "wb:AG.LND.FRST.ZS", "pct", 1, "nivel", .05, "% do território."),
    ("emissoes", "Emissões de gases de efeito estufa", "Meio ambiente", "wb:EN.GHG.ALL.MT.CE.AR5", "mt", -1, "nivel", .01, "Milhões de toneladas de CO2 equivalente, sem mudança do uso da terra."),
]
FONTES = {"wb": "Banco Mundial (World Development Indicators)", "sgs": "Banco Central do Brasil (SGS)"}
URL = {"wb": "https://data.worldbank.org/indicator/{}?locations=BR", "sgs": "https://www3.bcb.gov.br/sgspub/consultarvalores/telaCvsSelecionarSeries.paint?codigoSerie={}"}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def get(url: str, params: dict | None = None, timeout: int = 90):
    for t in range(4):
        try:
            r = requests.get(url, params=params, headers=H, timeout=timeout)
            r.raise_for_status()
            return r
        except Exception:  # noqa: BLE001
            if t == 3:
                raise
            time.sleep(2 ** (t + 1))


def banco_mundial(cod: str) -> dict[str, float]:
    js = get(f"https://api.worldbank.org/v2/country/BRA/indicator/{cod}", {"format": "json", "per_page": 100, "date": f"{INICIO}:{date.today().year}"}).json()
    return {x["date"]: round(float(x["value"]), 4) for x in js[1] or [] if x["value"] is not None}


def sgs(cod: str) -> tuple[dict[str, float], dict[str, str]]:
    """Último valor de cada ano (dezembro ou o mais recente) e o mês desse valor, para marcar ano parcial.
    O SGS limita séries diárias a 10 anos por consulta: pede em janelas."""
    out, mes = {}, {}
    for a0 in range(INICIO, date.today().year + 1, 10):
        a1 = min(a0 + 9, date.today().year)
        d = get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{cod}/dados", {"formato": "json", "dataInicial": f"01/01/{a0}", "dataFinal": f"31/12/{a1}"}).json()
        for l in d:
            dia, m, a = l["data"].split("/")
            try:
                out[a] = float(l["valor"]); mes[a] = f"{a}-{m}"
            except (TypeError, ValueError):
                pass
    return out, mes


def precos() -> dict[str, float]:
    """Índice de preços de dezembro de cada ano (IPCA, SGS 433), para levar o salário mínimo a reais de hoje."""
    d = get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados", {"formato": "json", "dataInicial": f"01/01/{INICIO}"}).json()
    idx, out = 100.0, {}
    for l in d:
        idx *= 1 + float(l["valor"]) / 100
        out[l["data"][-4:]] = idx
    return out


def retratos(antes: dict) -> dict:
    FOTOS.mkdir(parents=True, exist_ok=True)
    out = {}
    for k, (nome, verbete, _) in PESSOAS.items():
        try:
            p = list(get("https://pt.wikipedia.org/w/api.php", {"action": "query", "titles": verbete, "prop": "pageimages", "piprop": "name", "format": "json"}).json()["query"]["pages"].values())[0]
            arq = p["pageimage"]
            ii = list(get("https://commons.wikimedia.org/w/api.php", {"action": "query", "titles": "File:" + arq, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 400, "format": "json"}).json()["query"]["pages"].values())[0]["imageinfo"][0]
            m = ii.get("extmetadata", {})
            import re
            limpa = lambda s: re.sub(r"<[^>]+>", "", s or "").strip()
            img = get(ii.get("thumburl") or ii["url"]).content
            (FOTOS / f"{k}.jpg").write_bytes(img)
            out[k] = {"arquivo": f"assets/governos/{k}.jpg", "autor": limpa(m.get("Artist", {}).get("value")) or "Wikimedia Commons",
                      "licenca": limpa(m.get("LicenseShortName", {}).get("value")), "origem": ii.get("descriptionurl")}
            log(f"Retrato {k}: {arq} ({out[k]['autor']}, {out[k]['licenca']})")
        except Exception as e:  # noqa: BLE001
            log(f"Retrato {k}: falhou ({e})")
            if antes.get(k):
                out[k] = antes[k]
    return out


def main() -> int:
    try:
        antes = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        antes = {}
    ant_ind = {i["k"]: i for i in antes.get("indicadores", [])}
    try:
        P = precos()
    except Exception as e:  # noqa: BLE001
        log(f"IPCA (433): falhou ({e})"); P = {}
    ult = max(P) if P else None
    indicadores = []
    for k, n, tema, fonte, unid, mais, tipo, tol, nota in IND:
        org, cod = fonte.split(":")
        try:
            if org == "wb":
                v, parc = banco_mundial(cod), {}
            else:
                v, mes = sgs(cod)
                parc = {a: m for a, m in mes.items() if not m.endswith("-12")}
                if k == "salario_minimo":
                    v = {a: round(x * P[ult] / P[a], 2) for a, x in v.items() if a in P}
                if k == "primario":
                    v = {a: round(-x, 2) for a, x in v.items()}   # o SGS traz a necessidade de financiamento: positivo é déficit
                if k == "gini":
                    pass
            if k == "gini":
                v = {a: round(x / 100, 3) for a, x in v.items()}
            v = {a: x for a, x in v.items() if int(a) >= INICIO}
            log(f"{k}: {len(v)} anos, {min(v) if v else '-'}–{max(v) if v else '-'}")
        except Exception as e:  # noqa: BLE001
            log(f"{k}: falhou ({e})")
            v, parc = ant_ind.get(k, {}).get("v", {}), ant_ind.get(k, {}).get("parcial", {})
        if not v:
            continue
        indicadores.append({"k": k, "n": n, "tema": tema, "unid": unid, "mais": mais, "tipo": tipo, "tol": tol, "nota": nota,
                            "fonte": FONTES[org], "url": URL[org].format(cod), "v": dict(sorted(v.items())), "parcial": parc})
    if len(indicadores) < 10:
        log("Poucos indicadores: arquivo mantido.")
        return 0
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "pessoas": {k: {"nome": n, "partido": p} for k, (n, _, p) in PESSOAS.items()},
        "mandatos": [{"id": i, "pessoa": p, "rot": r, "curto": c, "de": de, "ate": ate, "obs": o} for i, p, r, c, de, ate, o in MANDATOS],
        "retratos": retratos(antes.get("retratos", {})),
        "indicadores": indicadores,
    }
    SAIDA.parent.mkdir(exist_ok=True)
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"Gravado {SAIDA}: {len(indicadores)} indicadores.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
