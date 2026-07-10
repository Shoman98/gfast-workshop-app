import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI('AQ.Ab8RN6JTZSITtPe4d2pD1JX0OXfbdhbwZIoGO0W_NZU7MFbCCA');

console.log('Testing available models...\n');

const modelsToTry = ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision'];

for (const modelName of modelsToTry) {
  try {
    console.log(`Trying ${modelName}...`);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('test');
    console.log(`✅ ${modelName} WORKS!\n`);
  } catch (e) {
    console.log(`❌ ${modelName}: ${e.message.substring(0, 120)}\n`);
  }
}
