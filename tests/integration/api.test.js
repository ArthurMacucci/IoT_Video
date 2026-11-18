// Testes de integração: API (Express) + banco PostgreSQL REAL.
// Requer DATABASE_URL apontando para um banco de teste (no compose: serviço "tests").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { Pool } = require('pg');
const { createApp } = require('../../src/app');

const BASE_URL = process.env.DATABASE_URL;
const CHAVE = 'chave-de-teste-123';

// SEGURANÇA: os testes NUNCA tocam o banco de produção. Usam um banco irmão chamado "<nome>_test",
// criado automaticamente. Há uma trava extra que aborta se o nome do banco não terminar em "_test".
function urlDeTeste(base) {
  const u = new URL(base);
  const nome = u.pathname.replace('/', '').replace(/_test$/, '') + '_test';
  u.pathname = '/' + nome;
  return { url: u.toString(), nome };
}
let pool;
let app;
const admin = (r) => r.set('x-api-key', CHAVE);

test.before(async () => {
  assert.ok(BASE_URL, 'Defina DATABASE_URL para rodar os testes de integração');
  const { url, nome } = urlDeTeste(BASE_URL);
  assert.ok(nome.endsWith('_test'), 'trava de segurança: banco de teste deve terminar em _test');
  const adminPool = new Pool({ connectionString: BASE_URL, max: 1 });
  const existe = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
  if (!existe.rowCount) await adminPool.query(`CREATE DATABASE "${nome}"`);
  await adminPool.end();

  pool = new Pool({ connectionString: url, max: 5 });
  app = createApp(pool, { adminApiKey: CHAVE, rateLimitPorMinuto: 10000 });
  await pool.query(fs.readFileSync(path.join(__dirname, '../../db/banco.sql'), 'utf8'));
  await pool.query('TRUNCATE itens_pedido, pedidos RESTART IDENTITY CASCADE');
});
test.after(async () => { if (pool) await pool.end(); });

test('GET /health responde ok e confirma conexão com o banco', async () => {
  const r = await request(app).get('/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'ok', db: 'ok' });
});

test('GET /api/produtos lista o cardápio inicial (seed do init.sql)', async () => {
  const r = await request(app).get('/api/produtos');
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 5);
  assert.ok(r.body.some((p) => p.nome === 'Coxinha' && p.preco_centavos === 600));
});

test('POST /api/produtos exige chave de admin (401 sem chave, 401 com chave errada)', async () => {
  assert.equal((await request(app).post('/api/produtos').send({ nome: 'X1', preco_centavos: 100 })).status, 401);
  assert.equal((await request(app).post('/api/produtos').set('x-api-key', 'errada').send({ nome: 'X1', preco_centavos: 100 })).status, 401);
});

test('POST /api/produtos cria produto, valida entrada e impede duplicado', async () => {
  const nome = `Pastel ${Date.now()}`;
  const ok = await admin(request(app).post('/api/produtos')).send({ nome, preco_centavos: 900 });
  assert.equal(ok.status, 201);
  assert.equal((await admin(request(app).post('/api/produtos')).send({ nome, preco_centavos: 900 })).status, 409);
  assert.equal((await admin(request(app).post('/api/produtos')).send({ nome: 'Ok', preco_centavos: -5 })).status, 400);
});

test('POST /api/pedidos calcula total no servidor e grava itens', async () => {
  const { body: produtos } = await request(app).get('/api/produtos');
  const coxinha = produtos.find((p) => p.nome === 'Coxinha');
  const suco = produtos.find((p) => p.nome === 'Suco natural');
  const r = await request(app).post('/api/pedidos').send({
    cliente: 'Maria', itens: [{ produto_id: coxinha.id, quantidade: 2 }, { produto_id: suco.id, quantidade: 1 }], total_centavos: 1,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.total_centavos, 1900); // ignora o "total_centavos: 1" enviado pelo cliente
  assert.equal(r.body.status, 'recebido');
  const n = await pool.query('SELECT count(*)::int AS n FROM itens_pedido WHERE pedido_id = $1', [r.body.id]);
  assert.equal(n.rows[0].n, 2);
});

test('POST /api/pedidos rejeita produto inexistente e faz ROLLBACK (nada gravado)', async () => {
  const antes = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  const r = await request(app).post('/api/pedidos').send({ cliente: 'João', itens: [{ produto_id: 999999, quantidade: 1 }] });
  assert.equal(r.status, 422);
  const depois = (await pool.query('SELECT count(*)::int AS n FROM pedidos')).rows[0].n;
  assert.equal(depois, antes);
});

test('POST /api/pedidos rejeita produto indisponível', async () => {
  const { rows } = await pool.query("INSERT INTO produtos (nome, preco_centavos, disponivel) VALUES ('Esgotado Teste', 100, false) ON CONFLICT (nome) DO UPDATE SET disponivel=false RETURNING id");
  const r = await request(app).post('/api/pedidos').send({ cliente: 'Ana', itens: [{ produto_id: rows[0].id, quantidade: 1 }] });
  assert.equal(r.status, 422);
});

test('Ciclo de vida do pedido: fluxo válido e transição inválida (409)', async () => {
  const { body: produtos } = await request(app).get('/api/produtos');
  const novo = await request(app).post('/api/pedidos').send({ cliente: 'Lia', itens: [{ produto_id: produtos.find((p) => p.disponivel).id, quantidade: 1 }] });
  const id = novo.body.id;
  assert.equal((await admin(request(app).patch(`/api/pedidos/${id}/status`)).send({ status: 'em_preparo' })).status, 200);
  assert.equal((await admin(request(app).patch(`/api/pedidos/${id}/status`)).send({ status: 'recebido' })).status, 409);
  assert.equal((await admin(request(app).patch(`/api/pedidos/${id}/status`)).send({ status: 'pronto' })).status, 200);
  assert.equal((await admin(request(app).patch('/api/pedidos/999999/status')).send({ status: 'pronto' })).status, 404);
});

test('GET /api/pedidos exige admin e lista pedidos', async () => {
  assert.equal((await request(app).get('/api/pedidos')).status, 401);
  const r = await admin(request(app).get('/api/pedidos'));
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 1);
});

test('Segurança: SQL injection no filtro é rejeitado e JSON inválido retorna 400', async () => {
  const r = await admin(request(app).get('/api/pedidos')).query({ status: "x' OR '1'='1" });
  assert.equal(r.status, 400);
  const j = await request(app).post('/api/pedidos').set('Content-Type', 'application/json').send('{quebrado');
  assert.equal(j.status, 400);
});

test('Segurança: cabeçalhos do helmet presentes e x-powered-by ausente', async () => {
  const r = await request(app).get('/health');
  assert.ok(r.headers['content-security-policy']);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-powered-by'], undefined);
});
