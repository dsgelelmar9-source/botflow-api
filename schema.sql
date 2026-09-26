CREATE TABLE IF NOT EXISTS conversaciones (
  id_usuario TEXT PRIMARY KEY,
  nombre TEXT,
  plataforma TEXT NOT NULL,
  nivel_actual INTEGER NOT NULL DEFAULT 1,
  categoria TEXT,
  plataforma_interes TEXT,
  plan TEXT,
  monto_estimado INTEGER,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_interaccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_mensajes INTEGER NOT NULL DEFAULT 0,
  ultimo_evento TEXT
);

CREATE TABLE IF NOT EXISTS mensajes (
  id BIGSERIAL PRIMARY KEY,
  id_externo TEXT UNIQUE,
  id_usuario TEXT NOT NULL,
  tipo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_usuario_fecha
ON mensajes(id_usuario, fecha);

CREATE INDEX IF NOT EXISTS idx_conversaciones_nivel
ON conversaciones(nivel_actual);

CREATE INDEX IF NOT EXISTS idx_conversaciones_ultima
ON conversaciones(ultima_interaccion);
