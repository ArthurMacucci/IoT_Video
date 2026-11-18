const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularTotal } = require('../../src/pedidoService');

const produtos = new Map([
  [1, { id: 1, nome: 'Coxinha', preco_centavos: 600, disponivel: true }],
  [2, { id: 2, nome: 'Suco', preco_centavos: 700, disponivel: true }],
  [3, { id: 3, nome: 'Bolo', preco_centavos: 650, disponivel: false }],
]);

test('calcularTotal soma preço x quantidade em centavos', () => {
  const { total, detalhes } = calcularTotal([{ produto_id: 1, quantidade: 2 }, { produto_id: 2, quantidade: 1 }], produtos);
  assert.equal(total, 1900);
  assert.equal(detalhes.length, 2);
  assert.equal(detalhes[0].preco_unit_centavos, 600);
});

test('calcularTotal falha com produto inexistente (422)', () => {
  assert.throws(() => calcularTotal([{ produto_id: 99, quantidade: 1 }], produtos), (e) => e.status === 422);
});

test('calcularTotal falha com produto indisponível (422)', () => {
  assert.throws(() => calcularTotal([{ produto_id: 3, quantidade: 1 }], produtos), (e) => e.status === 422 && /indispon/.test(e.message));
});
