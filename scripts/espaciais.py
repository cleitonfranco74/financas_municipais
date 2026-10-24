"""Dados espaciais para data/municipios.json e data/malha.json, chamados por atualizar_municipios.py.

- Malha municipal (GeoJSON do projeto geodata-br, com os códigos do IBGE): serve para atribuir os
  polígonos de desmatamento aos municípios e, simplificada, para o mapa da página (data/malha.json).
- PRODES (Inpe, TerraBrasilis): polígonos de desmatamento anual da Amazônia Legal e do Cerrado,
  baixados pelo WFS a partir de 2016. Cada polígono vai para o município que contém o seu ponto
  representativo; a área (km²) é somada por município e ano PRODES (agosto a julho).
- Focos de queimadas (Inpe, satélite de referência): arquivos anuais com estado e município; a
  contagem por município casa o nome normalizado com o cadastro do Siconfi.
Os anos já fechados são reaproveitados do arquivo anterior.
"""
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
import zipfile
from datetime import date

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from atualizar_municipios import INICIO, RAIZ, UFS, get, log

MALHA_UF = "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-{}-mun.json"
WFS = "https://terrabrasilis.dpi.inpe.br/geoserver/ows"
CAMADAS = ("prodes-legal-amz:yearly_deforestation", "prodes-cerrado-nb:yearly_deforestation")
FOCOS = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/anual/Brasil_sat_ref/focos_br_ref_{}.zip"
NOMES_UF = {"ACRE": "AC", "AMAZONAS": "AM", "AMAPA": "AP", "MARANHAO": "MA", "MATO GROSSO": "MT", "PARA": "PA",
            "RONDONIA": "RO", "RORAIMA": "RR", "TOCANTINS": "TO", "GOIAS": "GO", "MATO GROSSO DO SUL": "MS"}
POR_PAGINA = 20000


def normaliza(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    return " ".join(re.sub(r"[^A-Z ]", " ", s).split())


def malhas() -> dict[int, object]:
    geo = {}
    for cod in UFS.values():
        for f in get(MALHA_UF.format(cod), timeout=180).json()["features"]:
            geo[int(f["properties"]["id"])] = shape(f["geometry"])
    log(f"Malha: {len(geo)} municípios.")
    return geo


def grava_malha(geo: dict) -> None:
    """Malha simplificada (tolerância de ~1 km) com coordenadas de 3 casas: {código: [[x, y, x, y, ...], ...]}."""
    out = {}
    for c, g in geo.items():
        s = g.simplify(0.01, preserve_topology=True)
        partes = list(s.geoms) if s.geom_type == "MultiPolygon" else [s]
        aneis = []
        for p in sorted(partes, key=lambda p: -p.area)[:6]:
            xy = [round(v, 3) for pt in p.exterior.coords for v in pt]
            if len(xy) >= 6:
                aneis.append(xy)
        out[str(c)] = aneis
    (RAIZ / "data" / "malha.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    log(f"Malha simplificada gravada ({len(out)} municípios).")


def _ponto(geom: dict) -> tuple[float, float] | None:
    """Média dos vértices do anel externo do primeiro polígono, já em (longitude, latitude)."""
    cs = geom.get("coordinates")
    if not cs:
        return None
    anel = cs[0][0] if geom["type"] == "MultiPolygon" else cs[0]
    x = sum(p[0] for p in anel) / len(anel)
    y = sum(p[1] for p in anel) / len(anel)
    if -35 <= x <= 7 and y < -33:        # veio como (latitude, longitude)
        x, y = y, x
    return x, y


def prodes(ms: dict, antes: dict, geo: dict) -> None:
    """Desmatamento PRODES (km²) por município e ano: m["desm"][ano]."""
    ultimo_antes = max((int(a) for m in antes.values() for a in m.get("desm", {})), default=0)
    for c, m in ms.items():
        m["desm"] = dict(antes.get(c, {}).get("desm", {}))
    desde = INICIO if not ultimo_antes else ultimo_antes   # refaz o último ano (o PRODES revisa a taxa)
    codigos = list(geo)
    arvore = STRtree([geo[c] for c in codigos])
    soma: dict = {}
    for camada in CAMADAS:
        inicio, total = 0, 0
        while True:
            r = get(WFS, {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": camada,
                          "outputFormat": "application/json", "propertyName": "year,area_km,geom", "srsName": "EPSG:4326",
                          "CQL_FILTER": f"year>={desde}", "count": POR_PAGINA, "startIndex": inicio, "sortBy": "fid"}, timeout=600)
            feats = r.json().get("features", [])
            for f in feats:
                pr = f.get("properties") or {}
                pt = _ponto(f.get("geometry") or {})
                if not pt or pr.get("year") is None:
                    continue
                p = Point(pt)
                for i in arvore.query(p):
                    if geo[codigos[i]].contains(p):
                        k = (codigos[i], str(pr["year"]))
                        soma[k] = soma.get(k, 0) + (pr.get("area_km") or 0)
                        break
            total += len(feats)
            if len(feats) < POR_PAGINA:
                break
            inicio += POR_PAGINA
        log(f"PRODES {camada}: {total} polígonos desde {desde}.")
    anos = {a for _, a in soma}
    for c, m in ms.items():
        for a in anos:
            m["desm"][a] = round(soma.get((c, a), 0), 2)
        m["desm"] = dict(sorted(m["desm"].items()))


def focos(ms: dict, antes: dict) -> None:
    """Focos de queimadas (satélite de referência) por município e ano: m["fogo"][ano]."""
    hoje = date.today().year
    indice = {(m["uf"], normaliza(m["n"])): c for c, m in ms.items()}
    for c, m in ms.items():
        m["fogo"] = {a: v for a, v in antes.get(c, {}).get("fogo", {}).items() if int(a) < hoje - 1}
    feitos = {a for m in ms.values() for a in m["fogo"]}
    for ano in range(INICIO, hoje + 1):
        if str(ano) in feitos:
            continue
        try:
            z = zipfile.ZipFile(io.BytesIO(get(FOCOS.format(ano), timeout=600).content))
        except Exception as e:  # noqa: BLE001
            log(f"Focos {ano}: indisponível ({e})")
            continue
        cont, fora = {}, 0
        with z.open(z.namelist()[0]) as f:
            for l in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace")):
                uf = NOMES_UF.get(normaliza(l.get("estado", "")))
                if not uf:
                    continue
                c = indice.get((uf, normaliza(l.get("municipio", ""))))
                if c is None:
                    fora += 1
                    continue
                cont[c] = cont.get(c, 0) + 1
        for c, m in ms.items():
            m["fogo"][str(ano)] = cont.get(c, 0)
        log(f"Focos {ano}: {sum(cont.values())} focos nos municípios do recorte ({fora} sem município casado).")
    for m in ms.values():
        m["fogo"] = dict(sorted(m["fogo"].items()))
