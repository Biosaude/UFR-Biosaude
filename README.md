# UFR — Utilizado, Faturado e Recebido

Dashboard executivo para análise fiel de bases operacionais em Excel. A primeira versão ativa somente o módulo **Utilizado**; os módulos **Faturado** e **Recebido** permanecem explicitamente bloqueados até suas bases serem incluídas.

## Execução

```bash
npm install
npm run dev
```

## Fluxo da base

1. Selecione exclusivamente um arquivo `.xlsx`.
2. A aplicação procura a aba `Utilizado` e lê os registros sem preencher, deduplicar ou alterar células.
3. O relatório de validação informa período, campos vazios, duplicidades, datas e valores inválidos.
4. Os dados somente são aplicados após confirmação explícita.

Toda visualização é calculada no navegador a partir da planilha importada. Indicadores sem uma coluna de origem reconhecida exibem **“Informação não disponível na base de dados”**.

## Estrutura

- `src/services`: importação, normalização técnica e validação da planilha.
- `src/components`: interface, visualizações, importação e estados sem dados.
- `src/types.ts`: contratos compartilhados dos módulos e registros.

O processamento local evita o envio da planilha a serviços externos e mantém a camada de importação separada da apresentação.
