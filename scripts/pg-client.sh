#!/usr/bin/env bash
# Instala o cliente PostgreSQL (pg_dump/pg_restore) da mesma versao principal do servidor.
set -euo pipefail
major="$1"
if [ -x "/usr/lib/postgresql/$major/bin/pg_dump" ]; then
  echo "Cliente PostgreSQL $major ja instalado."
else
  sudo apt-get install -y -qq postgresql-common >/dev/null
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  sudo apt-get install -y -qq "postgresql-client-$major" >/dev/null
fi
echo "/usr/lib/postgresql/$major/bin" >> "${GITHUB_PATH:-/dev/null}"
"/usr/lib/postgresql/$major/bin/pg_dump" --version
