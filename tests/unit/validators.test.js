const test = require('node:test');
const assert = require('node:assert/strict');
const { validarProduto, validarPedido, transicaoPermitida } = require('../../src/validators');

test('validarProduto aceita produto válido e normaliza espaços', () => {
  const r = validarProduto({ nome: '  Pastel  ', preco_centavos: 750 });
  assert.equal(r.valido, true);
  assert.deepEqual(r.dados, { nome: 'Pastel', descricao: '', preco_centavos: 750, disponivel: true });
});

test('validarProduto rejeita preço decimal, negativo e nome curto', () => {
  assert.equal(validarProduto({ nome: 'Pastel', preco_centavos: 7.5 }).valido, false);
  assert.equal(validarProduto({ nome: 'Pastel', preco_centavos: -1 }).valido, false);
  assert.equal(validarProduto({ nome: 'P', preco_centavos: 500 }).valido, false);
});

test('validarProduto rejeita corpo vazio/nulo sem lançar exceção', () => {
  assert.equal(validarProduto(null).valido, false);
  assert.equal(validarProduto(undefined).valido, false);
});

test('validarPedido aceita pedido válido', () => {
  const r = validarPedido({ cliente: 'Ana', itens: [{ produto_id: 1, quantidade: 2 }] });
  assert.equal(r.valido, true);
  assert.equal(r.dados.itens[0].quantidade, 2);
});

test('validarPedido rejeita lista vazia, quantidade absurda e campos extras são descartados', () => {
  assert.equal(validarPedido({ cliente: 'Ana', itens: [] }).valido, false);
  assert.equal(validarPedido({ cliente: 'Ana', itens: [{ produto_id: 1, quantidade: 999 }] }).valido, false);
  const r = validarPedido({ cliente: 'Ana', itens: [{ produto_id: 1, quantidade: 1, preco: 0 }] });
  assert.equal('preco' in r.dados.itens[0], false); // cliente não pode injetar preço
});

test('transicaoPermitida respeita o fluxo do pedido', () => {
  assert.equal(transicaoPermitida('recebido', 'em_preparo'), true);
  assert.equal(transicaoPermitida('pronto', 'entregue'), true);
  assert.equal(transicaoPermitida('entregue', 'recebido'), false);
  assert.equal(transicaoPermitida('cancelado', 'pronto'), false);
  assert.equal(transicaoPermitida('inexistente', 'pronto'), false);
});
