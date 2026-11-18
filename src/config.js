// Toda configuração vem de variáveis de ambiente (12-factor). Nada de segredo no código.
function lerConfig(env = process.env) {
  return {
    port: parseInt(env.PORT || '3000', 10),
    databaseUrl: env.DATABASE_URL,
    adminApiKey: env.ADMIN_API_KEY,
    poolMax: parseInt(env.DB_POOL_MAX || '10', 10),
    rateLimitPorMinuto: parseInt(env.RATE_LIMIT_PER_MIN || '120', 10),
  };
}
module.exports = { lerConfig };
