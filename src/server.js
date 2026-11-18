const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { lerConfig } = require('./config');
const { createApp } = require('./app');
const logger = require('./logger');

const config = lerConfig();
if (!config.databaseUrl || !config.adminApiKey) {
  logger.error('config_invalida', { detalhe: 'DATABASE_URL e ADMIN_API_KEY são obrigatórias' });
  process.exit(1);
}

const pool = new Pool({ connectionString: config.databaseUrl, max: config.poolMax });
pool.on('error', (e) => logger.error('erro_pool_banco', { detalhe: e.message }));

async function iniciar() {
  // Tenta conectar ao banco algumas vezes (o compose já espera o healthcheck; isto é um 2º cinto de segurança).
  for (let tentativa = 1; tentativa <= 10; tentativa++) {
    try {
      await pool.query('SELECT 1');
      logger.info('conexao_banco_ok', { tentativa });
      break;
    } catch (e) {
      logger.warn('aguardando_banco', { tentativa, detalhe: e.message });
      if (tentativa === 10) { logger.error('banco_indisponivel'); process.exit(1); }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Garante tabelas e cardápio inicial mesmo se o init.sql do Postgres não tiver rodado (volume antigo, etc.).
  // O script é idempotente (CREATE IF NOT EXISTS / ON CONFLICT DO NOTHING).
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'banco.sql'), 'utf8'));
    logger.info('schema_aplicado');
  } catch (e) {
    logger.error('falha_schema', { detalhe: e.message });
    process.exit(1);
  }
  const server = createApp(pool, config).listen(config.port, () => logger.info('api_iniciada', { porta: config.port, versao: process.env.APP_VERSION || 'dev' }));

  const encerrar = (sinal) => {
    logger.info('encerrando', { sinal });
    server.close(async () => { await pool.end(); process.exit(0); });
  };
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}
iniciar();
