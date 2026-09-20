import { useState } from "react";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import {
  claimInquiry,
  closeInquiry,
  loadInquiries,
  loadInquiry,
  replyToInquiry,
  type SupportInquiry,
  type SupportMessage,
  type SupportQueue,
} from "~/lib/server/support.server";
import type { Route } from "./+types/support";

export function meta() {
  return [{ title: "상담 | Dupli1 Admin" }];
}

export type SupportLoaderData = {
  queue: SupportQueue;
  inquiries: SupportInquiry[];
  selected: SupportInquiry | null;
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

export async function loader({
  request,
}: Route.LoaderArgs): Promise<SupportLoaderData> {
  const url = new URL(request.url);
  const queueParam = url.searchParams.get("queue");
  const queue: SupportQueue = isQueue(queueParam) ? queueParam : "waiting";
  const selectedId = url.searchParams.get("id");

  try {
    const inquiries = await loadInquiries(request, queue);
    // The transcript is loaded only for the inquiry actually open, so a list
    // view never pulls every shopper's conversation into one response.
    const selected = selectedId ? await loadInquiry(request, selectedId) : null;
    return { queue, inquiries, selected, error: null };
  } catch (err: unknown) {
    return {
      queue,
      inquiries: [],
      selected: null,
      error: err instanceof Error ? err.message : "Failed to load consultations",
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
        if (!body) return { ok: false, intent, error: "답변 내용을 입력하세요" };
        const result = await replyToInquiry(request, id, body);
        // A reply that never arrived is not a failure of the manager's action,
        // so it succeeds — with delivered:false, which the page shows as 미전송.
        return { ok: true, intent, delivered: result.delivered };
      }
      case "close":
        await closeInquiry(request, id);
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

export default function SupportPage() {
  const { queue, inquiries, selected, error } = useLoaderData<SupportLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();

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
        <h1 className="text-2xl font-semibold text-ink">상담</h1>
        <p className="text-sm text-soft">
          텔레그램 고객 상담 — 대기 중인 문의를 맡고 답변합니다. 상담 시간은 평일
          10:00~22:00이며 공휴일은 휴무입니다.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <nav className="flex gap-2">
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
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <InquiryList
          inquiries={inquiries}
          selectedId={selected?.id ?? null}
          onOpen={openInquiry}
        />
        {selected ? (
          <InquiryDetail inquiry={selected} />
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
              <span className="text-sm font-medium text-ink">
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

function InquiryDetail({ inquiry }: { inquiry: SupportInquiry }) {
  const fetcher = useFetcher<SupportActionData>();
  const [draft, setDraft] = useState("");
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;

  return (
    <section className="space-y-4 rounded-2xl border border-edge bg-panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">
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

      <Transcript messages={inquiry.transcript ?? []} />

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
          onSubmit={() => setDraft("")}
        >
          <input type="hidden" name="id" value={inquiry.id} />
          <textarea
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="답변을 입력하세요"
            className="w-full rounded-xl border border-edge bg-page px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex justify-end">
            <button
              name="intent"
              value="reply"
              disabled={busy || draft.trim() === ""}
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

function Transcript({ messages }: { messages: SupportMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-soft">아직 대화 내용이 없습니다.</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const outbound = message.direction === "outbound";
        const failed = outbound && message.delivery === "failed";
        return (
          <li
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              outbound
                ? "ml-auto bg-accent/10 text-ink"
                : "mr-auto bg-page text-ink"
            } ${failed ? "border border-amber-300" : ""}`}
          >
            <p className="whitespace-pre-wrap">{message.body}</p>
            <p className="mt-1 text-[11px] text-soft">
              {outbound ? message.author ?? "상담원" : "고객"} ·{" "}
              {formatTime(message.created_at)}
              {failed ? " · 미전송" : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function StatusBadge({ status }: { status: SupportInquiry["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
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
