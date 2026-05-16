#!/usr/bin/env node
/**
 * soft-seed-admin.js
 * Bootstrap oficial do Rebeca Soft — cria o primeiro SoftAdmin via CLI.
 *
 * USO:
 *   node scripts/soft-seed-admin.js
 *   node scripts/soft-seed-admin.js --email=dono@loja.com --nome="Maria Silva" \
 *     --senha=MinhaS3nha! --nomeLoja="Loja da Maria" --slug=loja-maria
 *
 * NUNCA roda automaticamente. NUNCA importa Express/rotas.
 * NUNCA loga senha em nenhum momento.
 */

'use strict';

const path    = require('path');
const readline = require('readline');
const bcrypt  = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Conectar ao banco ANTES de qualquer require de model
const mongoose = require('mongoose');

// Models — apenas os necessários
const SoftAdmin = require('../src/soft/models/soft-admin.model');

// ─── Helpers ────────────────────────────────────────────────────────────────

const log = {
  info:  (msg) => console.log(`[SOFT][SEED] ℹ️  ${msg}`),
  ok:    (msg) => console.log(`[SOFT][SEED] ✅ ${msg}`),
  warn:  (msg) => console.log(`[SOFT][SEED] ⚠️  ${msg}`),
  erro:  (msg) => console.log(`[SOFT][SEED] ❌ ${msg}`),
  linha: ()    => console.log('[SOFT][SEED] ' + '─'.repeat(50)),
};

function slugify(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarSenha(senha) {
  if (!senha || senha.length < 8) return 'mínimo 8 caracteres';
  if (!/[A-Z]/.test(senha))       return 'precisa de ao menos 1 letra maiúscula';
  if (!/[0-9]/.test(senha))       return 'precisa de ao menos 1 número';
  return null;
}

// ─── Leitura de args CLI ─────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [chave, ...resto] = arg.replace(/^--/, '').split('=');
    args[chave] = resto.join('=');
  });
  return args;
}

// ─── Prompt interativo ───────────────────────────────────────────────────────

async function prompt(rl, pergunta, segredo = false) {
  return new Promise(resolve => {
    if (segredo && process.stdout.isTTY) {
      // Ocultar senha no terminal
      process.stdout.write(pergunta);
      process.stdin.setRawMode?.(true);
      let senha = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      const handler = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0003') {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(senha);
        } else if (char === '\u007F') {
          senha = senha.slice(0, -1);
        } else {
          senha += char;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', handler);
    } else {
      rl.question(pergunta, resolve);
    }
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log.linha();
  log.info('Rebeca Soft — Bootstrap de Administrador');
  log.info('Este script cria o primeiro SoftAdmin no sistema.');
  log.linha();

  // Conectar ao MongoDB
  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGO_URI) {
    log.erro('MONGODB_URI não encontrada no .env');
    process.exit(1);
  }

  log.info('Conectando ao MongoDB...');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    log.ok('MongoDB conectado');
  } catch (e) {
    log.erro(`Falha na conexão: ${e.message}`);
    process.exit(1);
  }

  const args = parseArgs();

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  try {
    log.linha();
    log.info('Preencha os dados do administrador:');
    log.info('(ou use --nome= --email= --senha= --nomeLoja= --slug=)');
    log.linha();

    // ── Coletar dados ──────────────────────────────────────────────────────

    // Nome
    let nome = args.nome?.trim();
    if (!nome) nome = (await prompt(rl, 'Nome completo: ')).trim();
    if (!nome || nome.length < 2) {
      log.erro('Nome deve ter ao menos 2 caracteres.'); process.exit(1);
    }
    nome = nome.slice(0, 100);

    // Email
    let email = args.email?.trim().toLowerCase();
    if (!email) email = (await prompt(rl, 'Email: ')).trim().toLowerCase();
    if (!validarEmail(email)) {
      log.erro(`Email inválido: ${email}`); process.exit(1);
    }

    // Senha — NUNCA logada
    let senha = args.senha;
    if (!senha) senha = await prompt(rl, 'Senha (mín. 8 chars, 1 maiúscula, 1 número): ', true);
    const errSenha = validarSenha(senha);
    if (errSenha) {
      log.erro(`Senha inválida: ${errSenha}`); process.exit(1);
    }

    // Nome da loja
    let nomeLoja = args.nomeLoja?.trim();
    if (!nomeLoja) nomeLoja = (await prompt(rl, 'Nome da loja: ')).trim();
    if (!nomeLoja || nomeLoja.length < 2) {
      log.erro('Nome da loja deve ter ao menos 2 caracteres.'); process.exit(1);
    }
    nomeLoja = nomeLoja.slice(0, 100);

    // Slug
    let slug = args.slug?.trim().toLowerCase();
    if (!slug) {
      const slugSugerido = slugify(nomeLoja);
      const resposta = (await prompt(rl, `Slug da loja [${slugSugerido}]: `)).trim().toLowerCase();
      slug = resposta || slugSugerido;
    }
    slug = slugify(slug);
    if (!slug || slug.length < 2) {
      log.erro('Slug inválido. Use apenas letras, números e hífens.'); process.exit(1);
    }

    rl.close();

    // ── Verificações de duplicidade ────────────────────────────────────────
    log.linha();
    log.info('Verificando duplicidades...');

    const [emailExistente, slugExistente] = await Promise.all([
      SoftAdmin.findOne({ email }).lean(),
      SoftAdmin.findOne({ slug  }).lean(),
    ]);

    if (emailExistente) {
      log.warn(`Admin com email ${email} já existe (id: ${emailExistente._id}).`);
      log.warn('Nenhum dado foi alterado. Idempotência garantida.');
      await mongoose.disconnect();
      process.exit(0);
    }

    if (slugExistente) {
      log.erro(`Slug "${slug}" já está em uso por: ${slugExistente.nomeLoja}`);
      log.info('Tente um slug diferente com --slug=outro-slug');
      await mongoose.disconnect();
      process.exit(1);
    }

    // ── Criar admin ────────────────────────────────────────────────────────
    log.linha();
    log.info('Criando SoftAdmin...');
    log.info(`  Nome:      ${nome}`);
    log.info(`  Email:     ${email}`);
    log.info(`  Loja:      ${nomeLoja}`);
    log.info(`  Slug:      ${slug}`);
    log.info(`  Senha:     ${'*'.repeat(senha.length)} (hash bcrypt, nunca armazenada em texto)`);

    const senhaHash = await bcrypt.hash(senha, 12);

    const admin = await SoftAdmin.create({
      nome,
      email,
      senhaHash,
      slug,
      nomeLoja,
      telefone:    '',
      logo:        '',
      corPrimaria: '#6366f1',
      plano:       'starter',
      ativo:       true,
    });

    log.linha();
    log.ok('SoftAdmin criado com sucesso!');
    log.ok(`  ID:        ${admin._id}`);
    log.ok(`  Email:     ${admin.email}`);
    log.ok(`  Loja:      ${admin.nomeLoja}`);
    log.ok(`  Slug:      ${admin.slug}`);
    log.ok(`  Plano:     ${admin.plano}`);
    log.ok(`  Criado em: ${admin.createdAt.toLocaleString('pt-BR')}`);
    log.linha();
    log.info('Próximo passo: faça login em /api/soft/auth/login com as credenciais acima.');
    log.info('Guarde a senha em local seguro — ela não pode ser recuperada.');
    log.linha();

  } catch (e) {
    rl.close();
    log.erro(`Erro inesperado: ${e.message}`);
    if (process.env.NODE_ENV !== 'production') console.error(e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log.info('Conexão encerrada.');
  }
}

main();
