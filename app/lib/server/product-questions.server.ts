/**
 * Server-only helpers for product questions (상품 문의), the third surface of
 * the support service (backend docs/support-product-questions.md).
 *
 * Questions are private to the shopper and staff, so like the consultation
 * transcript they are fetched with the operator's own token and rendered
 * server-side — never through a browser-callable endpoint.
 */
import { readError, supportFetch } from "./support.server";

const QUESTIONS_PATH = "/api/v1/support/product-questions";

export const QUESTION_QUEUES = ["waiting", "answered", "hidden"] as const;
export type QuestionQueue = (typeof QUESTION_QUEUES)[number];

export const QUESTION_TYPES = ["size", "stock", "product", "other"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuestionFit = {
  height_cm?: number;
  weight_kg?: number;
  usual_size?: string;
};

export type ProductQuestion = {
  id: string;
  product_id: string;
  sku_id?: string;
  /** How the variant read when asked: "Black / M". */
  variant_label?: string;
  product_name?: string;
  type: QuestionType;
  body: string;
  fit?: QuestionFit;
  status: "waiting" | "answered";
  answer?: string;
  answered_at?: string;
  answered_by?: string;
  customer_id?: string;
  customer_email?: string;
  hidden?: boolean;
  hidden_by?: string;
  hidden_at?: string;
  created_at: string;
  updated_at: string;
};

export function isQuestionQueue(value: string | null): value is QuestionQueue {
  return (QUESTION_QUEUES as readonly string[]).includes(value ?? "");
}

export function isQuestionType(value: string | null): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value ?? "");
}

/** Pure, for tests: the queue's query string. */
export function questionQueueQuery(queue: QuestionQueue, type: QuestionType | null): string {
  const params = new URLSearchParams({ queue });
  if (type) params.set("type", type);
  return `?${params}`;
}

export async function loadQuestions(
  request: Request,
  queue: QuestionQueue,
  type: QuestionType | null
): Promise<ProductQuestion[]> {
  const res = await supportFetch(request, `${QUESTIONS_PATH}${questionQueueQuery(queue, type)}`);
  if (!res.ok) throw new Error(await readError(res, "상품 문의를 불러오지 못했습니다"));
  const body = (await res.json()) as { questions?: ProductQuestion[] | null };
  return Array.isArray(body.questions) ? body.questions : [];
}

export async function loadQuestion(request: Request, id: string): Promise<ProductQuestion> {
  const res = await supportFetch(request, `${QUESTIONS_PATH}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await readError(res, "문의를 불러오지 못했습니다"));
  return (await res.json()) as ProductQuestion;
}

/** Answers, or replaces the answer. Only the first answer emails the shopper. */
export async function answerQuestion(
  request: Request,
  id: string,
  answer: string
): Promise<ProductQuestion> {
  const res = await supportFetch(request, `${QUESTIONS_PATH}/${encodeURIComponent(id)}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error(await readError(res, "답변을 등록하지 못했습니다"));
  return (await res.json()) as ProductQuestion;
}

/** Hiding takes a question off the queue; the shopper still sees it. */
export async function setQuestionHidden(
  request: Request,
  id: string,
  hidden: boolean
): Promise<ProductQuestion> {
  const res = await supportFetch(request, `${QUESTIONS_PATH}/${encodeURIComponent(id)}/hide`, {
    method: "POST",
    body: JSON.stringify({ hidden }),
  });
  if (!res.ok) throw new Error(await readError(res, "처리하지 못했습니다"));
  return (await res.json()) as ProductQuestion;
}
