import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing key prefix:', apiKey ? apiKey.substring(0, 8) + '...' : 'none');

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    console.log('\n--- 1. Testing models.list ---');
    const models = await ai.models.list();
    console.log('Available models count:');
    let liveCandidates = [];
    for await (const m of models) {
      if (m.name.includes('gemini') || m.name.includes('live')) {
        liveCandidates.push(m.name);
      }
    }
    console.log('Found model names:', liveCandidates.slice(0, 15));
  } catch (err) {
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
      } catch (e) {
        console.log(`Failed with ${model}:`, e.message || e);
      }
    }
  } catch (err) {
    console.error('generateContent test error:', err.message || err);
  }
}

main();

