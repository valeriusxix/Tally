import { describe, expect, it } from "vitest";

import { commitProblem, deriveFields, type EntryFields, nameScore } from "./tally";

const base: EntryFields = {
  type: "sale",
  occurredAt: "2026-11-08T10:00:00.000Z",
  contactId: null,
  itemId: null,
  qty: null,
  unitPrice: null,
  total: null,
  paid: null,
  description: null,
  assumed: [],
};

describe("entry rules", () => {
  it("computes total from qty and unit price, never inventing paid", () => {
    const f = deriveFields({ ...base, qty: 2, unitPrice: 7500000 });
    expect(f.total).toBe(15000000);
    expect(f.paid).toBeNull();
    expect(commitProblem(f)).toMatch(/paid is missing/);
  });
  it("needs a contact when money is left owed", () => {
    const f = deriveFields({ ...base, total: 1000, paid: 0 });
    expect(commitProblem(f)).toMatch(/contactId is required/);
    expect(commitProblem({ ...f, contactId: "c1" })).toBeNull();
  });
  it("lets a cash sale to a walk-in commit", () => {
    expect(commitProblem(deriveFields({ ...base, total: 1000, paid: 1000 }))).toBeNull();
  });
  it("sets paid for payments and expenses", () => {
    expect(deriveFields({ ...base, type: "expense", total: 800 }).paid).toBe(800);
    const p = deriveFields({ ...base, type: "payment_received", total: 500, contactId: "c" });
    expect(p.paid).toBe(500);
    expect(commitProblem(p)).toBeNull();
  });
  it("rejects paying more than the total", () => {
    expect(commitProblem({ ...base, total: 100, paid: 200, contactId: "c" })).toMatch(/more than total/);
  });
});

describe("name matching", () => {
  it("scores spoken names", () => {
    expect(nameScore("Musa Bello", "musa bello")).toBe(1);
    expect(nameScore("Musa", "Musa Bello")).toBeGreaterThanOrEqual(0.8);
    expect(nameScore("Ngozzi", "Mama Ngozi")).toBeGreaterThan(0.6);
    expect(nameScore("Chinedu", "Musa Bello")).toBeLessThan(0.45);
  });
});
