# UFR — Utilizado, Faturado e Recebido

Dashboard executivo para análise fiel de bases operacionais em Excel, com visualização pública em `/dashboard` e administração autenticada em `/admin` dentro do mesmo projeto Vercel.

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

O repositório inclui `vercel.json` com o framework Vite e o diretório de saída
`dist`. As dependências possuem versões fixas para que GitHub, Codex e Vercel
instalem exatamente a mesma combinação.

Na Vercel, mantenha o **Root Directory** na raiz do repositório e utilize a
versão **20.x ou 22.x** do Node.js. O comando de implantação é `npm run build`.

O build de produção utiliza o transpilador do Vite. A verificação estática do
TypeScript permanece disponível separadamente em `npm run typecheck`, evitando
que diferenças entre tipos de bibliotecas de visualização interrompam a entrega
de um bundle que o Vite consegue compilar corretamente.

## Rotas e persistência

- `/dashboard`: consulta pública das versões publicadas, sem controles administrativos.
- `/login`: autenticação persistente do administrador pelo Supabase Auth.
- `/admin`: dashboard completo, importação em lotes, validação, publicação, histórico e restauração.

Copie `.env.example` para a configuração local e configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` também nos ambientes Development, Preview e Production da Vercel. A chave publicável alimenta o Supabase Auth; a chave secreta é utilizada exclusivamente no servidor e nunca é devolvida ao navegador. As variáveis legadas `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` permanecem aceitas temporariamente. Execute `supabase/migrations/001_persistent_imports.sql` no projeto Supabase e associe o único usuário administrativo conforme a instrução ao fim da migration.

## Fluxo da base

1. Selecione exclusivamente um arquivo `.xlsx`.
2. A aplicação procura a aba `Utilizado` e lê os registros sem preencher, deduplicar ou alterar células.
3. O relatório de validação informa período, campos vazios, duplicidades, datas e valores inválidos.
4. Os dados são enviados em lotes idempotentes para uma nova versão temporária.
5. A versão só pode ser publicada depois da validação dos registros gravados; a versão ativa anterior é preservada em qualquer falha.

Toda visualização é calculada no navegador a partir da planilha importada. Indicadores sem uma coluna de origem reconhecida exibem **“Informação não disponível na base de dados”**.

## Estrutura

- `src/services`: importação, normalização técnica e validação da planilha.
- `src/components`: interface, visualizações, importação e estados sem dados.
- `src/types.ts`: contratos compartilhados dos módulos e registros.

O Excel é lido e validado no navegador sem alterar células. Os registros confirmados são persistidos em tabelas independentes no Supabase PostgreSQL. As APIs públicas retornam somente versões ativas e as APIs de mutação verificam no servidor tanto a sessão Supabase quanto o perfil administrativo.

Para respeitar o limite do plano Hobby da Vercel, todas as operações HTTP são
despachadas pela única função Serverless `api/index.js`. O parâmetro `scope`
separa autenticação, administração e consulta pública; os manipuladores e o
cliente privilegiado do Supabase permanecem fora de `api/` e não criam rotas
Serverless adicionais.
