// Coleta os imóveis e publica no site. Funciona em Windows, Mac e Linux.
// Uso: node atualizar.mjs   (ou: npm run atualizar)
import { execSync } from 'child_process';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'pipe', ...opts }).toString();
const tenta = (cmd) => { try { return run(cmd); } catch (e) { return ((e.stdout || '') + (e.stderr || '')).toString(); } };

console.log('1/3 Pegando o que já foi publicado...');
console.log(tenta('git pull --rebase --autostash'));

console.log('2/3 Coletando imóveis (leva ~2 min)...');
console.log(run('node scraper.js'));

console.log('3/3 Publicando no site...');
tenta('git add data/imoveis.json data/imoveis.js');
let temMudanca = false;
try { run('git diff --staged --quiet'); } catch { temMudanca = true; }
if (!temMudanca) { console.log('Sem mudanças nos dados. Nada a publicar.'); process.exit(0); }

const dia = new Date().toISOString().slice(0, 10);
tenta(`git commit -m "Atualiza imóveis ${dia}"`);
try {
  console.log(run('git push'));
} catch {
  // se alguém publicou no meio do caminho, reconcilia e tenta de novo
  console.log('Push rejeitado, reconciliando...');
  console.log(tenta('git pull --rebase --autostash'));
  console.log(tenta('git push'));
}
console.log('Publicado. O site atualiza em ~1 min.');
