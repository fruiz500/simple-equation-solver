// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Reads the examples (CODE) and their published result tables from help.html.
import fs from 'fs';
import path from 'path';
import { APP } from './engine.mjs';

const html = fs.readFileSync(path.join(APP, 'help.html'), 'utf8');
// CODE: the code of each example, as the page builds it (the text of its <pre><code>), with the entities decoded
const decode = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const CODE = Object.fromEntries([...html.matchAll(/<div class="example item" id="([\w-]+)"[^>]*>.*?<pre><code>(.*?)<\/code><\/pre>/gs)].map(m => [m[1], decode(m[2])]));

// Published rows [name, value, unit] of example id, as shown in its result table.
export function published(id) {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) throw new Error('no example ' + id);
  const tbl = html.slice(start).match(/<table class="res">(.*?)<\/table>/s)[1];
  const strip = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return [...tbl.matchAll(/<tr>(.*?)<\/tr>/gs)].map(m => [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(c => strip(c[1])));
}

// Display format of the results table (7 significant digits, exponent below 1e-3).
export function fmt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  if (v !== 0 && Math.abs(v) < 1e-3) return v.toExponential(5);
  return String(+v.toPrecision(7));
}
