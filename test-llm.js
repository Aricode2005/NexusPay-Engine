import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
dotenv.config();

const llm = new ChatOpenAI({
  modelName: "Qwen/Qwen2.5-7B-Instruct",
  apiKey: process.env.HUGGINGFACE_API_KEY,
  configuration: {
    baseURL: "https://router.huggingface.co/hf-inference/v1/",
  },
  maxRetries: 0,
  temperature: 0,
});

async function run() {
  try {
    console.log("Calling model...");
    const response = await llm.invoke("Hello, how are you?");
    console.log("Response:", response.content);
  } catch (error) {
    console.error("Error full:", error);
  }
}
run();
