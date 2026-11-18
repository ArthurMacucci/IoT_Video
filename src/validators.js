// Funções puras de validação (fáceis de testar sem banco).
const STATUS = ['recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado'];

const TRANSICOES = {
  recebido: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['entregue'],
  entregue: [],
  cancelado: [],
};

function textoValido(v, min, max) {
  return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
}

function validarProduto(body) {
  const erros = [];
  const b = body && typeof body === 'object' ? body : {};
  if (!textoValido(b.nome, 2, 80)) erros.push('nome deve ter entre 2 e 80 caracteres');
  if (b.descricao !== undefined && !(typeof b.descricao === 'string' && b.descricao.length <= 255)) {
    erros.push('descricao deve ter no máximo 255 caracteres');
  }
  if (!Number.isInteger(b.preco_centavos) || b.preco_centavos <= 0 || b.preco_centavos > 100000) {
    erros.push('preco_centavos deve ser um inteiro entre 1 e 100000');
  }
  if (b.disponivel !== undefined && typeof b.disponivel !== 'boolean') {
    erros.push('disponivel deve ser booleano');
  }
  if (erros.length) return { valido: false, erros };
  return {
    valido: true,
    dados: {
      nome: b.nome.trim(),
      descricao: (b.descricao || '').trim(),
      preco_centavos: b.preco_centavos,
      disponivel: b.disponivel === undefined ? true : b.disponivel,
    },
  };
}

function validarPedido(body) {
  const erros = [];
  const b = body && typeof body === 'object' ? body : {};
  if (!textoValido(b.cliente, 2, 80)) erros.push('cliente deve ter entre 2 e 80 caracteres');
  if (!Array.isArray(b.itens) || b.itens.length === 0 || b.itens.length > 30) {
    erros.push('itens deve ser uma lista com 1 a 30 itens');
  } else {
    b.itens.forEach((it, i) => {
      if (!it || !Number.isInteger(it.produto_id) || it.produto_id <= 0) {
        erros.push(`itens[${i}].produto_id inválido`);
      }
      if (!it || !Number.isInteger(it.quantidade) || it.quantidade < 1 || it.quantidade > 20) {
        erros.push(`itens[${i}].quantidade deve ser um inteiro entre 1 e 20`);
      }
    });
  }
  if (erros.length) return { valido: false, erros };
  return { valido: true, dados: { cliente: b.cliente.trim(), itens: b.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })) } };
}

function transicaoPermitida(de, para) {
  return Array.isArray(TRANSICOES[de]) && TRANSICOES[de].includes(para);
}

module.exports = { STATUS, TRANSICOES, validarProduto, validarPedido, transicaoPermitida };
