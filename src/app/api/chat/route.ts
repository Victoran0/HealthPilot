import {
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { UIMessage, UIMessageStreamWriter } from "ai";
import { HumanMessage } from "@langchain/core/messages";
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

  // We only ever feed the graph the NEWEST message — the checkpointer holds H_{t-1},
  // askedQuestions and round. So there's no need to map the whole array; build one
  // proper HumanMessage. This also fixes two type errors from the old object-literal
  // mapping: `.at(-1)` is `T | undefined`, and a `{ role, content }` literal is not a
  // `BaseMessage`, which is what graph.streamEvents' input type demands.
  const lastUi = messages.at(-1);
  const text =
    lastUi?.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";

  const additional_kwargs: Record<string, unknown> = {};
  if (xrayImageUrl) additional_kwargs.xrayImageUrl = xrayImageUrl;
  if (ehrRecord) additional_kwargs.ehrRecord = ehrRecord;

  const inputMessage = new HumanMessage({ content: text, additional_kwargs });

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
            { messages: [inputMessage] },
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
          // Fail loud, never reassuring. This is the backstop for anything the
          // individual nodes didn't catch (e.g. the analyser, triage, or a graph-level
          // failure). The evidence nodes now degrade internally, so a RAG/EHR/imaging
          // outage no longer reaches here — but if something else breaks, the patient
          // still gets a clear, safe message instead of silence.
          try {
            writer.write({
              type: "text-delta",
              id: textStreamId,
              delta:
                "Sorry — something went wrong on my side and I couldn't finish assessing your symptoms. " +
                "Please don't take that as reassurance. If you're worried about your symptoms right now, " +
                "contact NHS 111 (call 111 or go to 111.nhs.uk), or call 999 if it feels like an emergency.",
            });
          } catch (writeErr) {
            // The stream itself is broken — nothing more we can do but log.
            console.error("[HealthPilot] failed to write error message to stream:", writeErr);
          }
        } finally {
          // Every write below is guarded: a failure in the finally must NOT swallow the
          // sorry message the catch already queued.
          try {
            writer.write({ type: "text-end", id: textStreamId });
          } catch {
            /* stream already closed */
          }

          try {
            const graphState = await graph.getState({configurable: {thread_id: consultId }});
            console.log(
              "[HealthPilot] round:",
              graphState.values.round,
              "| urgency:",
              graphState.values.triage?.urgency,
            );
          } catch (stateErr) {
            console.error("[HealthPilot] could not read final graph state:", stateErr);
          } finally {
            const graphState = await graph.getState({configurable: {thread_id: consultId }} )
            console.log('The current state of the graph:\n', graphState);
          }
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