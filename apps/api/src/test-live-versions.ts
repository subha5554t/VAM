import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function testCombination(model: string, apiVersion: string) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
  return new Promise((resolve) => {
    let timer = setTimeout(() => {
      console.log(`[${model} @ ${apiVersion}] Timeout (10s)`);
      resolve(false);
    }, 8000);

    ai.live.connect({
      model,
      callbacks: {
        onopen: () => {
          console.log(`[${model} @ ${apiVersion}] OPEN!`);
        },
        onmessage: (m) => {
          console.log(`[${model} @ ${apiVersion}] MSG received:`, Object.keys(m));
          clearTimeout(timer);
          resolve(true);
        },
        onerror: (err: any) => {
          console.log(`[${model} @ ${apiVersion}] ERROR:`, err.message || err);
          clearTimeout(timer);
          resolve(false);
        },
        onclose: (e) => {
          console.log(`[${model} @ ${apiVersion}] CLOSE: code=${e.code}, reason=${e.reason}`);
          clearTimeout(timer);
          resolve(false);
        },
      },
      config: {
        responseModalities: ['AUDIO'],
      },
    }).catch((err) => {
      console.log(`[${model} @ ${apiVersion}] CATCH:`, err.message || err);
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main() {
  const models = [
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-realtime-exp',
    'gemini-omni-flash-preview',
    'gemini-3.8-live',
    'gemini-3.8-flash',
  ];
  const versions = ['v1beta', 'v1alpha'];

  for (const v of versions) {
    for (const m of models) {
      console.log(`\n--> Testing ${m} on ${v}...`);
      const ok = await testCombination(m, v);
      if (ok) {
        console.log(`\n🎉 FOUND WORKING LIVE MODEL: ${m} on ${v} 🎉`);
        return;
      }
    }
  }
}

main();

