import { useEffect, useRef, useState } from "react";
import {
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { productImageSrc } from "~/lib/api";
import { formatWon } from "~/lib/i18n/format";
import {
  answerQuestion,
  isQuestionQueue,
  isQuestionType,
  loadQuestion,
  loadQuestions,
  setQuestionHidden,
  type ProductQuestion,
  type QuestionQueue,
  type QuestionType,
} from "~/lib/server/product-questions.server";
import {
  claimInquiry,
  closeInquiry,
  loadInquiries,
  loadInquiry,
  loadShopperContext,
  loadSupportContext,
  replyToInquiry,
  type ContextOrder,
  type OrderRef,
  type ProductRef,
  type SupportChannelFilter,
  type SupportContext,
  type SupportInquiry,
  type SupportMessage,
  type SupportQueue,
} from "~/lib/server/support.server";
import type { Route } from "./+types/support";

export function meta() {
  return [{ title: "상담 | Dupli1 Admin" }];
}

export type SupportLoaderData = InboxLoaderData | QuestionsLoaderData;

export type InboxLoaderData = {
  tab: "inbox";
  queue: SupportQueue;
  channel: SupportChannelFilter;
  inquiries: SupportInquiry[];
  selected: SupportInquiry | null;
  /** Web inquiries only: who is asking and what they bought. */
  context: SupportContext | null;
  error: string | null;
};

/** `?tab=questions`: the 상품 문의 queue (backend docs/support-product-questions.md). */
export type QuestionsLoaderData = {
  tab: "questions";
  queue: QuestionQueue;
  type: QuestionType | null;
  questions: ProductQuestion[];
  selected: ProductQuestion | null;
  /** The product asked about and the shopper's purchase history. */
  context: SupportContext | null;
  error: string | null;
};

export type SupportActionData = {
  ok: boolean;
  intent?: string;
  /** False when a reply was stored but never reached the shopper. */
  delivered?: boolean;
  error?: string;
};

const QUEUES: { value: SupportQueue; label: string }[] = [
  { value: "waiting", label: "대기" },
  { value: "mine", label: "내 상담" },
  { value: "closed", label: "완료" },
];

const CHANNELS: { value: SupportChannelFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "web", label: "웹" },
  { value: "telegram", label: "텔레그램" },
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  confirmed: "주문 확인",
  in_transit: "배송 중",
  delivered: "배송 완료",
  fulfilled: "구매 확정",
  disputed: "분쟁",
  canceled: "취소",
};

const TOPIC_LABELS: Record<string, string> = {
  ord: "주문·배송",
  "ord.eta": "배송 기간",
  "ord.trk": "배송 조회",
  "ord.adr": "주소 변경",
  prd: "상품·재고",
  ret: "교환·반품",
  pay: "결제",
  agt: "상담원 연결",
};

const STATUS_LABELS: Record<SupportInquiry["status"], string> = {
  open: "대기",
  assigned: "진행 중",
  answered: "답변함",
  closed: "완료",
};

const STATUS_BADGE: Record<SupportInquiry["status"], string> = {
  open: "bg-amber-100 text-amber-800",
  assigned: "bg-sky-100 text-sky-800",
  answered: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-100 text-slate-600",
};

function isQueue(value: string | null): value is SupportQueue {
  return value === "waiting" || value === "mine" || value === "closed";
}

function isChannel(value: string | null): value is SupportChannelFilter {
  return value === "all" || value === "web" || value === "telegram";
}

function isWeb(inquiry: SupportInquiry): boolean {
  return inquiry.channel === "web";
}

export async function loader({
  request,
}: Route.LoaderArgs): Promise<SupportLoaderData> {
  const url = new URL(request.url);
  if (url.searchParams.get("tab") === "questions") return questionsLoader(request, url);
  const queueParam = url.searchParams.get("queue");
  const queue: SupportQueue = isQueue(queueParam) ? queueParam : "waiting";
  const channelParam = url.searchParams.get("channel");
  const channel: SupportChannelFilter = isChannel(channelParam) ? channelParam : "all";
  const selectedId = url.searchParams.get("id");

  try {
    const [inquiries, selected] = await Promise.all([
      loadInquiries(request, queue, channel),
      // The transcript is loaded only for the inquiry actually open, so a list
      // view never pulls every shopper's conversation into one response.
      selectedId ? loadInquiry(request, selectedId) : Promise.resolve(null),
    ]);
    const context = selected ? await loadSupportContext(request, selected) : null;
    return { tab: "inbox", queue, channel, inquiries, selected, context, error: null };
  } catch (err: unknown) {
    return {
      tab: "inbox",
      queue,
      channel,
      inquiries: [],
      selected: null,
      context: null,
      error: err instanceof Error ? err.message : "Failed to load consultations",
    };
  }
}

async function questionsLoader(request: Request, url: URL): Promise<QuestionsLoaderData> {
  const queueParam = url.searchParams.get("queue");
  const queue: QuestionQueue = isQuestionQueue(queueParam) ? queueParam : "waiting";
  const typeParam = url.searchParams.get("type");
  const type = isQuestionType(typeParam) ? typeParam : null;
  // The alert and the reply-notice links name the question.
  const selectedId = url.searchParams.get("question");

  try {
    const [questions, selected] = await Promise.all([
      loadQuestions(request, queue, type),
      selectedId ? loadQuestion(request, selectedId) : Promise.resolve(null),
    ]);
    const context = selected?.customer_id
      ? await loadShopperContext(request, {
          customerId: selected.customer_id,
          skuId: selected.sku_id,
        })
      : null;
    return { tab: "questions", queue, type, questions, selected, context, error: null };
  } catch (err: unknown) {
    return {
      tab: "questions",
      queue,
      type,
      questions: [],
      selected: null,
      context: null,
      error: err instanceof Error ? err.message : "상품 문의를 불러오지 못했습니다",
    };
  }
}

export async function action({
  request,
}: Route.ActionArgs): Promise<SupportActionData> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, intent, error: "상담 번호가 필요합니다" };

  try {
    switch (intent) {
      case "claim":
        await claimInquiry(request, id);
        return { ok: true, intent };
      case "reply": {
        const body = String(formData.get("body") ?? "").trim();
        const skuId = String(formData.get("sku_id") ?? "").trim();
        const orderId = String(formData.get("order_id") ?? "").trim();
        if (!body && !skuId && !orderId) {
          return { ok: false, intent, error: "답변 내용을 입력하세요" };
        }
        const result = await replyToInquiry(request, id, body, {
          ...(skuId ? { sku_id: skuId } : {}),
          ...(orderId ? { order_id: orderId } : {}),
        });
        // A reply that never arrived is not a failure of the manager's action,
        // so it succeeds — with delivered:false, which the page shows as 미전송.
        return { ok: true, intent, delivered: result.delivered };
      }
      case "close":
        await closeInquiry(request, id);
        return { ok: true, intent };
      case "answer": {
        const answer = String(formData.get("answer") ?? "").trim();
        if (!answer) return { ok: false, intent, error: "답변 내용을 입력하세요" };
        if ([...answer].length > ANSWER_LIMIT) {
          return { ok: false, intent, error: `답변은 ${ANSWER_LIMIT.toLocaleString()}자 이내로 입력하세요` };
        }
        await answerQuestion(request, id, answer);
        return { ok: true, intent };
      }
      case "hide":
      case "unhide":
        await setQuestionHidden(request, id, intent === "hide");
        return { ok: true, intent };
      default:
        return { ok: false, intent, error: "알 수 없는 요청입니다" };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      intent,
      error: err instanceof Error ? err.message : "처리에 실패했습니다",
    };
  }
}

/**
 * Keeps the inbox current while it is open. Each frame only says that
 * something changed; the loader reloads the list and the open transcript.
 * Bursts (a card plus its text) coalesce into one reload.
 */
function useInboxStream(): boolean {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource("/support/events");
    const reload = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void revalidate.current();
      }, 300);
    };
    source.addEventListener("ready", () => {
      setLive(true);
      // Anything that changed while the stream was down.
      reload();
    });
    source.addEventListener("message", reload);
    source.addEventListener("inquiry", reload);
    // EventSource reconnects on its own (support sends retry: 3000); the
    // stream ends whenever the access token behind it expires.
    source.onerror = () => setLive(false);
    return () => {
      if (timer) clearTimeout(timer);
      source.close();
    };
  }, []);
  return live;
}

export default function SupportPage() {
  const data = useLoaderData<SupportLoaderData>();
  return data.tab === "questions" ? <QuestionsView data={data} /> : <InboxView data={data} />;
}

/** 상담 | 상품 문의 — the two surfaces of the support inbox. */
function SurfaceTabs({ current }: { current: SupportLoaderData["tab"] }) {
  const tabs: { value: SupportLoaderData["tab"]; label: string; to: string }[] = [
    { value: "inbox", label: "상담", to: "/support" },
    { value: "questions", label: "상품 문의", to: "/support?tab=questions" },
  ];
  return (
    <nav aria-label="문의 종류" className="flex gap-6 border-b border-edge">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          to={tab.to}
          aria-current={current === tab.value ? "page" : undefined}
          className={`-mb-px border-b-2 pb-2 text-sm transition ${
            current === tab.value
              ? "border-accent font-medium text-ink"
              : "border-transparent text-soft hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function InboxView({ data }: { data: InboxLoaderData }) {
  const { queue, channel, inquiries, selected, context, error } = data;
  const [searchParams, setSearchParams] = useSearchParams();
  const live = useInboxStream();

  function openChannel(next: SupportChannelFilter) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("channel");
    else params.set("channel", next);
    params.delete("id");
    setSearchParams(params);
  }

  function openQueue(next: SupportQueue) {
    const params = new URLSearchParams(searchParams);
    params.set("queue", next);
    params.delete("id");
    setSearchParams(params);
  }

  function openInquiry(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("id", id);
    setSearchParams(params);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">상담</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] ${
              live ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            {live ? "Live" : "Not live"}
          </span>
        </div>
        <p className="text-sm text-soft">
          웹·텔레그램 고객 상담 — 대기 중인 문의를 맡고 답변합니다. 상담 시간은
          평일 10:00~22:00이며 공휴일은 휴무입니다.
        </p>
      </header>

      <SurfaceTabs current="inbox" />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <nav className="flex flex-wrap items-center gap-2">
        {QUEUES.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => openQueue(tab.value)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              queue === tab.value
                ? "bg-accent text-white"
                : "bg-panel text-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-edge" aria-hidden />
        {CHANNELS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => openChannel(tab.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              channel === tab.value
                ? "border-accent text-accent"
                : "border-edge text-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <InquiryList
          inquiries={inquiries}
          selectedId={selected?.id ?? null}
          onOpen={openInquiry}
        />
        {selected ? (
          <div
            className={
              context
                ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]"
                : undefined
            }
          >
            {/* Keyed so a draft never carries over to another shopper. */}
            <InquiryDetail key={selected.id} inquiry={selected} context={context} />
            {context ? (
              <ContextPanel
                customer={{ id: selected.customer_id, email: selected.customer_email }}
                context={context}
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-edge bg-panel px-4 py-10 text-center text-sm text-soft">
            왼쪽에서 상담을 선택하세요.
          </p>
        )}
      </div>
    </div>
  );
}

function InquiryList({
  inquiries,
  selectedId,
  onOpen,
}: {
  inquiries: SupportInquiry[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  if (inquiries.length === 0) {
    return (
      <p className="rounded-2xl border border-edge bg-panel px-4 py-10 text-center text-sm text-soft">
        해당하는 상담이 없습니다.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {inquiries.map((inquiry) => (
        <li key={inquiry.id}>
          <button
            type="button"
            onClick={() => onOpen(inquiry.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              selectedId === inquiry.id
                ? "border-accent bg-accent/5"
                : "border-edge bg-panel hover:border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <ChannelBadge inquiry={inquiry} />
                {TOPIC_LABELS[inquiry.topic] ?? inquiry.topic}
              </span>
              <StatusBadge status={inquiry.status} />
            </div>
            {inquiry.last_message ? (
              <p className="mt-1 line-clamp-2 text-xs text-soft">
                {inquiry.last_message}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-soft">
              {formatTime(inquiry.opened_at)}
              {inquiry.username ? ` · @${inquiry.username}` : ""}
              {inquiry.customer_email ? ` · ${inquiry.customer_email}` : ""}
              {/* The entry language is recorded even though the bot answers in
                  Korean only: it is the evidence for whether a second language
                  is worth staffing. */}
              {inquiry.language && inquiry.language !== "ko"
                ? ` · ${inquiry.language.toUpperCase()}`
                : ""}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function InquiryDetail({
  inquiry,
  context,
}: {
  inquiry: SupportInquiry;
  context: SupportContext | null;
}) {
  const fetcher = useFetcher<SupportActionData>();
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState("");
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const web = isWeb(inquiry);
  const attachOptions = web ? attachChoices(inquiry, context) : [];
  const [attachKind, attachId] = attach.split(":", 2);

  return (
    <section className="space-y-4 rounded-2xl border border-edge bg-panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium text-ink">
            <ChannelBadge inquiry={inquiry} />
            {TOPIC_LABELS[inquiry.topic] ?? inquiry.topic}
          </h2>
          <p className="text-xs text-soft">
            {formatTime(inquiry.opened_at)}
            {inquiry.assigned_to ? ` · 담당 ${inquiry.assigned_to}` : " · 미배정"}
            {inquiry.entry_context ? ` · 유입 ${inquiry.entry_context}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={inquiry.status} />
          <fetcher.Form method="post">
            <input type="hidden" name="id" value={inquiry.id} />
            <button
              name="intent"
              value="claim"
              disabled={busy}
              className="rounded-full border border-edge px-3 py-1.5 text-xs text-ink transition hover:border-accent disabled:opacity-50"
            >
              맡기
            </button>
          </fetcher.Form>
          {inquiry.status !== "closed" ? (
            <fetcher.Form method="post">
              <input type="hidden" name="id" value={inquiry.id} />
              <button
                name="intent"
                value="close"
                disabled={busy}
                className="rounded-full border border-edge px-3 py-1.5 text-xs text-soft transition hover:text-ink disabled:opacity-50"
              >
                완료
              </button>
            </fetcher.Form>
          ) : null}
        </div>
      </header>

      <Transcript
        messages={inquiry.transcript ?? []}
        lastReadAt={web ? inquiry.customer_last_read_at : undefined}
      />

      {result?.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {result.error}
        </p>
      ) : null}
      {result?.intent === "reply" && result.ok && result.delivered === false ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          답변이 저장되었지만 고객에게 전달되지 않았습니다 (미전송). 고객이 봇을
          차단했을 수 있습니다.
        </p>
      ) : null}

      {inquiry.status !== "closed" ? (
        <fetcher.Form
          method="post"
          className="space-y-2"
          onSubmit={() => {
            setDraft("");
            setAttach("");
          }}
        >
          <input type="hidden" name="id" value={inquiry.id} />
          {attachKind === "sku" ? <input type="hidden" name="sku_id" value={attachId} /> : null}
          {attachKind === "order" ? (
            <input type="hidden" name="order_id" value={attachId} />
          ) : null}
          <textarea
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="답변을 입력하세요"
            className="w-full rounded-xl border border-edge bg-page px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {attachOptions.length > 0 ? (
              <label className="mr-auto flex items-center gap-2 text-xs text-soft">
                카드 첨부
                <select
                  aria-label="카드 첨부"
                  value={attach}
                  onChange={(event) => setAttach(event.target.value)}
                  className="max-w-[16rem] rounded-lg border border-edge bg-page px-2 py-1 text-xs text-ink"
                >
                  <option value="">없음</option>
                  {attachOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              name="intent"
              value="reply"
              disabled={busy || (draft.trim() === "" && attach === "")}
              className="rounded-full bg-accent px-5 py-2 text-sm text-white transition disabled:opacity-50"
            >
              {busy ? "보내는 중…" : "답변 보내기"}
            </button>
          </div>
        </fetcher.Form>
      ) : null}
    </section>
  );
}

/** Cards a reply can carry: the product and order in context, recent orders. */
function attachChoices(
  inquiry: SupportInquiry,
  context: SupportContext | null
): { value: string; label: string }[] {
  const choices: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (value: string, label: string) => {
    if (seen.has(value)) return;
    seen.add(value);
    choices.push({ value, label });
  };
  if (context?.product) {
    add(`sku:${context.product.sku_id}`, `상품 · ${context.product.name}`);
  } else if (inquiry.sku_id) {
    add(`sku:${inquiry.sku_id}`, `상품 · ${inquiry.sku_id}`);
  }
  if (inquiry.order_id) add(`order:${inquiry.order_id}`, `주문 · ${inquiry.order_id}`);
  for (const order of context?.history?.recent ?? []) {
    add(`order:${order.id}`, `주문 · ${orderLabel(order)} · ${formatDay(order.created_at)}`);
  }
  return choices;
}

function Transcript({
  messages,
  lastReadAt,
}: {
  messages: SupportMessage[];
  /** Web only: replies at or before this were read by the shopper. */
  lastReadAt?: string;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-soft">아직 대화 내용이 없습니다.</p>;
  }
  const readUntil = lastReadAt ? new Date(lastReadAt).getTime() : NaN;

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        if (message.kind === "system") {
          return (
            <li key={message.id} className="text-center text-[11px] text-soft">
              {message.body} · {formatTime(message.created_at)}
            </li>
          );
        }
        const outbound = message.direction === "outbound";
        const failed = outbound && message.delivery === "failed";
        const read =
          outbound &&
          !Number.isNaN(readUntil) &&
          new Date(message.created_at).getTime() <= readUntil;
        const card = referenceCard(message);
        return (
          <li
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              outbound
                ? "ml-auto bg-accent/10 text-ink"
                : "mr-auto bg-page text-ink"
            } ${failed ? "border border-amber-300" : ""}`}
          >
            {card ?? <p className="whitespace-pre-wrap">{message.body}</p>}
            <p className="mt-1 text-[11px] text-soft">
              {outbound ? message.author ?? "상담원" : "고객"} ·{" "}
              {formatTime(message.created_at)}
              {failed ? " · 미전송" : ""}
              {read ? " · 읽음" : ""}
              {outbound && message.notice_status === "sent" ? " · 메일 알림 보냄" : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function referenceCard(message: SupportMessage) {
  if (!message.ref) return null;
  if (message.kind === "product_ref") {
    const ref = message.ref as ProductRef;
    return (
      <div className="flex items-center gap-3">
        {ref.image_url ? (
          <img
            src={productImageSrc(ref.image_url)}
            alt=""
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <Link
            to={`/products/${encodeURIComponent(ref.product_id)}`}
            className="block truncate font-medium hover:underline"
          >
            {ref.name}
          </Link>
          <p className="text-xs text-soft">
            {[ref.color, ref.sku].filter(Boolean).join(" · ")}
            {ref.price_won ? ` · ${formatWon("ko", ref.price_won)}` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (message.kind === "order_ref") {
    const ref = message.ref as OrderRef;
    return (
      <div>
        <Link
          to={`/orders/${encodeURIComponent(ref.order_id)}`}
          className="font-medium hover:underline"
        >
          주문 {ref.order_id}
        </Link>
        <p className="text-xs text-soft">
          {ORDER_STATUS_LABELS[ref.status] ?? ref.status} ·{" "}
          {formatWon("ko", ref.total_won)}
          {ref.first_item_name
            ? ` · ${ref.first_item_name}${ref.item_count > 1 ? ` 외 ${ref.item_count - 1}` : ""}`
            : ""}
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Who is asking and what they bought. Deliberately no phone or saved
 * addresses: staff answer the question, they do not need to reach the shopper
 * outside the chat.
 */
function ContextPanel({
  customer,
  context,
}: {
  customer: { id?: string; email?: string };
  context: SupportContext;
}) {
  const { product, order, history } = context;
  return (
    <aside
      aria-label="고객 정보"
      className="space-y-4 rounded-2xl border border-edge bg-panel p-5 text-sm"
    >
      <section className="space-y-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-soft">고객</h3>
        <p className="break-all text-ink">{customer.email ?? "이메일 없음"}</p>
        {customer.id ? (
          <Link
            to={`/users/${encodeURIComponent(customer.id)}`}
            className="text-xs text-accent hover:underline"
          >
            계정 보기
          </Link>
        ) : null}
      </section>

      {product ? (
        <section className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-soft">문의 상품</h3>
          <div className="flex items-center gap-3">
            {product.image_url ? (
              <img
                src={productImageSrc(product.image_url)}
                alt=""
                className="h-14 w-14 rounded-lg object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <Link
                to={`/products/${encodeURIComponent(product.product_id)}/SKU/${encodeURIComponent(product.sku_id)}`}
                className="block truncate font-medium text-ink hover:underline"
              >
                {product.name}
              </Link>
              <p className="text-xs text-soft">
                {[product.color, product.sku].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-soft">
                {formatWon("ko", product.price_won)}
                {typeof product.available_qty === "number"
                  ? ` · 재고 ${product.available_qty}`
                  : ""}
              </p>
            </div>
          </div>
          {context.bought_before ? (
            <p className="text-xs text-emerald-700">이 상품을 구매한 적이 있습니다</p>
          ) : null}
        </section>
      ) : null}

      {order ? (
        <section className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-soft">문의 주문</h3>
          <OrderLine order={order} />
        </section>
      ) : null}

      {history ? (
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-soft">구매 내역</h3>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-page px-3 py-2">
              <dt className="text-[11px] text-soft">결제한 주문</dt>
              <dd className="font-medium text-ink">{history.order_count}건</dd>
            </div>
            <div className="rounded-xl bg-page px-3 py-2">
              <dt className="text-[11px] text-soft">누적 결제</dt>
              <dd className="font-medium text-ink">
                {formatWon("ko", history.total_spent_won)}
              </dd>
            </div>
          </dl>
          {history.recent.length > 0 ? (
            <ul className="space-y-1.5">
              {history.recent.map((recent) => (
                <li key={recent.id}>
                  <OrderLine order={recent} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-soft">주문 내역이 없습니다.</p>
          )}
        </section>
      ) : null}

      {context.errors.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-800">
          {context.errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

function orderLabel(order: ContextOrder): string {
  const name = order.first_item_name ?? order.id;
  return order.item_count > 1 ? `${name} 외 ${order.item_count - 1}` : name;
}

function OrderLine({ order }: { order: ContextOrder }) {
  return (
    <Link
      to={`/orders/${encodeURIComponent(order.id)}`}
      className="block rounded-xl border border-edge px-3 py-2 transition hover:border-accent/40"
    >
      <p className="truncate text-xs font-medium text-ink">{orderLabel(order)}</p>
      <p className="text-[11px] text-soft">
        {ORDER_STATUS_LABELS[order.status] ?? order.status} ·{" "}
        {formatWon("ko", order.total_won)} · {formatTime(order.created_at)}
      </p>
    </Link>
  );
}

function ChannelBadge({ inquiry }: { inquiry: SupportInquiry }) {
  return isWeb(inquiry) ? (
    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
      웹
    </span>
  ) : (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
      TG
    </span>
  );
}

function StatusBadge({ status }: { status: SupportInquiry["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── 상품 문의 ─────────────────────────────────────────────────────────────────
//
// Private product questions: a shopper asks about one variant from the
// product page, staff answer here, and only that shopper ever sees the
// answer. The first answer emails them a link back to the product.

/** Support's `MaxAnswerRunes`. */
const ANSWER_LIMIT = 2000;

const QUESTION_QUEUES: { value: QuestionQueue; label: string }[] = [
  { value: "waiting", label: "답변 대기" },
  { value: "answered", label: "답변 완료" },
  { value: "hidden", label: "숨김" },
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  size: "사이즈·핏",
  stock: "재고·입고",
  product: "상품 정보",
  other: "기타",
};

/** Openers per topic; staff finish the sentence. */
const ANSWER_TEMPLATES: { label: string; body: string }[] = [
  {
    label: "사이즈 추천",
    body: "안녕하세요, DUPLI1입니다.\n말씀해 주신 체형이라면 __ 사이즈를 권해드립니다. 실측 치수는 상품 페이지의 사이즈 가이드를 참고해 주세요.",
  },
  {
    label: "입고 예정",
    body: "안녕하세요, DUPLI1입니다.\n문의하신 옵션은 __ 입고 예정입니다. 입고되면 상품 페이지에서 바로 구매하실 수 있습니다.",
  },
  {
    label: "상품 정보",
    body: "안녕하세요, DUPLI1입니다.\n문의하신 내용 안내드립니다. ",
  },
  {
    label: "1:1 상담 안내",
    body: "안녕하세요, DUPLI1입니다.\n주문·배송 관련 내용은 마이페이지의 1:1 상담으로 문의해 주시면 빠르게 확인해 드리겠습니다.",
  },
];

function QuestionsView({ data }: { data: QuestionsLoaderData }) {
  const { queue, type, questions, selected, context, error } = data;
  const [searchParams, setSearchParams] = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "questions");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">상담</h1>
        <p className="text-sm text-soft">
          상품 페이지에서 남긴 비공개 문의입니다. 질문과 답변은 문의한 고객과
          운영자만 볼 수 있고, 첫 답변이 등록되면 고객에게 메일로 알립니다.
        </p>
      </header>

      <SurfaceTabs current="questions" />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <nav className="flex flex-wrap items-center gap-2">
        {QUESTION_QUEUES.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => update({ queue: tab.value, question: null })}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              queue === tab.value ? "bg-accent text-white" : "bg-panel text-soft hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-edge" aria-hidden />
        {([null, ...Object.keys(QUESTION_TYPE_LABELS)] as (QuestionType | null)[]).map((value) => (
          <button
            key={value ?? "all"}
            type="button"
            onClick={() => update({ type: value, question: null })}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              type === value ? "border-accent text-accent" : "border-edge text-soft hover:text-ink"
            }`}
          >
            {value ? QUESTION_TYPE_LABELS[value] : "전체"}
          </button>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <QuestionList
          questions={questions}
          selectedId={selected?.id ?? null}
          onOpen={(id) => update({ question: id })}
        />
        {selected ? (
          <div
            className={
              context ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]" : undefined
            }
          >
            {/* Keyed so a draft never carries over to another question. */}
            <QuestionDetail key={selected.id} question={selected} />
            {context ? (
              <ContextPanel
                customer={{ id: selected.customer_id, email: selected.customer_email }}
                context={context}
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-edge bg-panel px-4 py-10 text-center text-sm text-soft">
            왼쪽에서 문의를 선택하세요.
          </p>
        )}
      </div>
    </div>
  );
}

function QuestionList({
  questions,
  selectedId,
  onOpen,
}: {
  questions: ProductQuestion[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  if (questions.length === 0) {
    return (
      <p className="rounded-2xl border border-edge bg-panel px-4 py-10 text-center text-sm text-soft">
        해당하는 문의가 없습니다.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {questions.map((question) => (
        <li key={question.id}>
          <button
            type="button"
            onClick={() => onOpen(question.id)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              selectedId === question.id
                ? "border-accent bg-accent/5"
                : "border-edge bg-panel hover:border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">
                {question.product_name ?? question.product_id}
              </span>
              <QuestionStatusBadge question={question} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-soft">{question.body}</p>
            <p className="mt-1 text-[11px] text-soft">
              {QUESTION_TYPE_LABELS[question.type] ?? question.type}
              {question.variant_label ? ` · ${question.variant_label}` : ""} ·{" "}
              {formatTime(question.created_at)}
              {question.customer_email ? ` · ${question.customer_email}` : ""}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function QuestionDetail({ question }: { question: ProductQuestion }) {
  const fetcher = useFetcher<SupportActionData>();
  const answered = question.status === "answered";
  const [draft, setDraft] = useState(question.answer ?? "");
  const [editing, setEditing] = useState(!answered);
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const length = [...draft.trim()].length;
  const fit = fitLine(question);

  // A saved answer closes the editor; the loader brings the new text.
  useEffect(() => {
    if (fetcher.state === "idle" && result?.ok && result.intent === "answer") setEditing(false);
  }, [fetcher.state, result]);

  return (
    <section className="space-y-4 rounded-2xl border border-edge bg-panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-ink">
            <Link
              to={`/products/${encodeURIComponent(question.product_id)}${
                question.sku_id ? `/SKU/${encodeURIComponent(question.sku_id)}` : ""
              }`}
              className="hover:underline"
            >
              {question.product_name ?? question.product_id}
            </Link>
          </h2>
          <p className="text-xs text-soft">
            {QUESTION_TYPE_LABELS[question.type] ?? question.type}
            {question.variant_label ? ` · ${question.variant_label}` : ""} ·{" "}
            {formatTime(question.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QuestionStatusBadge question={question} />
          <fetcher.Form method="post">
            <input type="hidden" name="id" value={question.id} />
            <button
              name="intent"
              value={question.hidden ? "unhide" : "hide"}
              disabled={busy}
              className="rounded-full border border-edge px-3 py-1.5 text-xs text-soft transition hover:text-ink disabled:opacity-50"
            >
              {question.hidden ? "숨김 해제" : "숨기기"}
            </button>
          </fetcher.Form>
        </div>
      </header>

      <div className="rounded-xl bg-page px-4 py-3">
        <p className="text-[11px] text-soft">고객 문의</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{question.body}</p>
        {fit ? <p className="mt-2 text-xs text-soft">체형 · {fit}</p> : null}
      </div>

      {question.hidden ? (
        <p className="text-xs text-soft">
          숨긴 문의입니다{question.hidden_by ? ` (${question.hidden_by})` : ""}. 대기 목록에서만
          빠지며, 고객은 계속 자신의 문의를 볼 수 있습니다.
        </p>
      ) : null}

      {answered && !editing ? (
        <div className="rounded-xl bg-accent/10 px-4 py-3">
          <p className="text-[11px] text-soft">
            답변 · {question.answered_by ?? "상담원"}
            {question.answered_at ? ` · ${formatTime(question.answered_at)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{question.answer}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 text-xs text-accent hover:underline"
          >
            답변 수정
          </button>
        </div>
      ) : null}

      {result?.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {result.error}
        </p>
      ) : null}

      {editing ? (
        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="id" value={question.id} />
          <textarea
            name="answer"
            aria-label="답변"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            placeholder="답변을 입력하세요. 문의한 고객만 볼 수 있습니다."
            className="w-full rounded-xl border border-edge bg-page px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="mr-auto flex items-center gap-2 text-xs text-soft">
              템플릿
              <select
                aria-label="답변 템플릿"
                value=""
                onChange={(event) => {
                  const template = ANSWER_TEMPLATES[Number(event.target.value)];
                  if (template) setDraft(template.body);
                }}
                className="rounded-lg border border-edge bg-page px-2 py-1 text-xs text-ink"
              >
                <option value="">선택</option>
                {ANSWER_TEMPLATES.map((template, index) => (
                  <option key={template.label} value={index}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <span
              className={`text-[11px] tabular-nums ${
                length > ANSWER_LIMIT ? "text-rose-600" : "text-soft"
              }`}
            >
              {length.toLocaleString()} / {ANSWER_LIMIT.toLocaleString()}
            </span>
            {answered ? (
              <button
                type="button"
                onClick={() => {
                  setDraft(question.answer ?? "");
                  setEditing(false);
                }}
                className="rounded-full border border-edge px-4 py-2 text-sm text-soft transition hover:text-ink"
              >
                취소
              </button>
            ) : null}
            <button
              name="intent"
              value="answer"
              disabled={busy || length === 0 || length > ANSWER_LIMIT}
              className="rounded-full bg-accent px-5 py-2 text-sm text-white transition disabled:opacity-50"
            >
              {busy ? "등록 중…" : answered ? "답변 수정" : "답변 등록"}
            </button>
          </div>
          {!answered ? (
            <p className="text-[11px] text-soft">
              등록하면 고객에게 답변 알림 메일이 갑니다. 메일에는 답변 내용이 들어가지
              않습니다.
            </p>
          ) : null}
        </fetcher.Form>
      ) : null}
    </section>
  );
}

function QuestionStatusBadge({ question }: { question: ProductQuestion }) {
  if (question.hidden) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-600">숨김</span>
    );
  }
  return question.status === "answered" ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] text-emerald-800">
      답변 완료
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] text-amber-800">
      답변 대기
    </span>
  );
}

function fitLine(question: ProductQuestion): string {
  const fit = question.fit;
  if (!fit) return "";
  return [
    fit.height_cm ? `${fit.height_cm}cm` : "",
    fit.weight_kg ? `${fit.weight_kg}kg` : "",
    fit.usual_size ? `평소 ${fit.usual_size}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
