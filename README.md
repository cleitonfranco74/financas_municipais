# Finanças Municipais

Painel das finanças públicas dos municípios da **Amazônia Legal** (AC, AM, AP, MA, MT, PA, RO, RR e TO), de **Goiás** e de **Mato Grosso do Sul**, desde 2016, com a orientação ideológica do partido do prefeito e a expansão do agronegócio.

Publicado em: https://cleitonfranco74.github.io/financas_municipais/

## Abas
- **Visão geral:** investimento por habitante, investimento em % da despesa, receita por habitante, receita tributária própria e dependência de transferências, ano a ano, por orientação do prefeito em exercício (2, 5 ou 7 faixas); prefeituras por orientação em cada eleição.
- **Finanças públicas:** gasto por função (saúde, educação, urbanismo etc.) por orientação do prefeito; composição da despesa; mínimos de saúde (15%) e educação (25%), por aproximação; despesa com pessoal na LRF (alerta, prudencial e máximo), resultado primário e meta, caixa e dívida; fontes de receita (FPM, ICMS, impostos próprios, royalties, transferências voluntárias); índice de saúde fiscal de 0 a 1.
- **Economia política:** ciclo político-orçamentário dentro do mandato, prefeitos de primeiro × segundo mandato, alinhamento com o partido do governador e do presidente (transferências voluntárias) e painel com efeitos fixos de município e ano (erros agrupados por município).
- **Agronegócio:** área colhida de soja, milho e algodão e rebanho bovino; investimento por perfil agropecuário (peso da agropecuária no PIB); cruzamento perfil × orientação; dispersão de municípios com reta de mínimos quadrados e correlação.
- **Amazônia:** desmatamento PRODES e focos de queimadas por orientação do prefeito, emprego formal na agropecuária, dispersão agro × ambiente e lista dos municípios que mais desmataram.
- **Resultados:** mortalidade infantil por orientação do prefeito, esgoto e alfabetização (Censo 2022) e dispersão gasto × resultado.
- **Mapa:** mapa coroplético dos municípios (orientação, investimento, pessoal, saúde fiscal, agro, desmatamento, mortalidade, esgoto).
- **Municípios:** ranking, ficha de cada município, comparador de até quatro municípios e download do painel município-ano em CSV (Excel ou R/Stata/Python).
- **Eleições acirradas:** regressão descontínua (linear local, núcleo triangular, erro-padrão robusto HC1) sobre a margem da esquerda contra a direita ou do partido do governador contra outro partido, com faixa ajustável e histograma das margens.
- **Método e fontes:** definições e a escala ideológica dos partidos.

## Dados
`data/municipios.json` e `data/malha.json` são gravados por `scripts/atualizar_municipios.py`, que roda toda segunda-feira pela Action `.github/workflows/atualizar.yml` (e pode ser disparado à mão em **Actions → Atualizar finanças municipais → Run workflow**). Fontes públicas, sem chave:
- **Tesouro Nacional, Siconfi:** Declaração de Contas Anuais de cada prefeitura (anexos I-C, I-D e I-E): receitas por fonte, despesa liquidada, investimento (4.4) e despesa por função; RGF (Anexo 6) e RREO (Anexo 14): RCL, pessoal, dívida, restos a pagar, caixa e resultado primário. O Siconfi é consultado município a município; os anos já gravados são reaproveitados, e cada execução tem um prazo (a primeira carga completa leva duas ou três execuções).
- **TSE:** votação por candidato a prefeito nas eleições ordinárias de 2012, 2016, 2020 e 2024 (turno decisivo); cadastro de candidatos para identificar prefeitos reeleitos e o partido dos governadores eleitos em 2014, 2018 e 2022.
- **IBGE (Sidra):** população (6579 e Censo 2022, 4709), Produção Agrícola Municipal (5457), Pesquisa da Pecuária Municipal (3939) e PIB dos Municípios (5938), Cadastro Central de Empresas (6450) e Censo 2022 (6805 e 9543).
- **DATASUS (TabNet):** óbitos infantis (SIM) e nascidos vivos (Sinasc), por residência.
- **Inpe:** PRODES Amazônia e Cerrado (TerraBrasilis, WFS) e focos de queimadas do satélite de referência.
- **Malha municipal:** GeoJSON do projeto geodata-br (códigos do IBGE), simplificada para o mapa.
- **Banco Central:** IPCA (SGS 433), para levar os valores a preços constantes.

A escala ideológica (0 = esquerda, 10 = direita) é a média ponderada das pesquisas com especialistas de 2018 e 2022 em Bolognesi, Ribeiro, Codato e Silva (2025), *Opinião Pública*, v. 31; partidos extintos antes de 2022 usam Bolognesi, Ribeiro e Codato (2023), *Dados*, v. 66, n. 2. Fica no dicionário `ESCALA` do script.

## Aviso
Ferramenta educacional. As comparações entre grupos são correlações; a aba de eleições acirradas mostra uma estratégia de identificação causal, com as limitações descritas na própria página.

Desenvolvido por **Prof. Dr. Cleiton Franco** · Doutor em Economia · Professor Adjunto da UNEMAT, Câmpus de Sinop.
