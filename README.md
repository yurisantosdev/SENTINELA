# SENTINELA

Robô local para capturar documentos CSV/XLS/XLSX/ZIP de datasets públicos, importar os dados para MongoDB e acompanhar a execução por uma interface Next.js.

## Estrutura

- `backend/`: pacote `@sentinela/api` com API FastAPI e robô Python de importação.
- `frontend/`: pacote `@sentinela/web` com painel Next.js + TypeScript.
- `turbo.json`: pipeline Turborepo para rodar backend e frontend juntos.
- `docker-compose.yml`: MongoDB local exposto em `localhost:27017`.

## Configuração inicial

```bash
npm run setup
```

Esse comando instala as dependências npm dos workspaces e prepara o `.venv` do backend Python.

Depois, copie os arquivos de ambiente:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

## Rodar o projeto

```bash
npm run dev
```

Esse comando sobe o MongoDB via Docker Compose e executa, pelo Turborepo, os dois serviços em paralelo:

- API em `http://localhost:8000`
- Painel em `http://localhost:3000`

O banco usado pela aplicação é `sentinela` e a coleção padrão é `cat_comunicacoes`.

## Comandos úteis

```bash
npm run build
npm run typecheck
```

## Como usar

1. Abra o painel.
2. Clique em `Iniciar robô`.

O robô sempre usa o dataset oficial CAT configurado em `SENTINELA_DATASET_URL`, apaga os dados atuais da coleção `cat_comunicacoes`, baixa todos os recursos da lista do dataset, processa arquivos `CSV`, `XLS`, `XLSX` ou `ZIP`, grava tudo novamente no MongoDB e remove os arquivos temporários baixados.