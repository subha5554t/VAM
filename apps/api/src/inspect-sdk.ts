import { GoogleGenAI } from '@google/genai';

console.log('GoogleGenAI keys:', Object.getOwnPropertyNames(GoogleGenAI.prototype));
const ai = new GoogleGenAI({ apiKey: 'dummy' });
console.log('ai instance keys:', Object.keys(ai));
if (ai.live) {
  console.log('ai.live keys:', Object.keys(ai.live), Object.getOwnPropertyNames(Object.getPrototypeOf(ai.live)));
}
if (ai.authTokens) {
  console.log('ai.authTokens keys:', Object.keys(ai.authTokens), Object.getOwnPropertyNames(Object.getPrototypeOf(ai.authTokens)));
}

