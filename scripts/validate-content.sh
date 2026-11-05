#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "Uso: ./scripts/validate-content.sh <ruta-al-repo-Contenido-Netti>"
  exit 1
fi

npx tsx scripts/content-validator.ts "$1"