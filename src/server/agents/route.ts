import { NextRequest } from "next/server";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { healthPilotGraph } from "@/lib/agents/graph";

export const runtime = "nodejs";
export const maxDuration = 300; // MedGemma-27B is not fast

interface ConsultBody {
  threadId: string;
  message: string;
  /** true when the patient is answering an InquirerAgent question (graph is interrupted). */
  resuming?: boolean;
  xrayImageUrl?: string;
  ehrRecord?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ConsultBody;
  const config = {
    configurable: { thread_id: body.threadId },
    streamMode: "updates" as const,
  };

  // Resuming an interrupt vs. starting/continuing normally
  const input = body.resuming
    ? new Command({ resume: body.message })
    : {
        messages: [new HumanMessage(body.message)],
        ...(body.xrayImageUrl ? { xrayImageUrl: body.xrayImageUrl } : {}),
        ...(body.ehrRecord ? { ehrRecord: body.ehrRecord } : {}),
      };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );

      try {
        for await (const chunk of await healthPilotGraph.stream(input, config)) {
          for (const [node, update] of Object.entries(chunk)) {
            // Surface each agent's progress so the UI can show "Reading your X-ray..." etc.
            send("node", { node, update });
          }
        }

        // After the stream drains, check whether we stopped on an interrupt.
        const snapshot = await healthPilotGraph.getState(config);
        const pending = snapshot.tasks?.[0]?.interrupts?.[0]?.value;

        if (pending) {
          send("question", pending); // { question, requests }
        } else {
          send("triage", snapshot.values.triage);
          send("done", { threadId: body.threadId });
        }
      } catch (err) {
        send("error", { message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
