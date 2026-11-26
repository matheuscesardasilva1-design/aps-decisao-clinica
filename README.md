# APS Decisão Clínica

Aplicação web privada de **apoio rápido à decisão clínica** para consultório de Atenção Primária à Saúde (APS / SUS), construída para operar **100% gratuitamente na nuvem (zero cartão de crédito)** com foco absoluto em **segurança clínica (zero alucinação em fluxogramas)**, privacidade (LGPD + RLS + buckets privados) e velocidade em consultório.

---

## Arquitetura & Segurança Clínica

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Lucide Icons + `next-themes` (Light & Dark Mode).
- **Backend, Banco, Auth e Storage:** Supabase (Free Tier) com `pgvector` + `unaccent` para **Busca Híbrida (FTS Português sem acentos + Busca Semântica RRF)**.
- **Zero Alucinação em Fluxogramas:** Cada página de manual PDF é renderizada a **150 DPI em WebP (82%)** e exibida na tela de consulta em sua forma visual original via **Signed URLs temporárias** (nunca públicas). O `gemini-2.5-flash` atua nos bastidores apenas para indexação de busca e extração *verbatim* de receitas modelo.
- **Automação Semanal:** GitHub Actions executa `scripts/scraper_telessaude.py` toda **segunda e quinta-feira às 03:00 UTC**, mantendo as *Perguntas da Semana* do TelessaúdeRS-UFRGS atualizadas e evitando que o banco gratuito do Supabase pause por inatividade.
- **Controle de Acesso Fechado:** Sem página de registro (`/register` e `/signup` bloqueadas no middleware), RLS ativo em todas as tabelas (`auth.role() = 'authenticated'`), chaves sensíveis (`GEMINI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`) restritas ao servidor e scripts Python.

---

## Passo 1 — Configurar o Supabase (Gratuito, sem cartão)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e crie um novo projeto (região recomendada: **South America / São Paulo**).
2. No menu lateral, abra **SQL Editor → New Query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
   - Isso cria as extensões `vector`, `unaccent`, `pgcrypto`, as 4 tabelas (`manuais`, `manual_paginas`, `perguntas_telessaude`, `sync_logs`), índices HNSW/GIN, a função RPC `buscar_conhecimento_clinico`, todas as políticas **RLS** e os buckets privados `manuais-pdfs` e `paginas-webp`.
3. **Desative o cadastro público:**
   - Vá em **Authentication → Providers → Email** (ou **Sign In / Providers**).
   - Desmarque **Allow new users to sign up** e salve.
4. **Crie seu usuário único:**
   - Vá em **Authentication → Users → Add user → Create new user**.
   - Informe seu e-mail e uma senha forte, marque **Auto Confirm User** e clique em **Create user**.
5. **Copie suas chaves:**
   - Vá em **Project Settings → API** e anote:
     - `Project URL`
     - `anon public` key
     - `service_role` key (mantenha em sigilo absoluto!)

---

## Passo 2 — Configurar Variáveis de Ambiente Locais

Copie o arquivo `.env.example` para `.env.local` (usado pelo Next.js) e também para `.env` (usado pelos scripts Python):

```bash
cp .env.example .env.local
cp .env.example .env
```

Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e sua `GEMINI_API_KEY` já existente.

---

## Passo 3 — Validar o Ambiente com o Healthcheck

Crie um ambiente virtual Python, instale as dependências e rode o diagnóstico:

```bash
python3 -m venv scripts/.venv
source scripts/.venv/bin/activate
pip install -r scripts/requirements.txt

python scripts/healthcheck.py
```

O script valida automaticamente:
1. Conexão com o PostgreSQL do Supabase e a função RPC de busca híbrida.
2. Permissão de upload, geração de Signed URL, leitura e limpeza nos buckets privados `manuais-pdfs` e `paginas-webp`.
3. Resposta válida da `GEMINI_API_KEY` (`gemini-2.5-flash` + `text-embedding-004`).
4. Acesso HTTP 200 à página oficial do TelessaúdeRS-UFRGS.

---

## Passo 4 — Primeira Ingestão do Manual PDF (ex.: 271 páginas)

Para manuais extensos (como o *Manual da APS Adulto v1.5* de 271 páginas), execute a ingestão pelo terminal local. O script possui **pausa de 4s entre chamadas**, **exponential backoff para HTTP 429** e **retomada automática** (se interromper na página 120, basta rodar o mesmo comando novamente que ele continua da 121):

```bash
source scripts/.venv/bin/activate

python scripts/ingest_pdf.py \
  --pdf "/caminho/para/Manual_APS_Adulto_v1.5.pdf" \
  --titulo "Manual da APS Adulto" \
  --categoria "Adulto APS" \
  --versao "v1.5 - Out/2026" \
  --archive-previous
```

Categorias aceitas: `"Adulto APS"`, `"Obstetrícia / Pré-Natal"`, `"REMUME"`, `"Protocolos"`.

Para testar também a primeira carga do TelessaúdeRS-UFRGS:

```bash
python scripts/scraper_telessaude.py --max-pages 1 --max-new 10
```

---

## Passo 5 — Rodar Localmente (Desenvolvimento)

Requer Node.js 18+ ou 20+:

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, faça login com o usuário criado no Supabase e pressione `Ctrl+K` / `Cmd+K` para testar a busca híbrida instantânea.

---

## Passo 6 — Automação Semanal no GitHub Actions (Repositório Privado)

1. Crie um **repositório privado** no GitHub e envie este projeto (`git init && git add . && git commit -m "Initial commit" && git push`).
2. No repositório no GitHub, vá em **Settings → Secrets and variables → Actions → New repository secret** e cadastre exatamente estes 3 secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
3. Em **Actions**, selecione **Sync TelessaúdeRS-UFRGS (Perguntas da Semana)** e clique em **Run workflow** para testar a primeira execução na nuvem. A partir daí, o cron rodará automaticamente às **segundas e quintas-feiras às 03:00 UTC**.

---

## Passo 7 — Publicar Gratuitamente na Nuvem (Zero Cartão)

### Opção A: Netlify (Recomendada — setup em 2 minutos)
1. Acesse [app.netlify.com](https://app.netlify.com) e clique em **Add new site → Import an existing project → GitHub**.
2. Selecione seu repositório privado.
3. Build command: `npm run build` (o Netlify detecta Next.js automaticamente).
4. Em **Environment variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
5. Clique em **Deploy site**.

### Opção B: Cloudflare Pages
1. Acesse **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**.
2. Selecione o repositório privado, escolha o preset **Next.js** e configure as mesmas 5 variáveis de ambiente acima (marcando `GEMINI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` como **Encrypt / Secret**).
3. Clique em **Save and Deploy**.

---

## Boas Práticas LGPD

- Nunca digite nome, CPF, CNS, data de nascimento ou qualquer dado identificável de pacientes na barra de busca ou na síntese com IA.
- A ferramenta foi desenhada exclusivamente para consulta rápida a protocolos clínicos genéricos e notas técnicas oficiais.
