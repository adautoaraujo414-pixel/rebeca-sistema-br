#!/bin/bash
echo ""
echo "🍽️ Rebeca Cozinha — Servidor Local"
echo ""

if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado!"
  echo "Instale em: https://nodejs.org"
  exit 1
fi

echo "✅ Node.js $(node --version)"
node servidor.js
