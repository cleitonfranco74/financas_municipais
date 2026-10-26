"""Atualiza data/brasil.json: um painel enxuto com todos os municípios do Brasil, para as abas de recortes por
porte (até 20 mil e até 50 mil habitantes).

Usa as mesmas funções de scripts/atualizar_municipios.py, com todas as UFs (menos o Distrito Federal, que não
tem municípios) e o Siconfi no modo básico: só a Declaração de Contas Anuais (receitas, despesas, investimento,
fontes de receita, repasses e despesa por função), sem RGF e RREO. Os municípios do recorte principal (Amazônia
Legal, GO e MS) vêm de data/municipios.json, sem consultas novas. Cada execução tem um prazo para o Siconfi; a
primeira carga completa (cerca de 4.400 municípios × 10 anos) leva três ou quatro execuções.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import atualizar_municipios as A  # noqa: E402

SAIDA = A.RAIZ / "data" / "brasil.json"
TODAS = {"RO": 11, "AC": 12, "AM": 13, "RR": 14, "PA": 15, "AP": 16, "TO": 17, "MA": 21, "PI": 22, "CE": 23, "RN": 24,
         "PB": 25, "PE": 26, "AL": 27, "SE": 28, "BA": 29, "MG": 31, "ES": 32, "RJ": 33, "SP": 35, "PR": 41, "SC": 42,
         "RS": 43, "MS": 50, "MT": 51, "GO": 52}
REGIAO = {"1": "Norte", "2": "Nordeste", "3": "Sudeste", "4": "Sul", "5": "Centro-Oeste"}
CHAVES = ("pop", "pib", "fin", "rc", "tr", "fn", "ele", "reel")


def pib(ms: dict) -> None:
    """PIB e valor adicionado por setor, últimos 10 anos (para caber no limite do Sidra em MG e SP)."""
    ordem = {"37": 0, "513": 1, "517": 2, "6575": 3, "525": 4}
    out: dict = {}
    for l in A.sidra("t/5938/{}/v/37,513,517,6575,525/p/last%2010"):
        if int(l["D3C"]) >= A.INICIO:
            out.setdefault(int(l["D1C"]), {}).setdefault(l["D3C"], [None] * 5)[ordem[l["D2C"]]] = A.valor(l["V"])
    for c, m in ms.items():
        m["pib"] = dict(sorted(out.get(c, {}).items()))


def main() -> int:
    A.UFS = TODAS
    A.BASICO = True
    A.PRAZO_SICONFI = 200
    A.MAX_PARES = 60000
    SAIDA.parent.mkdir(exist_ok=True)
    try:
        antes = {m["c"]: m for m in json.loads(SAIDA.read_text(encoding="utf-8"))["municipios"]} if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        antes = {}
    principal = A.SAIDA
    rec = {m["c"]: m for m in json.loads(principal.read_text(encoding="utf-8"))["municipios"]} if principal.exists() else {}
    try:
        ms = A.municipios()
    except Exception as e:  # noqa: BLE001
        A.log(f"Brasil: falha ao listar os entes ({e}); mantido o arquivo anterior.")
        return 0
    A.log(f"Brasil: {len(ms)} municípios; {sum(1 for c in ms if c in rec)} já estão no recorte principal.")
    gov_antes = json.loads(SAIDA.read_text(encoding="utf-8")).get("gov", {}) if SAIDA.exists() else {}
    gov = gov_antes
    outros = {c: m for c, m in ms.items() if c not in rec}
    if os.environ.get("BRASIL_AMOSTRA"):   # para testes: só alguns municípios no Siconfi
        outros = dict(list(outros.items())[: int(os.environ["BRASIL_AMOSTRA"])])

    def governos():
        nonlocal gov
        gov = A.reeleicao_e_governos(ms, antes, gov_antes)

    etapas = (("população", lambda: A.populacao(ms)), ("PIB", lambda: pib(ms)),
              ("finanças", lambda: A.financas(outros, antes)), ("eleições", lambda: A.eleicoes(ms, antes)),
              ("reeleição e governadores", governos))
    for nome, f in etapas:
        try:
            f()
        except Exception as e:  # noqa: BLE001
            A.log(f"{nome}: falha ({e}); dados anteriores mantidos.")
    for c, m in ms.items():
        if c in rec:   # o recorte principal já tem tudo, coletado e revisado pela coleta semanal
            for k in ("fin", "rc", "tr", "fn"):
                if rec[c].get(k):
                    m[k] = rec[c][k]
        for k in CHAVES:
            if not m.get(k) and antes.get(c, {}).get(k):
                m[k] = antes[c][k]
        # só saúde (10) e educação (12) da despesa por função, para o arquivo ficar leve
        if m.get("fn"):
            m["fn"] = {a: {f: v for f, v in fs.items() if f in ("10", "12")} for a, fs in m["fn"].items()}
        m.pop("lrf", None)
    try:
        deflator = A.ipca()
    except Exception as e:  # noqa: BLE001
        A.log(f"IPCA: falha ({e})")
        deflator = json.loads(principal.read_text(encoding="utf-8")).get("ipca", {}) if principal.exists() else {}
    com_fin = sum(1 for m in ms.values() if m.get("fin"))
    if com_fin < 0.3 * len(ms):
        A.log(f"Brasil: só {com_fin} municípios com finanças; mantido o arquivo anterior.")
        return 0
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fontes": "Tesouro Nacional (Siconfi, DCA), TSE, IBGE (população e PIB dos Municípios) e Banco Central (IPCA)",
        "rc_nomes": list(A.RC_NOMES), "tr_nomes": list(A.TR_NOMES), "regioes": REGIAO, "gov": gov,
        "eleicoes": list(map(str, A.ELEICOES)), "escala": A.ESCALA, "sinonimos": A.SINONIMOS, "ipca": deflator,
        "recorte": sorted(rec),
        "municipios": [{"c": c, "n": m["n"], "uf": m["uf"], **{k: m[k] for k in CHAVES if m.get(k)}} for c, m in sorted(ms.items())],
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    A.log(f"Brasil: {len(ms)} municípios gravados, {com_fin} com finanças.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
