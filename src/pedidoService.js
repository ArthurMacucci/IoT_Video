function calcularTotal(itens, produtosPorId) {
  let total = 0;
  const detalhes = [];
  for (const item of itens) {
    const produto = produtosPorId.get(item.produto_id);
    if (!produto) throw Object.assign(new Error(`Produto ${item.produto_id} não existe`), { status: 422 });
    if (!produto.disponivel) throw Object.assign(new Error(`Produto "${produto.nome}" indisponível`), { status: 422 });
    total += produto.preco_centavos * item.quantidade;
    detalhes.push({ produto_id: produto.id, quantidade: item.quantidade, preco_unit_centavos: produto.preco_centavos });
  }
  return { total, detalhes };
}

async function criarPedido(pool, { cliente, itens }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [...new Set(itens.map((i) => i.produto_id))];
    const { rows } = await client.query('SELECT id, nome, preco_centavos, disponivel FROM produtos WHERE id = ANY($1::int[])', [ids]);
    const { total, detalhes } = calcularTotal(itens, new Map(rows.map((p) => [p.id, p])));
    const ped = await client.query('INSERT INTO pedidos (cliente, total_centavos) VALUES ($1, $2) RETURNING id, cliente, status, total_centavos, criado_em', [cliente, total]);
    for (const d of detalhes) {
      await client.query('INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unit_centavos) VALUES ($1,$2,$3,$4)', [ped.rows[0].id, d.produto_id, d.quantidade, d.preco_unit_centavos]);
    }
    await client.query('COMMIT');
    return { ...ped.rows[0], itens: detalhes };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { calcularTotal, criarPedido };
