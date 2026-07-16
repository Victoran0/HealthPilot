/**
 * scripts/ingest-encyclopaedia.ts
 *
 * Run ONCE, locally, NOT on Vercel:
 *   npx tsx --env-file=.env.local scripts/ingest-encyclopaedia.ts
 *
 * Reads the medical encyclopaedia PDF from ./data, chunks it, embeds the dense vector
 * with Gemini, and upserts into an Upstash HYBRID index. Upstash generates the sparse
 * vector server-side — you do not need a second embedding model.
 *
 * Env needed (put in .env.local):
 *   GOOGLE_API_KEY
 *   UPSTASH_VECTOR_REST_URL
 *   UPSTASH_VECTOR_REST_TOKEN
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Index } from "@upstash/vector";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {PDFParse} from "pdf-parse";

const PDF_PATH = resolve(process.cwd(), "\\Users\\User\\Data Science\\Deep Agents\\HealthPilot\\Front End\\health_pilot\\src\\lib\\A-Z Family Medical Encyclopedia.pdf");

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY,
  model: "text-embedding-004",
});

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

/**
 * scripts/ingest-encyclopaedia.ts
 *
 * Run ONCE, locally, NOT on Vercel:
 *   npx tsx --env-file=.env src/lib/ingest-encyclopaedia.ts
 *   (or wherever you placed this file — run from the project root)
 *
 * Reads the medical encyclopaedia PDF from ./data, chunks it, and upserts into
 * Upstash Vector. Upstash handles ALL embedding (dense + sparse BM25) server-side —
 * you supply only the raw text. No Gemini, no Google API key needed here.
 *
 * UPSTASH CONSOLE SETUP (do once before running):
 *   Index type   : Hybrid
 *   Embedding    : text-embedding-3-small (built-in, Upstash-hosted)
 *   Metric       : Cosine
 *   Sparse model : BM25 (built-in)
 *   -> Upstash will infer the correct dimension from the model automatically.
 *      Do NOT set the dimension manually when using a built-in embedding model.
 *
 * Env needed (in .env):
 *   UPSTASH_VECTOR_REST_URL
 *   UPSTASH_VECTOR_REST_TOKEN
 */

async function main() {
  console.log("Reading PDF:", PDF_PATH);
  const pdfBuffer = await readFile(PDF_PATH);
  const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();

    await parser.destroy();
    console.log('Test snippet:', result.text.slice(0, 100));
  const text = result.text;
  console.log(`Extracted ${text.length.toLocaleString()} characters.`);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 100,
    // Break on paragraph > sentence > word. Keeps clinical sentences whole.
    separators: ["\n\n", "\n", ". ", " ", ""],
  });
  const chunks = await splitter.splitText(text);
  console.log(`Split into ${chunks.length} chunks.`);

  // Smaller batch than before — Upstash is doing the embedding server-side now,
  // so the per-batch time is slightly longer. 25 is a safe default.
  const BATCH = 25;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);

    await index.upsert(
      slice.map((content, j) => ({
        id: `enc-${i + j}`,
        // `data` is all you need. Upstash reads this string to build BOTH the dense
        // (text-embedding-3-small) and the sparse (BM25) vectors. No vector[] required.
        data: content,
        metadata: {
          content,    // returned on query so ragNode avoids a second fetch
          source: "medical-encyclopaedia",
          title: firstLine(content),
        },
      })),
    );

    console.log(`Uploaded ${Math.min(i + BATCH, chunks.length)} / ${chunks.length}`);
  }

  console.log("Done — index is live.");
}

function firstLine(s: string): string {
  return s.split("\n")[0]?.slice(0, 80).trim() || "Untitled section";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});