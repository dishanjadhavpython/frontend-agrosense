import type { Metadata } from "next";
import {
  Search,
  Binary,
  Database,
  MessageSquareQuote,
  Lock,
  ShieldQuestion,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { Table } from "@/components/examiner/viz/Matrix";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { RAG_PATH } from "@/data/examiner/diagrams";

export const metadata: Metadata = {
  title: "Retrieval: answering from the card",
};

export default function Page() {
  return (
    <Chapter href="/examiner/rag">
      <Grid>
        <StatCard
          span={3}
          icon={Search}
          tone="blue"
          value={180}
          label="words per chunk"
          sub="30-word overlap, split per page"
        />
        <StatCard
          span={3}
          icon={Binary}
          tone="gold"
          value="1,536"
          label="dimensions per vector"
          sub="hashed, not learned"
        />
        <StatCard
          span={3}
          icon={Database}
          tone="slate"
          value={0}
          label="API calls to embed a document"
          sub="the whole index runs offline"
        />
        <StatCard
          span={3}
          icon={Lock}
          tone="green"
          value="404"
          label="returned for someone else's document"
          sub="not 403 — see the decision below"
        />
      </Grid>

      <Block
        title="Answering a question about the farmer's own card"
        lede="A farmer asks about their own card, in Marathi or English. The retrieval half is deliberately the least clever thing here."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 4.1"
            title="Chunk, embed, retrieve, answer"
            icon={Search}
            tone="blue"
            lede="Pages split into overlapping chunks, each chunk a 1,536-dimension vector. A question is answered from whichever chunks it points at."
            source="backend/chunking.py · backend/embeddings.py · backend/vector_store.py · backend/rag_pipeline.py"
            footnote={
              <Points
                items={[
                  "L2-normalised, so a dot product against the stored matrix is cosine similarity",
                  "One NumPy matrix multiply, then argsort for the top k",
                  "No FAISS, no Chroma, no pgvector — at this size there is nothing to accelerate",
                ]}
              />
            }
          >
            <Pipeline
              feedback="If the local model is unavailable the pipeline falls back to extractive answering — sentences scored by question-term overlap, retrieval score and length. A farmer gets a real sentence from their own card rather than an error."
              steps={[
                {
                  label: "Chunk",
                  sub: "180 words / 30 overlap",
                  detail: "Per page, ids as page-index",
                },
                {
                  label: "Embed",
                  sub: "HashingVectorizer",
                  detail: "1,536 features, L2-normalised",
                },
                {
                  label: "Store",
                  sub: "pickled NumPy matrix",
                  detail: "Rows carry the owner id",
                },
                {
                  label: "Retrieve",
                  sub: "dot product",
                  detail: "Cosine on normalised rows, top k",
                },
                {
                  label: "Answer",
                  sub: "llama3.2:3b",
                  detail: "Local, temperature 0.2",
                },
                { label: "Cite", detail: "Document, page, score, snippet" },
              ]}
            />
          </Card>

          <Card
            span={7}
            n="Fig. 4.2"
            title="Why the embedding is not a neural model"
            icon={Binary}
            tone="gold"
            lede="A weaker representation than a sentence transformer, and still the right choice here — for reasons unrelated to quality."
            source="backend/embeddings.py"
            wide
          >
            <Table
              head={["", "Hashing vectoriser", "Neural embeddings"]}
              numeric={[]}
              minWidth="30rem"
              rows={[
                {
                  cells: [
                    "Deterministic",
                    "Yes — same text, same vector, forever",
                    "Yes, until the model version changes",
                  ],
                },
                {
                  cells: [
                    "Needs a network",
                    "No",
                    "An API, or a model in the image",
                  ],
                },
                {
                  cells: [
                    "Cost per document",
                    "Zero",
                    "Per-token, or ~100 MB of container",
                  ],
                },
                { cells: ["Cold start", "None", "Model load"] },
                { cells: ["Semantic matching", "Lexical only", "Stronger"] },
              ]}
            />
            <p className="ex-caption mt-4">
              The corpus is one farmer&rsquo;s own card: a short, templated
              government document where question and answer use the same words.
              Lexical matching is close to sufficient, and a synonym table in
              both languages covers the rest.
            </p>
          </Card>

          <Card
            span={5}
            n="Fig. 4.3"
            title="A coincidence worth not over-reading"
            icon={MessageSquareQuote}
            tone="slate"
            lede="1,536 is also the width of a well-known commercial embedding. Nothing here calls that service, or any other."
            source="backend/embeddings.py"
            footnote="A hashing width chosen to keep the matrix small; the match is coincidence. Stated because the alternative is an examiner wondering what else was assumed."
          >
            <p className="text-[15px] leading-relaxed text-ink-soft">
              The store is a single pickle file: an N × 1,536 float32 array plus
              metadata. Re-ingesting a document removes its old rows first, so
              the index cannot hold two versions of the same card.
            </p>
          </Card>

          <Card
            span={12}
            n="Fig. 4.4"
            title="Whose document is this?"
            icon={ShieldQuestion}
            tone="clay"
            lede="Ownership is checked before retrieval. A non-owner gets 404, not 403: a 403 would confirm the document exists."
            source="backend/rag_pipeline.py · backend/app.py"
          >
            <Flow {...RAG_PATH} rowHeight={108} maxWidth={980} />
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("rag-404-not-403")} />
          </Card>

          <Card span={12} quiet>
            <Honest title="Single-process, and not concurrency-safe">
              The vector store is a pickle file read and written by one uvicorn
              worker. It is fine for one process and it is the first thing that
              has to be replaced before any real deployment — the
              backend&rsquo;s own README says so. The Terraform stack in chapter
              10 already provisions a DynamoDB table for it; the Python does not
              read that table yet.
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
