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

O processamento e a validação ocorrem no navegador; somente após a confirmação da atualização a versão validada é enviada ao armazenamento configurado.

## Persistência corporativa

Em produção, configure no projeto Vercel:

- `ufrdabiosaude_READ_WRITE_TOKEN`: token do Vercel Blob Store usado explicitamente pelas rotas para armazenar a versão atual, versões anteriores e auditorias de cada módulo.
A consulta das versões atuais e o fluxo de atualização estão liberados sem identificação ou código de acesso. Cada atualização continua gravando uma versão imutável, um manifesto atual e um registro de auditoria com arquivo, módulo, quantidade de registros, hash e horário. A chave central `AUTH_ENABLED = false` permanece reservada para uma implementação futura, sem interferir no fluxo atual.

Sem `ufrdabiosaude_READ_WRITE_TOKEN`, a API usa memória apenas para leitura em desenvolvimento local, mas atualizações compartilhadas são recusadas com uma mensagem detalhada; esse fallback não deve ser utilizado em produção.

Bases de contingência gravadas anteriormente no IndexedDB continuam legíveis. Novas atualizações somente substituem a base ativa depois que os dois artefatos privados — planilha `.xlsx` original e representação normalizada — forem persistidos com sucesso no Vercel Blob; em caso de falha, a versão anterior permanece intacta.
