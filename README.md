# 🥪 EstuLanches

Sistema de gestão de **cardápio e pedidos da cantina escolar**: o aluno vê o cardápio e faz o pedido; a cantina acompanha e atualiza o status (recebido → em preparo → pronto → entregue).

**Stack:** Node.js 22 + Express · PostgreSQL 16 · Docker / Docker Compose · testes com `node:test` + Supertest.

## Subir em produção (Docker)

```bash
cp .env.example .env          # edite POSTGRES_PASSWORD e ADMIN_API_KEY com valores fortes
docker compose up -d --build  # constrói a imagem e sobe app + banco
docker compose ps             # estado dos serviços e portas (db deve estar "healthy")
docker compose logs           # auditoria dos logs de inicialização
```

Acesse **http://localhost:3000** (interface) e **http://localhost:3000/health** (saúde da API + banco).

## Testes

```bash
docker compose up -d db                       # só o banco
docker compose --profile test run --rm tests  # unitários + integração (usa banco separado estulanches_test)
```
Ou localmente: `npm ci && DATABASE_URL=postgres://usuario:senha@localhost:5432/estulanches npm test`

## API

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/health` | público | Saúde da API e do banco |
| GET | `/api/produtos` | público | Lista o cardápio |
| POST | `/api/produtos` | admin | Cria produto |
| PATCH | `/api/produtos/:id/disponibilidade` | admin | Marca disponível/indisponível |
| POST | `/api/pedidos` | público | Cria pedido (total calculado no servidor) |
| GET | `/api/pedidos?status=` | admin | Lista pedidos |
| PATCH | `/api/pedidos/:id/status` | admin | Avança o status (transições validadas) |

Rotas *admin* exigem o cabeçalho `x-api-key: <ADMIN_API_KEY>`.

## Segurança
Container não-root, rootfs somente leitura, `cap_drop: ALL`, banco sem porta publicada, segredos só em `.env` (fora do Git), queries parametrizadas, validação de entrada, total calculado no servidor, rate limit, `helmet` (CSP etc.), corpo limitado a 10 KB, comparação de chave em tempo constante, erros sem stack trace.

## Estrutura
`Dockerfile` · `docker-compose.yml` · `db/banco.sql` · `src/` (API) · `public/` (interface) · `tests/unit` · `tests/integration` · `rdm/` (Ficha RDM)
