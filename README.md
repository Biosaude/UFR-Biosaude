# UFR — Utilizado, Faturado e Recebido

Dashboard executivo para análise fiel de bases operacionais em Excel. A primeira versão ativa somente o módulo **Utilizado**; os módulos **Faturado** e **Recebido** permanecem explicitamente bloqueados até suas bases serem incluídas.

## Execução

```bash
npm install
npm run dev
```

Para validar a compilação localmente:

```bash
npm run typecheck
npm run build
```

## Implantação na Vercel

O repositório inclui `vercel.json` com o framework Vite, o diretório de saída
`dist` e fallback de rotas para `index.html`. As dependências possuem versões
fixas para que GitHub, Codex e Vercel instalem exatamente a mesma combinação.

Na Vercel, mantenha o **Root Directory** na raiz do repositório e utilize a
versão **20.x ou 22.x** do Node.js. O comando de implantação é `npm run build`.

O build de produção utiliza o transpilador do Vite. A verificação estática do
TypeScript permanece disponível separadamente em `npm run typecheck`, evitando
que diferenças entre tipos de bibliotecas de visualização interrompam a entrega
de um bundle que o Vite consegue compilar corretamente.

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
