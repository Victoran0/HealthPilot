import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { UIMessage, UIMessageStreamWriter } from "ai";
import { graph } from "@/server/ai/agent";

export const maxDuration = 300; // MedGemma-27B is not a 30s job

export async function POST(req: Request) {
  const {
    messages,
    consultId,
    xrayImageUrl,
    ehrRecord,
  }: {
    messages: UIMessage[];
    consultId: string;
    xrayImageUrl?: string;
    ehrRecord?: Record<string, unknown>;
  } = await req.json();

  // Same mapping as your study project — artefacts ride on additional_kwargs of the
  // last message, exactly where `persona` and `document` do.
  const langChainMessages = messages.map((msg, i) => {
    const isLast = i === messages.length - 1;
    return {
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.parts.filter((p) => p.type === "text").map((p) => p.text).join(""),
      ...(isLast ? { additional_kwargs: { xrayImageUrl, ehrRecord } } : {}),
    };
  });

  const config = { version: "v2" as const, configurable: { thread_id: consultId } };

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }: { writer: UIMessageStreamWriter }): Promise<void> => {
        const textStreamId = "agent-response";
        writer.write({ type: "text-start", id: textStreamId });

        try {
          // Only the newest message goes in. The checkpointer holds H_{t-1},
          // askedQuestions and round — this is a resumed conversation, not a new one.
          const eventStream = await graph.streamEvents(
            { messages: [langChainMessages.at(-1)] },
            config,
          );

          for await (const event of eventStream) {
            /* -- A. Streaming text: ONLY the tagged triage call. ----------------- */
            // Your study route streams every on_chat_model_stream. Here that would leak
            // the Recipient's and Inquirer's structured-output tokens into the bubble.
            // With Groq tool-calling those chunks usually have empty `content`, so it
            // *looks* fine — right up until one of them falls back to JSON mode and the
            // patient watches raw HPI JSON type itself out. Allow-list instead.
            if (
              event.event === "on_chat_model_stream" &&
              event.tags?.includes("patient_facing")
            ) {
              const chunk = event.data.chunk;
              if (chunk?.content && typeof chunk.content === "string") {
                writer.write({ type: "text-delta", id: textStreamId, delta: chunk.content });
              }
            }

            /* -- B. Structured output, lifted from on_chain_end. ------------------ */
            // This is your mcqNode pattern, applied four times.

            // Inquirer's question. Not streamed (it's a structured-output invoke), so we
            // write it as one delta — same as you do for the MCQ JSON.
            if (event.event === "on_chain_end" && event.name === "inquirerNode") {
              const out = event.data.output;
              const question = out?.messages?.[0]?.content as string;
              const requests = out?.messages?.[0]?.additional_kwargs?.requests as string[];

              if (typeof question === "string" && question) {
                writer.write({ type: "text-delta", id: textStreamId, delta: question });
              }
              // Separate data part so the client can render an X-ray upload widget
              // rather than hoping the patient parses "please upload your X-ray".
              if (requests?.length) {
                writer.write({ type: "data-artefact-request", id: "artefacts", data: { requests } });
              }
            }

            // HPI: powers the "what I've understood so far" sidebar.
            if (event.event === "on_chain_end" && event.name === "recipientNode") {
              const hpi = event.data.output?.hpi;
              if (hpi) writer.write({ type: "data-hpi", id: "hpi", data: hpi });
            }

            // Evidence nodes.
            if (event.event === "on_chain_end" && ["chestVision", "ehr", "rag"].includes(event.name)) {
              const out = event.data.output ?? {};
              const payload = out.imaging ?? out.ehr ?? out.rag;
              if (payload) {
                writer.write({ type: `data-${event.name}`, id: event.name, data: payload });
              }
            }

            // Analysis (MedGemma). Clinician-facing — render collapsed, or not at all.
            if (event.event === "on_chain_end" && event.name === "analyserNode") {
              const analysis = event.data.output?.analysis;
              if (analysis) writer.write({ type: "data-analysis", id: "analysis", data: analysis });
            }

            // THE decision. Note this fires at triageNode's on_chain_end — i.e. AFTER the
            // prose has streamed. If you want the red 999 banner to paint first (you do),
            // emit urgency from inside triageNode via dispatchCustomEvent before the LLM
            // call, and catch it here as on_custom_event.
            if (event.event === "on_chain_end" && event.name === "triageNode") {
              const triage = event.data.output?.triage;
              if (triage) {
                writer.write({ type: "data-triage", id: "triage", data: triage });
                if (triage.overriddenByRules) {
                  console.warn("[SAFETY OVERRIDE]", triage.overrideReason);
                }
              }
            }

            /* -- C. Progress ticker. ---------------------------------------------- */
            if (event.event === "on_chain_start" && NODE_LABELS[event.name]) {
              writer.write({
                type: "data-status",
                id: "status",
                data: { node: event.name, label: NODE_LABELS[event.name] },
                transient: true,
              });
            }
          }
        } catch (error) {
          console.error("HealthPilot Streaming Error:", error);
          // Fail loud. Never fail reassuring.
          writer.write({
            type: "text-delta",
            id: textStreamId,
            delta:
              "\n\nSomething went wrong and I couldn't finish assessing your symptoms. " +
              "Please don't read that as reassurance — if you're worried right now, call NHS 111, " +
              "or 999 if it feels like an emergency.",
          });
        } finally {
          writer.write({ type: "text-end", id: textStreamId });

          const graphState = await graph.getState(config);
          console.log("[HealthPilot] round:", graphState.values.round, "| urgency:", graphState.values.triage?.urgency);
        }
      },
    }),
  });
}

const NODE_LABELS: Record<string, string> = {
  recipientNode: "Understanding your symptoms…",
  inquirerNode: "Working out what else to ask…",
  chestVision: "Reading your chest X-ray…",
  ehr: "Reviewing your medical history…",
  rag: "Checking medical references…",
  analyserNode: "Thinking through the possibilities…",
  triageNode: "Deciding what you should do next…",
};
