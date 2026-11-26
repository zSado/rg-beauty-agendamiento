-- RG Beauty Spa - Módulo Agendamiento y pago de abono
-- Esquema relacional (PostgreSQL 14+). Modelo de la Unidad II + USUARIO, AUDITORIA,
-- disponibilidad y sesiones (entidades que la Unidad II dejó para la Unidad III).
-- Las fechas son hora local de Chile guardadas como "timestamp" (sin zona), igual que
-- el formato AAAA-MM-DD HH:MM del informe.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE cliente (
  id_cliente  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre      TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 100),
  correo      TEXT NOT NULL UNIQUE,
  telefono    TEXT NOT NULL
);

CREATE TABLE profesional (
  id_profesional INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre         TEXT NOT NULL,
  especialidad   TEXT NOT NULL
);

CREATE TABLE servicio (
  id_servicio  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  precio       INTEGER NOT NULL CHECK (precio > 0),
  duracion_min INTEGER NOT NULL CHECK (duracion_min > 0),
  pct_abono    INTEGER NOT NULL CHECK (pct_abono BETWEEN 0 AND 100)
);

-- Qué servicios realiza cada profesional (tabla puente, relación N:M)
CREATE TABLE profesional_servicio (
  id_profesional INTEGER NOT NULL REFERENCES profesional(id_profesional),
  id_servicio    INTEGER NOT NULL REFERENCES servicio(id_servicio),
  PRIMARY KEY (id_profesional, id_servicio)
);

-- Horario semanal de atención de cada profesional (0 = domingo ... 6 = sábado)
CREATE TABLE disponibilidad (
  id_disponibilidad INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_profesional    INTEGER NOT NULL REFERENCES profesional(id_profesional),
  dia_semana        INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio       TIME NOT NULL,
  hora_fin          TIME NOT NULL,
  CHECK (hora_fin > hora_inicio),
  UNIQUE (id_profesional, dia_semana, hora_inicio)
);

-- Bloqueos puntuales de horario (A3 Disponibilidad)
CREATE TABLE bloqueo (
  id_bloqueo     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_profesional INTEGER NOT NULL REFERENCES profesional(id_profesional),
  inicio         TIMESTAMP NOT NULL,
  fin            TIMESTAMP NOT NULL,
  motivo         TEXT,
  CHECK (fin > inicio)
);

CREATE TABLE cita (
  id_cita        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cliente     INTEGER NOT NULL REFERENCES cliente(id_cliente),
  id_servicio    INTEGER NOT NULL REFERENCES servicio(id_servicio),
  id_profesional INTEGER NOT NULL REFERENCES profesional(id_profesional),
  fecha_hora     TIMESTAMP NOT NULL,            -- inicio
  fecha_hora_fin TIMESTAMP NOT NULL,            -- fin (guardado para detectar traslapes con índice)
  estado         TEXT NOT NULL CHECK (estado IN ('PENDIENTE_PAGO','CONFIRMADA','CANCELADA','EXPIRADA')),
  monto_abono    INTEGER NOT NULL CHECK (monto_abono >= 0),   -- se guarda a propósito (RN-01)
  expira_en      TIMESTAMP,                     -- RN-04: retención de 15 minutos
  creada_en      TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago'),
  CHECK (fecha_hora_fin > fecha_hora),
  -- RN-02, capa de base de datos: un profesional no puede tener dos citas activas
  -- cuyos intervalos se traslapen (cubre también el traslape parcial).
  CONSTRAINT cita_sin_traslape EXCLUDE USING gist (
    id_profesional WITH =,
    tsrange(fecha_hora, fecha_hora_fin) WITH &&
  ) WHERE (estado IN ('PENDIENTE_PAGO','CONFIRMADA'))
);

CREATE INDEX ix_cita_prof_inicio ON cita (id_profesional, fecha_hora);
CREATE INDEX ix_cita_cliente ON cita (id_cliente, fecha_hora);
CREATE INDEX ix_cita_estado_expira ON cita (expira_en) WHERE estado = 'PENDIENTE_PAGO';

CREATE TABLE pago (
  id_pago            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_cita            INTEGER NOT NULL REFERENCES cita(id_cita),
  monto              INTEGER NOT NULL CHECK (monto > 0),
  estado             TEXT NOT NULL CHECK (estado IN ('APROBADO','RECHAZADO','REVERTIDO')),
  referencia_externa TEXT NOT NULL UNIQUE,      -- RN-03: impide pagos duplicados
  creado_en          TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santiago')
);
-- Una cita no puede tener dos pagos aprobados a la vez
CREATE UNIQUE INDEX ux_pago_aprobado_por_cita ON pago (id_cita) WHERE estado = 'APROBADO';
CREATE INDEX ix_pago_cita ON pago (id_cita);

CREATE TABLE usuario (
  id_usuario          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  correo              TEXT NOT NULL UNIQUE,
  clave_hash          TEXT NOT NULL,             -- Argon2id, nunca texto plano
  rol                 TEXT NOT NULL CHECK (rol IN ('CLIENTA','PROFESIONAL','ADMIN')),
  id_cliente          INTEGER REFERENCES cliente(id_cliente),
  id_profesional      INTEGER REFERENCES profesional(id_profesional),
  autorizado_pagos    BOOLEAN NOT NULL DEFAULT FALSE,   -- "perfil autorizado" (RN-06)
  intentos_fallidos   INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta     TIMESTAMPTZ,
  CHECK ( (rol = 'CLIENTA'     AND id_cliente IS NOT NULL)
       OR (rol = 'PROFESIONAL' AND id_profesional IS NOT NULL)
       OR (rol = 'ADMIN') )
);

-- Token de renovación rotativo: se guarda solo su hash
CREATE TABLE sesion (
  id_sesion    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario   INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expira_en    TIMESTAMPTZ NOT NULL,
  revocada     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE auditoria (
  id_auditoria INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario   INTEGER REFERENCES usuario(id_usuario),
  accion       TEXT NOT NULL,
  detalle      TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_fecha ON auditoria (creado_en);

-- Mínimo privilegio (sección 7.3): el usuario de la API solo lee y escribe datos,
-- no crea ni borra tablas. El rol rg_app lo crea docker/init o el README.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rg_app') THEN
    GRANT USAGE ON SCHEMA public TO rg_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rg_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rg_app;
  END IF;
END $$;
