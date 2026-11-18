const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { validarProduto, validarPedido, transicaoPermitida, STATUS } = require('./validators');
const { criarPedido } = require('./pedidoService');

function chaveConfere(recebida, esperada) {
  if (!esperada || typeof recebida !== 'string') return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b); 
}

function createApp(pool, config) {
  const app = express();
  app.disable('x-powered-by');

  const csp = helmet.contentSecurityPolicy.getDefaultDirectives();
  delete csp['upgrade-insecure-requests'];
  app.use(helmet({ hsts: false, contentSecurityPolicy: { directives: csp } }));
  app.use(express.json({ limit: '10kb' })); 

  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      if (req.path !== '/health') logger.info('request', { metodo: req.method, rota: req.path, status: res.statusCode, ms: Date.now() - t0 });
    });
    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'erro', db: 'indisponivel' });
    }
  });

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: config.rateLimitPorMinuto, standardHeaders: true, legacyHeaders: false }));

  const exigirAdmin = (req, res, next) => {
    if (chaveConfere(req.get('x-api-key'), config.adminApiKey)) return next();
    return res.status(401).json({ erro: 'Chave de administrador ausente ou inválida' });
  };
  const assincrono = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  api.get('/produtos', assincrono(async (_req, res) => {
    const { rows } = await pool.query('SELECT id, nome, descricao, preco_centavos, disponivel FROM produtos ORDER BY nome');
    res.json(rows);
  }));

  api.post('/produtos', exigirAdmin, assincrono(async (req, res) => {
    const v = validarProduto(req.body);
    if (!v.valido) return res.status(400).json({ erros: v.erros });
    try {
      const { rows } = await pool.query('INSERT INTO produtos (nome, descricao, preco_centavos, disponivel) VALUES ($1,$2,$3,$4) RETURNING *', [v.dados.nome, v.dados.descricao, v.dados.preco_centavos, v.dados.disponivel]);
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um produto com esse nome' });
      throw e;
    }
  }));

  api.patch('/produtos/:id/disponibilidade', exigirAdmin, assincrono(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || typeof req.body?.disponivel !== 'boolean') return res.status(400).json({ erro: 'id inteiro e "disponivel" booleano são obrigatórios' });
    const { rows } = await pool.query('UPDATE produtos SET disponivel = $1 WHERE id = $2 RETURNING *', [req.body.disponivel, id]);
    if (!rows.length) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(rows[0]);
  }));


  api.post('/pedidos', assincrono(async (req, res) => {
    const v = validarPedido(req.body);
    if (!v.valido) return res.status(400).json({ erros: v.erros });
    res.status(201).json(await criarPedido(pool, v.dados));
  }));

  api.get('/pedidos', exigirAdmin, assincrono(async (req, res) => {
    const filtro = req.query.status;
    if (filtro !== undefined && !STATUS.includes(filtro)) return res.status(400).json({ erro: 'status inválido' });
    const { rows } = filtro
      ? await pool.query('SELECT * FROM pedidos WHERE status = $1 ORDER BY criado_em DESC LIMIT 100', [filtro])
      : await pool.query('SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 100');
    res.json(rows);
  }));

  api.patch('/pedidos/:id/status', exigirAdmin, assincrono(async (req, res) => {
    const id = Number(req.params.id);
    const novo = req.body?.status;
    if (!Number.isInteger(id) || !STATUS.includes(novo)) return res.status(400).json({ erro: 'id inteiro e status válido são obrigatórios' });
    const atual = await pool.query('SELECT status FROM pedidos WHERE id = $1', [id]);
    if (!atual.rows.length) return res.status(404).json({ erro: 'Pedido não encontrado' });
    if (!transicaoPermitida(atual.rows[0].status, novo)) return res.status(409).json({ erro: `Transição ${atual.rows[0].status} -> ${novo} não permitida` });
    const { rows } = await pool.query('UPDATE pedidos SET status = $1, atualizado_em = now() WHERE id = $2 RETURNING *', [novo, id]);
    res.json(rows[0]);
  }));

  app.use('/api', api);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
    if (err.status === 422) return res.status(422).json({ erro: err.message });
    logger.error('erro_nao_tratado', { rota: req.path, detalhe: err.message });
    res.status(500).json({ erro: 'Erro interno' }); 
  });

  return app;
}

module.exports = { createApp };
