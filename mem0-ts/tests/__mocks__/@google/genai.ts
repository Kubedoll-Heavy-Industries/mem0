// Mock for @google/genai to avoid Node.js compatibility issues in tests
export class GoogleGenAI {
  constructor() {}
  getGenerativeModel() {
    return {
      generateContent: async () => ({ response: { text: () => "" } }),
    };
  }
}

export default { GoogleGenAI };
