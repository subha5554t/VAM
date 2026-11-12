import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt } from '@kam/core';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const scenariosPath = path.resolve(process.cwd(), '../../data/scenarios.json');
const raw = fs.readFileSync(scenariosPath, 'utf-8');
const { scenarios } = JSON.parse(raw);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Cannot run LLM evals.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

console.log(`\n======================================================`);
console.log(` SNAPDEAL VOICE KAM EVALUATION SUITE (Sample Scenarios)`);
console.log(` Candidates: ${candidateModels.join(', ')}`);
console.log(`======================================================\n`);

async function generateWithFallback(contents: string): Promise<string> {
  let lastError: any = null;
  for (const model of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
      });
      return res.text?.trim() || '';
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('503') || err.message?.includes('404')) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function runScenario(scenario: any) {
  console.log(`\n▶ [${scenario.id}] ${scenario.title} (${scenario.language})`);
  const systemPrompt = buildSystemPrompt({
    language: scenario.language,
    mode: scenario.id === 'T20' ? 'proactive' : 'reactive',
  });

  let conversationHistory: Array<{ role: 'user' | 'model'; text: string }> = [];

  for (const turn of scenario.sellerTurns) {
    conversationHistory.push({ role: 'user', text: turn });

    const contents = `${systemPrompt}\n\nConversation so far:\n${conversationHistory
      .map(m => `${m.role === 'user' ? 'Seller' : 'Asha'}: ${m.text}`)
      .join('\n')}\n\nAsha:`;

    try {
      const reply = await generateWithFallback(contents);
      conversationHistory.push({ role: 'model', text: reply });
      console.log(`   Seller: "${turn}"`);
      console.log(`   Asha:   "${reply.slice(0, 110)}${reply.length > 110 ? '...' : ''}"`);
    } catch (err: any) {
      console.error(`   Error in turn:`, err.message || err);
      return { id: scenario.id, title: scenario.title, passed: false, reason: err.message };
    }
  }

  return { id: scenario.id, title: scenario.title, passed: true };
}

async function main() {
  const evalSubset = scenarios.filter((s: any) => ['T01', 'T02', 'T04', 'T14', 'T17'].includes(s.id));
  const results = [];

  for (const s of evalSubset) {
    const r = await runScenario(s);
    results.push(r);
    await new Promise(res => setTimeout(res, 800));
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
