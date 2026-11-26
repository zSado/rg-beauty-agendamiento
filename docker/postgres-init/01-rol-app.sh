#!/bin/sh
# Crea el usuario de la API (rg_app). Solo podrá leer y escribir datos: los permisos
# los concede 001_schema.sql al migrar. La clave viene de la variable RG_APP_PASSWORD.
set -e
psql -v ON_ERROR_STOP=1 -v pw="$RG_APP_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'EOSQL'
CREATE ROLE rg_app LOGIN PASSWORD :'pw';
EOSQL
