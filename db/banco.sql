-- EstuLanches: esquema inicial. Executado automaticamente pelo Postgres na 1ª subida
-- (docker-entrypoint-initdb.d). É idempotente: pode ser reexecutado sem erro.

CREATE TABLE IF NOT EXISTS produtos (
  id              SERIAL PRIMARY KEY,
  nome            VARCHAR(80)  NOT NULL UNIQUE,
  descricao       VARCHAR(255) NOT NULL DEFAULT '',
  preco_centavos  INTEGER      NOT NULL CHECK (preco_centavos > 0),
  disponivel      BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  cliente         VARCHAR(80) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'recebido'
                  CHECK (status IN ('recebido','em_preparo','pronto','entregue','cancelado')),
  total_centavos  INTEGER     NOT NULL CHECK (total_centavos >= 0),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id                   SERIAL PRIMARY KEY,
  pedido_id            INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id           INTEGER NOT NULL REFERENCES produtos(id),
  quantidade           INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 20),
  preco_unit_centavos  INTEGER NOT NULL CHECK (preco_unit_centavos > 0)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status_criado ON pedidos (status, criado_em);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_pedido   ON itens_pedido (pedido_id);

INSERT INTO produtos (nome, descricao, preco_centavos) VALUES
  ('Coxinha',           'Coxinha de frango com catupiry',   600),
  ('Pão de queijo',     'Porção com 3 unidades',            500),
  ('Misto quente',      'Pão, presunto e queijo',           800),
  ('Suco natural',      'Copo de 300 ml (laranja ou uva)',  700),
  ('Bolo de cenoura',   'Fatia com cobertura de chocolate', 650)
ON CONFLICT (nome) DO NOTHING;
