import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

async function testLiveModel(modelName: string) {
  console.log(`\nTesting Live connection with model: ${modelName}...`);
  return new Promise((resolve) => {
    let connected = false;
    let timeout = setTimeout(() => {
      console.log(`Timeout on model ${modelName}`);
      resolve(false);
    }, 10000);

    ai.live.connect({
      model: modelName,
      callbacks: {
        onopen: () => {
          console.log(`[onopen] Connected to ${modelName}!`);
          connected = true;
        },
        onmessage: (msg: any) => {
          console.log(`[onmessage] Received msg from ${modelName}:`, Object.keys(msg));
          clearTimeout(timeout);
          resolve(true);
        },
        onerror: (err: any) => {
          console.log(`[onerror] Error with ${modelName}:`, err.message || err);
          clearTimeout(timeout);
          resolve(false);
        },
        onclose: (e: any) => {
          console.log(`[onclose] Closed with ${modelName}:`, e.code, e.reason);
          clearTimeout(timeout);
          resolve(connected);
        },
      },
      config: {
        responseModalities: ['AUDIO'],
      },
    }).then((session) => {
      console.log(`Session established with ${modelName}`);
      setTimeout(() => {
        try {
          session.close();
        } catch {}
      }, 3000);
    }).catch((err) => {
      console.log(`Failed to initiate connect with ${modelName}:`, err.message || err);
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function main() {
  const candidates = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.0-flash-exp'];
  for (const m of candidates) {
    const success = await testLiveModel(m);
    if (success) {
      console.log(`\n>>> Live API model confirmed: ${m} <<<`);
      break;
    }
  }
}

main();

