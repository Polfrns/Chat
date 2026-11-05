#!/usr/bin/env node
/**
 * Lista qué es de Roko y qué cambia Roko dentro de LibreChat, frente a la base de UPSTREAM-BASE.
 * Sustituye al antiguo MODIFIED-FILES.json, que había que mantener a mano.
 *
 *   node scripts/roko-surface.cjs              resumen por áreas
 *   node scripts/roko-surface.cjs --list       además, todos los ficheros
 *   node scripts/roko-surface.cjs --json       salida estructurada
 *
 * «Propios» son los ficheros que no existen en upstream (los añadió Roko). «Modificados» son los
 * de upstream que Roko cambia: cada uno es un posible conflicto en la próxima actualización.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {{ status: 'A' | 'M' | 'D', path: string }} Change
 * @typedef {{ owned: string[], modified: string[], removed: string[] }} Surface
 * @typedef {{ repo: string, tag: string, commit: string }} UpstreamBase
 */

/** Ruido que no es superficie de código: dependencias, traducciones, documentación e infraestructura. */
const IGNORED = [
  /^package-lock\.json$/,
  /^bun\.lock$/,
  /^client\/src\/locales\//,
  /\.md$/,
  /^\.github\//,
  /^helm\//,
  /^scratchpad\//,
];

const TEST_FILE = /(\.(spec|test)\.[cm]?[jt]sx?$)|(\/__tests__\/)/;

/** @param {string} filePath */
function isTest(filePath) {
  return TEST_FILE.test(filePath);
}

/**
 * Lee la salida de `git diff --name-status --no-renames`.
 * @param {string} output
 * @returns {Change[]}
 */
function parseNameStatus(output) {
  /** @type {Change[]} */
  const changes = [];
  for (const line of output.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const [status, ...rest] = line.split('\t');
    const filePath = rest.join('\t');
    if (!['A', 'M', 'D'].includes(status) || filePath === '') {
      throw new Error(`Línea de git no reconocida: ${JSON.stringify(line)}`);
    }
    changes.push({ status: /** @type {Change['status']} */ (status), path: filePath });
  }
  return changes;
}

/**
 * @param {Change[]} changes
 * @returns {Surface}
 */
function classify(changes) {
  /** @type {Surface} */
  const surface = { owned: [], modified: [], removed: [] };
  const bucketByStatus = { A: surface.owned, M: surface.modified, D: surface.removed };
  for (const { status, path: filePath } of changes) {
    if (IGNORED.some((pattern) => pattern.test(filePath))) {
      continue;
    }
    bucketByStatus[status].push(filePath);
  }
  for (const bucket of Object.values(surface)) {
    bucket.sort();
  }
  return surface;
}

/**
 * Agrupa por área (los dos primeros segmentos de la ruta) y separa código de tests.
 * @param {string[]} files
 * @returns {Array<{ area: string, source: number, tests: number }>}
 */
function summarizeByArea(files) {
  /** @type {Map<string, { source: number, tests: number }>} */
  const areas = new Map();
  for (const file of files) {
    const segments = file.split('/');
    const area = segments.length > 2 ? segments.slice(0, 2).join('/') : segments[0];
    const entry = areas.get(area) ?? { source: 0, tests: 0 };
    entry[isTest(file) ? 'tests' : 'source'] += 1;
    areas.set(area, entry);
  }
  return [...areas]
    .map(([area, counts]) => ({ area, ...counts }))
    .sort((a, b) => b.source + b.tests - (a.source + a.tests) || a.area.localeCompare(b.area));
}

/**
 * @param {string} text contenido de UPSTREAM-BASE
 * @returns {UpstreamBase}
 */
function parseUpstreamBase(text) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) {
      values[match[1]] = match[2];
    }
  }
  for (const key of ['UPSTREAM_REPO', 'UPSTREAM_TAG', 'UPSTREAM_COMMIT']) {
    if (!values[key]) {
      throw new Error(`UPSTREAM-BASE no define ${key}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(values.UPSTREAM_COMMIT)) {
    throw new Error('UPSTREAM_COMMIT debe ser un hash completo de 40 caracteres');
  }
  return { repo: values.UPSTREAM_REPO, tag: values.UPSTREAM_TAG, commit: values.UPSTREAM_COMMIT };
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  const base = parseUpstreamBase(fs.readFileSync(path.join(root, 'UPSTREAM-BASE'), 'utf8'));
  try {
    git(['cat-file', '-e', `${base.commit}^{commit}`]);
  } catch {
    console.error(
      `Falta el commit ${base.commit} (${base.tag}) en este clon. Tráelo con:\n` +
        `  git fetch ${base.repo} tag ${base.tag} --no-tags`,
    );
    process.exit(2);
  }
  const surface = classify(parseNameStatus(git(['diff', '--name-status', '--no-renames', base.commit, 'HEAD'])));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ base, ...surface }, null, 2));
    return;
  }
  console.log(`Base de upstream: ${base.tag} (${base.commit.slice(0, 9)})\n`);
  for (const [label, files] of [
    ['Propios de Roko (no existen en upstream)', surface.owned],
    ['De upstream modificados por Roko (posible conflicto al actualizar)', surface.modified],
    ['De upstream eliminados por Roko', surface.removed],
  ]) {
    const total = /** @type {string[]} */ (files);
    console.log(`${label}: ${total.length} ficheros (${total.filter(isTest).length} de tests)`);
    for (const { area, source, tests } of summarizeByArea(total).slice(0, 12)) {
      console.log(`  ${String(source).padStart(4)} código ${String(tests).padStart(4)} tests  ${area}`);
    }
    if (process.argv.includes('--list')) {
      total.forEach((file) => console.log(`    ${file}`));
    }
    console.log('');
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseNameStatus, classify, summarizeByArea, parseUpstreamBase, isTest };
