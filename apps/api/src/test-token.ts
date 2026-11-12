import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });

async function main() {
  console.log('Testing ai.authTokens.create with apiVersion v1alpha...');
  try {
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      },
    });
    console.log('Successfully minted ephemeral token:', token.name);
  } catch (err: any) {
    console.error('authTokens.create error:', err.message || err);
  }
}

main();

