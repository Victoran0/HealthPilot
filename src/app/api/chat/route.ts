// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4o'), // Or your preferred model
    system: `You are HealthPilot, an advanced multimodal AI for clinical triage. 
    Your goal is to assess patient symptoms, ask relevant follow-up questions, and determine triage acuity. 
    Be professional, empathetic, and concise. Always clarify that you are an AI and in an emergency, they should call their local emergency number.`,
    messages,
  });

  return result.toDataStreamResponse();
}