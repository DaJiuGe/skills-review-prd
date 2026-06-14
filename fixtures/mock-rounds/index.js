/**
 * @fileoverview Mock round data loader for `--mock` mode.
 *
 * Loads the four fixed JSON fixtures used by the CLI when `--mock` is passed.
 * These rounds are pre-computed and schema-valid; the runner no longer calls
 * any LLM itself.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load the four mock round JSON files.
 * @returns {Promise<{round1:any, round2:any, round3:any, round4:any}>}
 */
export async function loadMockRounds() {
  const [round1, round2, round3, round4] = await Promise.all([
    fs.readFile(path.join(__dirname, 'round-1.json'), 'utf-8'),
    fs.readFile(path.join(__dirname, 'round-2.json'), 'utf-8'),
    fs.readFile(path.join(__dirname, 'round-3.json'), 'utf-8'),
    fs.readFile(path.join(__dirname, 'round-4.json'), 'utf-8'),
  ]);

  return {
    round1: JSON.parse(round1),
    round2: JSON.parse(round2),
    round3: JSON.parse(round3),
    round4: JSON.parse(round4),
  };
}
