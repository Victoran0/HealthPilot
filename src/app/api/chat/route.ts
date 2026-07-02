import { groq } from "@ai-sdk/groq";
import { convertToModelMessages, streamText, createUIMessageStreamResponse, createUIMessageStream } from 'ai';
import type { UIMessage } from 'ai';
import type { UIMessageStreamWriter } from "ai";
import { graph } from "@/server/ai/agent";

export const maxDuration = 30;

export async function POST(req: Request) {
    const { messages, docContent, persona, studyId }: { messages: UIMessage[], docContent: string, persona: string, studyId: string } = await req.json();

    const langChainMessages = messages.map((msg, index) => {
        const isLast = index === messages.length - 1;
        return {
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.parts.filter((p) => p.type === 'text').map((p) => p.text).join(''),
            ...(isLast ? { additional_kwargs: { persona, document: docContent } } : {})
        };
    });


    return createUIMessageStreamResponse({
        stream: createUIMessageStream({
            // 2. Explicitly type the destructured argument and the return type
            execute: async ({ writer }: { writer: UIMessageStreamWriter }): Promise<void> => {
                const textStreamId = 'agent-response';

                writer.write({
                    type: 'text-start',
                    id: textStreamId,
                });

                try {
                    const eventStream = await graph.streamEvents({
                        messages: langChainMessages
                    }, { version: "v2" , configurable: {thread_id: studyId }} );

                    for await (const event of eventStream) {
                        // --- SCENARIO A: Streaming Text ---
                        if (event.event === "on_chat_model_stream") {
                            const chunk = event.data.chunk;
                            
                            // 3. Strictly check typeof to satisfy TypeScript that delta is a string
                            if (chunk?.content && typeof chunk.content === "string") {
                                writer.write({
                                    type: 'text-delta',
                                    id: textStreamId,
                                    delta: chunk.content,
                                });
                            }
                        }

                        // --- SCENARIO B: Structured Output ---
                        if (event.event === "on_chain_end" && event.name === "mcqNode") {
                            const stateUpdate = event.data.output;
                            
                            // 4. Explicitly cast to string. LangChain types this loosely, 
                            // which makes the AI SDK writer complain.
                            const finalContent = stateUpdate?.messages?.[0]?.content as string;
                            
                            if (finalContent && typeof finalContent === "string") {
                                writer.write({
                                    type: 'text-delta',
                                    id: textStreamId,
                                    delta: finalContent,
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error("Agent Streaming Error:", error);
                } finally {
                    writer.write({
                        type: 'text-end',
                        id: textStreamId,
                    });
                    const graphState = await graph.getState({configurable: {thread_id: studyId }} )
                    console.log('The current state of the graph:\n', graphState);
                }
            }
        })
    });
}