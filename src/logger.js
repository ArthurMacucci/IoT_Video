// Logger mínimo em JSON, uma linha por evento: fácil de auditar com `docker compose logs`.
function log(nivel, mensagem, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), nivel, mensagem, ...extra }));
}
module.exports = {
  info: (m, e) => log('info', m, e),
  warn: (m, e) => log('warn', m, e),
  error: (m, e) => log('error', m, e),
};
