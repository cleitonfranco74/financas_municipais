"""Atualiza data/estados.json: contas da União e dos 27 governos estaduais (incluindo o Distrito Federal),
com o PIB e a população de cada estado, para a aba Gasto público.

Fontes, públicas e sem chave:
- Tesouro Nacional, Siconfi: Declaração de Contas Anuais (DCA) de cada ente: receita, despesa liquidada,
  investimento (anexos I-C e I-D), despesa por natureza (pessoal, juros, custeio, investimentos, inversões e
  amortização, anexo I-D) e despesa por função (anexo I-E). Usa as mesmas funções da coleta dos municípios
  (scripts/atualizar_municipios.py), no modo básico (sem RGF e RREO).
- IBGE (Sidra): PIB dos estados e do Brasil (tabela 5938) e população estimada (6579).
Os anos já gravados são reaproveitados; só se consultam os que faltam e os dois últimos (retificações).
Roda pela GitHub Action em .github/workflows/estados.yml.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import atualizar_municipios as A  # noqa: E402

SAIDA = A.RAIZ / "data" / "estados.json"
SIGLAS = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB",
          26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS",
          51: "MT", 52: "GO", 53: "DF"}   # o Siconfi traz "BR" no campo uf dos estados
CHAVES = ("fin", "nat", "fn")


def entes() -> dict[int, dict]:
    """União (código 1) e os 27 estados (códigos do IBGE de 11 a 53), pela lista de entes do Siconfi."""
    out = {}
    for e in A.get(A.SICONFI + "entes").json()["items"]:
        c = e.get("cod_ibge")
        if e.get("esfera") == "U" or (e.get("esfera") in ("E", "D") and c and int(c) < 100):
            c = 1 if e.get("esfera") == "U" else int(c)
            out[c] = {"c": c, "n": e.get("ente"), "uf": "BR" if c == 1 else SIGLAS.get(c, e.get("uf")), "esfera": "U" if c == 1 else "E"}
    return out


def sidra_n(caminho: str) -> list[dict]:
    return A.get(A.SIDRA + caminho, timeout=240).json()[1:]


def ibge(es: dict) -> None:
    """PIB (R$ mil correntes) e população dos estados; para a União, os do Brasil."""
    for nivel, f in (("n3/all", lambda l: int(l["D1C"])), ("n1/all", lambda l: 1)):
        for l in sidra_n(f"t/5938/{nivel}/v/37/p/all"):
            if (v := A.valor(l["V"])) is not None and int(l["D3C"]) >= A.INICIO and f(l) in es:
                es[f(l)].setdefault("pib", {})[l["D3C"]] = v
        for l in sidra_n(f"t/6579/{nivel}/v/9324/p/all"):
            if (v := A.valor(l["V"])) is not None and int(l["D3C"]) >= A.INICIO and f(l) in es:
                es[f(l)].setdefault("pop", {})[l["D3C"]] = v
    for m in es.values():   # anos sem estimativa (Censo 2022, ano corrente): repete o vizinho mais próximo
        pop = m.get("pop", {})
        if pop:
            anos = sorted(map(int, pop))
            for a in range(A.INICIO, date.today().year + 1):
                if str(a) not in pop:
                    viz = min(anos, key=lambda x: abs(x - a))
                    pop[str(a)] = pop[str(viz)]
            m["pop"] = {a: round(v) for a, v in sorted(pop.items())}
        if m.get("pib"):
            m["pib"] = dict(sorted(m["pib"].items()))


def contas(es: dict, antes: dict) -> None:
    fim = date.today().year - 1
    for c, m in es.items():
        for k in CHAVES:
            m[k] = {a: v for a, v in antes.get(c, {}).get(k, {}).items() if v}
        for a in range(A.INICIO, fim + 1):
            if str(a) in m["fin"] and str(a) in m["nat"] and a < fim - 1:
                continue
            try:
                r = A.siconfi(c, a)
                for k in CHAVES:
                    if r.get(k):
                        m[k][str(a)] = r[k]
            except Exception as e:  # noqa: BLE001
                A.log(f"Siconfi {m['uf']}/{a}: {e}")
        for k in CHAVES:
            m[k] = dict(sorted(m[k].items()))
        A.log(f"{m['uf']}: contas de {', '.join(m['fin']) or 'nenhum ano'}")


def main() -> int:
    A.BASICO = True
    SAIDA.parent.mkdir(exist_ok=True)
    try:
        antes = {m["c"]: m for m in json.loads(SAIDA.read_text(encoding="utf-8"))["entes"]} if SAIDA.exists() else {}
    except Exception:  # noqa: BLE001
        antes = {}
    try:
        es = entes()
    except Exception as e:  # noqa: BLE001
        A.log(f"Estados: falha ao listar os entes ({e}); mantido o arquivo anterior.")
        return 0
    A.log(f"Estados: {len(es)} entes ({sum(1 for m in es.values() if m['esfera'] == 'E')} estados e a União).")
    for nome, f in (("IBGE", lambda: ibge(es)), ("Siconfi", lambda: contas(es, antes))):
        try:
            f()
        except Exception as e:  # noqa: BLE001
            A.log(f"{nome}: falha ({e}); dados anteriores mantidos.")
    for c, m in es.items():
        for k in ("pop", "pib", *CHAVES):
            if not m.get(k) and antes.get(c, {}).get(k):
                m[k] = antes[c][k]
    com_fin = sum(1 for m in es.values() if m.get("fin"))
    if com_fin < 20:
        A.log(f"Estados: só {com_fin} entes com contas; mantido o arquivo anterior.")
        return 0
    try:
        deflator = A.ipca()
    except Exception as e:  # noqa: BLE001
        A.log(f"IPCA: falha ({e})")
        deflator = json.loads(A.SAIDA.read_text(encoding="utf-8")).get("ipca", {}) if A.SAIDA.exists() else {}
    saida = {
        "atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fontes": "Tesouro Nacional (Siconfi, DCA da União e dos estados), IBGE (PIB dos estados e população) e Banco Central (IPCA)",
        "unidades": {"fin": "R$ mil correntes: receita líquida, transferências, receita tributária, despesa liquidada, investimento liquidado",
                     "nat": "R$ mil correntes, despesa liquidada por natureza: " + ", ".join(A.NAT_NOMES),
                     "fn": "R$ mil correntes: despesa liquidada por função (código da função)",
                     "pib": "R$ mil correntes", "pop": "habitantes"},
        "nat_nomes": list(A.NAT_NOMES), "ipca": deflator,
        "entes": [{k: m[k] for k in ("c", "n", "uf", "esfera", "pop", "pib", *CHAVES) if m.get(k) is not None}
                  for _, m in sorted(es.items())],
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    A.log(f"Estados: {len(es)} entes gravados, {com_fin} com contas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
