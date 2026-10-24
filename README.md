# Finanças Municipais

Painel das finanças públicas dos municípios da **Amazônia Legal** (AC, AM, AP, MA, MT, PA, RO, RR e TO), de **Goiás** e de **Mato Grosso do Sul**, desde 2016, com a orientação ideológica do partido do prefeito e a expansão do agronegócio.

Publicado em: https://cleitonfranco74.github.io/financas_municipais/

## Abas
- **Visão geral:** investimento por habitante, investimento em % da despesa, receita por habitante, receita tributária própria e dependência de transferências, ano a ano, por orientação do prefeito em exercício (2, 5 ou 7 faixas); prefeituras por orientação em cada eleição.
- **Agronegócio:** área colhida de soja, milho e algodão e rebanho bovino; investimento por perfil agropecuário (peso da agropecuária no PIB); cruzamento perfil × orientação; dispersão de municípios com reta de mínimos quadrados e correlação.
- **Municípios:** ranking e ficha de cada município (prefeitos, finanças e lavouras ano a ano).
- **Eleições acirradas:** regressão descontínua (linear local, núcleo triangular, erro-padrão robusto HC1) sobre a margem da esquerda contra a direita, com faixa ajustável e histograma das margens.
- **Método e fontes:** definições e a escala ideológica dos partidos.

## Dados
`data/municipios.json` é gravado por `scripts/atualizar_municipios.py`, que roda toda segunda-feira pela Action `.github/workflows/atualizar.yml` (e pode ser disparado à mão em **Actions → Atualizar finanças municipais → Run workflow**). Fontes públicas, sem chave:
- **Tesouro Nacional, Siconfi:** Declaração de Contas Anuais de cada prefeitura (anexos I-C e I-D): receita líquida, transferências, receita tributária, despesa liquidada e investimento (4.4). O Siconfi é consultado município a município; os anos já gravados são reaproveitados.
- **TSE:** votação por candidato a prefeito nas eleições ordinárias de 2012, 2016, 2020 e 2024 (turno decisivo).
- **IBGE (Sidra):** população (6579 e Censo 2022, 4709), Produção Agrícola Municipal (5457), Pesquisa da Pecuária Municipal (3939) e PIB dos Municípios (5938).
- **Banco Central:** IPCA (SGS 433), para levar os valores a preços constantes.

A escala ideológica (0 = esquerda, 10 = direita) é a média ponderada das pesquisas com especialistas de 2018 e 2022 em Bolognesi, Ribeiro, Codato e Silva (2025), *Opinião Pública*, v. 31; partidos extintos antes de 2022 usam Bolognesi, Ribeiro e Codato (2023), *Dados*, v. 66, n. 2. Fica no dicionário `ESCALA` do script.

## Aviso
Ferramenta educacional. As comparações entre grupos são correlações; a aba de eleições acirradas mostra uma estratégia de identificação causal, com as limitações descritas na própria página.

Desenvolvido por **Prof. Dr. Cleiton Franco** · Doutor em Economia · Professor Adjunto da UNEMAT, Câmpus de Sinop.
