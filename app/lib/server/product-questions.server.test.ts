import { describe, expect, it } from "vitest";
import { isQuestionQueue, isQuestionType, questionQueueQuery } from "./product-questions.server";

describe("questionQueueQuery", () => {
  it("names the queue and, when filtered, the topic", () => {
    expect(questionQueueQuery("waiting", null)).toBe("?queue=waiting");
    expect(questionQueueQuery("hidden", "size")).toBe("?queue=hidden&type=size");
  });
});

describe("query parsing", () => {
  it("accepts only the known queues and topics", () => {
    expect(isQuestionQueue("answered")).toBe(true);
    expect(isQuestionQueue("closed")).toBe(false);
    expect(isQuestionQueue(null)).toBe(false);
    expect(isQuestionType("stock")).toBe(true);
    expect(isQuestionType("delivery")).toBe(false);
  });
});
