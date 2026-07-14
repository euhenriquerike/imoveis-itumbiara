import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const CIDADE = 'Itumbiara';
const BASE = 'https://www.wimoveis.com.br/venda/imoveis/go/itumbiara';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const MAX_PAGINAS = 40;

const num = (s) => {
  const m = String(s || '').replace(/\./g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

function extrairCards() {
  const cards = document.querySelectorAll('[data-qa="posting PROPERTY"]');
  return [...cards].map((c) => {
    const feats = [...c.querySelectorAll('[data-qa="POSTING_CARD_FEATURES"] *')]
      .map((e) => e.textContent.trim()).filter(Boolean);
    const path = c.getAttribute('data-to-posting') || c.querySelector('a')?.getAttribute('href') || '';
    return {
      id: c.getAttribute('data-id'),
      precoTexto: c.querySelector('[data-qa="POSTING_CARD_PRICE"]')?.textContent?.trim() || null,
      local: c.querySelector('[data-qa="POSTING_CARD_LOCATION"]')?.textContent?.trim() || null,
      endereco: c.querySelector('[data-qa="POSTING_CARD_LOCATION_ADDRESS"]')?.textContent?.trim() || null,
      titulo: c.querySelector('h2, [data-qa="POSTING_CARD_DESCRIPTION"]')?.textContent?.trim() || null,
      feats,
      link: path.startsWith('http') ? path.split('?')[0] : 'https://www.wimoveis.com.br' + path.split('?')[0],
    };
  });
}

function normalizar(raw) {
  const feat = (re) => { const f = raw.feats.find((x) => re.test(x)); return f ? num(f) : null; };
  const area = feat(/m²/);
  const quartos = feat(/quarto/i);
  const banheiros = feat(/banheiro/i);
  const vagas = feat(/vaga|garagem/i);
  const preco = /consulte|sob/i.test(raw.precoTexto || '') ? null : num(raw.precoTexto);
  const tituloTipo = ((raw.titulo || '') + ' ' + (raw.link || '')).toLowerCase();
  let tipo = 'Outro';
  for (const [re, t] of [
    [/apartamento|apto/, 'Apartamento'], [/casa de condom|condom/, 'Casa em condomínio'],
    [/casa|sobrado/, 'Casa'], [/terreno|lote/, 'Terreno'], [/galp|armaz/, 'Galpão'],
    [/sala|comercial|loja/, 'Comercial'], [/fazenda|s[íi]tio|ch[áa]cara|rural/, 'Rural'],
  ]) if (re.test(tituloTipo)) { tipo = t; break; }
  const bairro = (raw.local || '').split(',')[0].trim() || null;
  return {
    id: raw.id, tipo, preco, precoTexto: raw.precoTexto,
    quartos, banheiros, vagas, area,
    bairro, cidade: CIDADE, endereco: raw.endereco,
    titulo: raw.titulo, link: raw.link,
  };
}

async function coletar() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'pt-BR', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();

  const vistos = new Map();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('[data-qa="posting PROPERTY"]', { timeout: 20000 });
  const totalEsperado = num(await page.title());
  console.log(`Total anunciado: ${totalEsperado || '?'} imóveis`);

  const primeiroId = () => page.evaluate(() =>
    document.querySelector('[data-qa="posting PROPERTY"]')?.getAttribute('data-id') || '');

  for (let p = 1; p <= MAX_PAGINAS; p++) {
    const raws = await page.evaluate(extrairCards);
    let novos = 0;
    for (const r of raws) { if (r.id && !vistos.has(r.id)) { vistos.set(r.id, normalizar(r)); novos++; } }
    console.log(`pág ${p}: ${raws.length} cards (${novos} novos) — total ${vistos.size}`);
    if (novos === 0 && p > 1) { console.log('sem novos — fim'); break; }
    if (totalEsperado && vistos.size >= totalEsperado) break;

    // botão "próxima página" (última seta do paginador). href é falso; navega via clique React.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const next = page.locator('[data-qa="PAGING_NEXT"], a.paging-module__page-arrow-next, [class*="page-arrow"]:not([class*="disabled"])').last();
    if (!(await next.count()) || !(await next.isVisible().catch(() => false))) {
      console.log('sem botão de próxima — fim'); break;
    }
    const antes = await primeiroId();
    await next.click({ timeout: 8000 }).catch(() => {});
    // espera o primeiro card trocar (nova página renderizou)
    try {
      await page.waitForFunction(
        (id) => document.querySelector('[data-qa="posting PROPERTY"]')?.getAttribute('data-id') !== id,
        antes, { timeout: 15000 });
    } catch { console.log('página não avançou — fim'); break; }
    await page.waitForTimeout(1200 + Math.random() * 800);
  }

  await browser.close();
  return [...vistos.values()];
}

const imoveis = await coletar();
mkdirSync('data', { recursive: true });
const payload = {
  atualizadoEm: new Date().toISOString(),
  cidade: CIDADE,
  fonte: 'wimoveis.com.br',
  total: imoveis.length,
  comPreco: imoveis.filter((i) => i.preco != null).length,
  imoveis: imoveis.sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity)),
};
writeFileSync('data/imoveis.json', JSON.stringify(payload, null, 2));
// versão .js pra abrir o dashboard com duplo clique (sem servidor local)
writeFileSync('data/imoveis.js', 'window.__IMOVEIS__ = ' + JSON.stringify(payload) + ';');
console.log(`\nSalvo data/imoveis.json + data/imoveis.js — ${payload.total} imóveis, ${payload.comPreco} com preço.`);
