import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function main() {
  const models = await ai.models.list();
  const allNames: string[] = [];
  for await (const m of models) {
    allNames.push(m.name);
  }
  console.log('All available models:');
  console.log(JSON.stringify(allNames, null, 2));

  // Test generateContent with gemini-3.8-flash
  console.log('\nTesting generateContent with gemini-3.8-flash:');
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Say hello in 5 words',
    });
    console.log('gemini-3.8-flash response:', res.text?.trim());
  } catch (err: any) {
    console.error('Error with gemini-3.8-flash:', err.message || err);
  }
}

main();

