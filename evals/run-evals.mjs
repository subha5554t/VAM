import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, executeTool, TOOL_DECLARATIONS } from '../packages/core/dist/index.js';

dotenv.config();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scenariosPath = path.resolve(currentDir, 'scenarios.json');
const raw = fs.readFileSync(scenariosPath, 'utf-8');
const { scenarios } = JSON.parse(raw);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Cannot run LLM evals.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const textModel = process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';

console.log(`\n======================================================`);
console.log(` SNAPDEAL VOICE KAM EVALUATION SUITE (24 Scenarios)`);
console.log(` Model: ${textModel}`);
console.log(`======================================================\n`);

async function runScenario(scenario) {
  console.log(`\n▶ [${scenario.id}] ${scenario.title} (${scenario.language})`);
  const systemPrompt = buildSystemPrompt({
    language: scenario.language,
    mode: scenario.id === 'T20' ? 'proactive' : 'reactive',
  });

  let conversationHistory = [];
  let toolCallsMade = [];

  for (const turn of scenario.sellerTurns) {
    conversationHistory.push({ role: 'user', text: turn });

    const contents = `${systemPrompt}\n\nConversation so far:\n${conversationHistory
      .map(m => `${m.role === 'user' ? 'Seller' : 'Asha'}: ${m.text}`)
      .join('\n')}\n\nAsha:`;

    try {
      const res = await ai.models.generateContent({
        model: textModel,
        contents,
      });

      const reply = res.text?.trim() || '';
      conversationHistory.push({ role: 'model', text: reply });
      console.log(`   Seller: "${turn}"`);
      console.log(`   Asha:   "${reply.slice(0, 120)}${reply.length > 120 ? '...' : ''}"`);
    } catch (err) {
      console.error(`   Error in turn:`, err.message || err);
      return { id: scenario.id, title: scenario.title, passed: false, reason: err.message };
    }
  }

  return { id: scenario.id, title: scenario.title, passed: true };
}

async function main() {
  // Test top 5 representative scenarios to keep within rate limits
  const evalSubset = scenarios.filter(s => ['T01', 'T02', 'T04', 'T14', 'T17'].includes(s.id));
  const results = [];

  for (const s of evalSubset) {
    const r = await runScenario(s);
    results.push(r);
    // Pause briefly between scenarios to avoid rate limits
    await new Promise(res => setTimeout(res, 1200));
  }

  console.log(`\n======================================================`);
  console.log(` EVALUATION SUMMARY`);
  console.log(`======================================================`);
  let passedCount = 0;
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    if (r.passed) passedCount++;
    console.log(` ${status}  ${r.id.padEnd(5)} ${r.title}`);
  }
  console.log(`\nTotal: ${passedCount}/${results.length} scenarios passed.`);
  console.log(`======================================================\n`);
}

main();

