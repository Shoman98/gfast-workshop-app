import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI('AQ.Ab8RN6JTZSITtPe4d2pD1JX0OXfbdhbwZIoGO0W_NZU7MFbCCA');

console.log('Testing model names...\n');

const modelsToTry = [
  'gemini-3-flash',
  'gemini-3.0-flash',
  'models/gemini-3-flash',
  'models/gemini-3.0-flash',
  'gemini-3.5-flash',
  'gemini-exp-3-flash',
];

for (const modelName of modelsToTry) {
  try {
    console.log(`Trying: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('test');
    console.log(`✅ ${modelName} WORKS!\n`);
  } catch (e) {
    const msg = e.message;
    if (msg.includes('not found')) {
      console.log(`❌ Not found: ${modelName}`);
    } else if (msg.includes('currently unavailable')) {
      console.log(`⚠️  Unavailable (rate limited?): ${modelName}`);
    } else {
      console.log(`❌ Error: ${modelName}`);
    }
  }
}
