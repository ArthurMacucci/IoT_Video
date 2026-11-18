// Sem scripts inline: a Content-Security-Policy do helmet só permite scripts do próprio domínio.
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (id) => document.getElementById(id);
const carrinho = new Map(); // produto_id -> { produto, quantidade }

function el(tag, texto, attrs = {}) {
  const e = document.createElement(tag);
  e.textContent = texto; // textContent (nunca innerHTML) => proteção contra XSS
  Object.assign(e, attrs);
  return e;
}

const EMOJIS = { 'coxinha': '🍗', 'pao-de-queijo': '🧀', 'misto-quente': '🥪', 'suco-natural': '🧃', 'bolo-de-cenoura': '🍰' };
const slug = (nome) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Foto do produto: tenta /img/<slug>.jpg; se não existir, mostra um emoji.
function foto(produto) {
  const s = slug(produto.nome);
  const emoji = el('span', EMOJIS[s] || '🍽️');
  emoji.className = 'foto emoji';
  const img = document.createElement('img');
  img.src = `/img/${s}.jpg`;
  img.alt = produto.nome;
  img.className = 'foto';
  img.addEventListener('error', () => img.replaceWith(emoji));
  return img;
}

async function carregarCardapio() {
  let produtos;
  try {
    const r = await fetch('/api/produtos');
    if (!r.ok) throw new Error(`erro ${r.status}`);
    produtos = await r.json();
  } catch (e) {
    $('cardapio').replaceChildren(el('li', `Não foi possível carregar o cardápio (${e.message}). Veja: docker compose logs`));
    return;
  }
  if (!produtos.length) { $('cardapio').replaceChildren(el('li', 'Cardápio vazio.')); return; }
  $('cardapio').replaceChildren(...produtos.map((p) => {
    const li = el('li', '');
    li.className = p.disponivel ? '' : 'indisponivel';
    const info = el('span', `${p.nome} – ${p.descricao} (${brl(p.preco_centavos)})`);
    info.className = 'info';
    li.append(foto(p), info);
    const b = el('button', p.disponivel ? 'Adicionar' : 'Indisponível', { disabled: !p.disponivel });
    b.addEventListener('click', () => { const x = carrinho.get(p.id) || { produto: p, quantidade: 0 }; x.quantidade++; carrinho.set(p.id, x); desenharCarrinho(); });
    li.append(b);
    return li;
  }));
}

function desenharCarrinho() {
  let total = 0;
  $('carrinho').replaceChildren(...[...carrinho.values()].map(({ produto, quantidade }) => {
    total += produto.preco_centavos * quantidade;
    return el('li', `${quantidade}x ${produto.nome}`);
  }));
  $('total').textContent = brl(total);
}

$('enviar').addEventListener('click', async () => {
  const itens = [...carrinho.values()].map((x) => ({ produto_id: x.produto.id, quantidade: x.quantidade }));
  const r = await fetch('/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente: $('cliente').value, itens }) });
  const d = await r.json();
  $('msg').textContent = r.ok ? `Pedido #${d.id} recebido! Total ${brl(d.total_centavos)}` : (d.erros || [d.erro]).join('; ');
  if (r.ok) { carrinho.clear(); desenharCarrinho(); }
});

const PROXIMO = { recebido: 'em_preparo', em_preparo: 'pronto', pronto: 'entregue' };
async function carregarPedidos() {
  const r = await fetch('/api/pedidos', { headers: { 'x-api-key': $('chave').value } });
  if (!r.ok) { $('pedidos').replaceChildren(el('li', 'Chave inválida ou erro ao carregar')); return; }
  const pedidos = await r.json();
  $('pedidos').replaceChildren(...pedidos.map((p) => {
    const li = el('li', '');
    li.append(el('span', `#${p.id} ${p.cliente} – ${brl(p.total_centavos)} – ${p.status}`));
    if (PROXIMO[p.status]) {
      const b = el('button', `→ ${PROXIMO[p.status]}`);
      b.addEventListener('click', async () => {
        await fetch(`/api/pedidos/${p.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-api-key': $('chave').value }, body: JSON.stringify({ status: PROXIMO[p.status] }) });
        carregarPedidos();
      });
      li.append(b);
    }
    return li;
  }));
}
$('carregar').addEventListener('click', carregarPedidos);
carregarCardapio();
