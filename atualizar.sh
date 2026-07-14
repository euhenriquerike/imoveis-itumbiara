#!/bin/bash
# Roda o coletor e registra log. Usado pelo agendamento diário (launchd).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")" || exit 1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> atualizar.log
node scraper.js >> atualizar.log 2>&1
echo "" >> atualizar.log
