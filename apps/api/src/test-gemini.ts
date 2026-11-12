import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback to current dir

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing key prefix:', apiKey ? apiKey.substring(0, 8) + '...' : 'none');

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    console.log('\n--- 1. Testing models.list ---');
    const models = await ai.models.list();
    console.log('Fetching models...');
    let liveCandidates: string[] = [];
    for await (const m of models) {
      if (m.name && (m.name.includes('gemini') || m.name.includes('live'))) {
        liveCandidates.push(m.name);
      }
    }
    console.log('Found model names:', liveCandidates.slice(0, 15));
  } catch (err: any) {
    console.error('models.list error:', err.message || err);
  }

  try {
    console.log('\n--- 2. Testing generateContent ---');
    const testModels = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    for (const model of testModels) {
      try {
        console.log(`Trying model: ${model}...`);
        const response = await ai.models.generateContent({
          model,
          contents: 'Say hello in 5 words',
        });
        console.log(`Success with ${model}:`, response.text?.trim());
        break;
      } catch (e: any) {
        console.log(`Failed with ${model}:`, e.message || e);
      }
    }
  } catch (err: any) {
    console.error('generateContent test error:', err.message || err);
  }
}

main();

