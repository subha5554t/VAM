import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function main() {
  const models = await ai.models.list();
  console.log('Checking supportedGenerationMethods for all models:');
  const bidiModels: any[] = [];
  for await (const m of models) {
    const methods = m.supportedGenerationMethods || [];
    if (methods.some((method: string) => method.toLowerCase().includes('bidi') || method.toLowerCase().includes('live'))) {
      bidiModels.push({ name: m.name, methods });
    }
    console.log(`- ${m.name}: ${methods.join(', ')}`);
  }
  console.log('\n=== Models supporting BIDI / LIVE ===');
  console.log(JSON.stringify(bidiModels, null, 2));
}

main();

