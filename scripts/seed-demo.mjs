#!/usr/bin/env node
// Seeds a week of demo books (a Lagos provisions shop, NGN) through the app's
// own actions, so every rule (balances, stock, drafts) is applied exactly as
// in real use.
//
// Usage (local dev, fresh database recommended):
//   AUTH_DISABLED=true pnpm dev            # note the port it prints
//   node scripts/seed-demo.mjs http://127.0.0.1:8080
//
// The server must accept unauthenticated local calls (AUTH_DISABLED=true).
// Re-running adds the entries again, so seed a fresh database once.

const base = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const TZ = "Africa/Lagos";

async function call(name, args = {}, method = "POST") {
  const url = `${base}/_agent-native/actions/${name}`;
  const res =
    method === "GET"
      ? await fetch(url)
      : await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${name} failed (${res.status}): ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body)}`);
  }
  return body?.result ?? body;
}

/** YYYY-MM-DD in the shop's timezone, `daysAgo` days before today. */
function day(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const naira = (n) => Math.round(n * 100); // ₦ → kobo (minor units)

async function main() {
  await call("update-profile", {
    businessName: "Bisi Provisions",
    currency: "NGN",
    timezone: TZ,
    languages: ["en", "pcm", "yo"],
    reminderTone: "friendly",
  });

  const contact = async (args) => (await call("upsert-contact", args)).id;
  const musa = await contact({ name: "Musa Bello", aliases: ["Musa"], phone: "+2348012345678", preferredLanguage: "en" });
  const ngozi = await contact({ name: "Mama Ngozi", aliases: ["Ngozi"], phone: "+2348023456789", preferredLanguage: "en" });
  const aisha = await contact({ name: "Aisha Lawal", aliases: ["Aisha"], phone: "+2348034567890" });
  const chidi = await contact({ name: "Chidi Okafor", aliases: ["Chidi"], phone: "+2348045678901", notes: "Rice and oil supplier" });

  const item = async (args) => (await call("upsert-item", { trackStock: true, ...args })).id;
  const rice = await item({ name: "Rice", aliases: ["bag rice"], unit: "bag", defaultPrice: naira(75_000) });
  const oil = await item({ name: "Groundnut oil", aliases: ["oil"], unit: "gallon", defaultPrice: naira(12_000) });
  const sugar = await item({ name: "Sugar", unit: "pack", defaultPrice: naira(1_500) });
  const noodles = await item({ name: "Indomie", aliases: ["noodles"], unit: "carton", defaultPrice: naira(9_000) });

  const log = (args) => call("log-entry", { source: "mic", ...args });

  // Six days ago: opening stock count.
  for (const [itemId, qty] of [[rice, 8], [oil, 15], [sugar, 40], [noodles, 25]]) {
    await log({ type: "stock_count", itemId, qty, occurredAt: day(6), source: "ui", rawText: "Opening stock count" });
  }

  // Five days ago: restock rice from Chidi, part on credit.
  await log({
    type: "purchase", contactId: chidi, itemId: rice, qty: 10, unitPrice: naira(70_000), paid: naira(500_000),
    occurredAt: day(5), rawText: "Chidi bring 10 bags rice, 70k each. I pay 500k, balance later.",
  });

  // Four days ago: Mama Ngozi buys on credit.
  await log({
    type: "sale", contactId: ngozi, itemId: noodles, qty: 3, unitPrice: naira(9_000), paid: 0,
    occurredAt: day(4), rawText: "Mama Ngozi take 3 carton indomie, she go pay Friday.",
  });
  await log({ type: "sale", itemId: oil, qty: 4, unitPrice: naira(12_000), paid: naira(48_000), occurredAt: day(4), rawText: "Sold 4 gallons oil cash, 48k." });

  // Three days ago.
  await log({ type: "sale", itemId: rice, qty: 3, unitPrice: naira(75_000), paid: naira(225_000), occurredAt: day(3), rawText: "3 bags rice cash, 225k." });
  await log({ type: "expense", total: naira(6_500), description: "Generator fuel", occurredAt: day(3), rawText: "Fuel for gen 6,500." });

  // Two days ago: Ngozi pays part; Aisha buys sugar at the usual price.
  await log({ type: "payment_received", contactId: ngozi, total: naira(10_000), occurredAt: day(2), rawText: "Mama Ngozi bring 10k." });
  await log({
    type: "sale", contactId: aisha, itemId: sugar, qty: 10, unitPrice: naira(1_500), paid: naira(5_000), assumed: ["price"],
    occurredAt: day(2), rawText: "Aisha take 10 sugar, she pay 5k.",
  });

  // Yesterday: pay down Chidi, pay rent.
  await log({ type: "payment_made", contactId: chidi, total: naira(100_000), occurredAt: day(1), rawText: "I pay Chidi 100k." });
  await log({ type: "expense", total: naira(50_000), description: "Shop rent (monthly share)", occurredAt: day(1), source: "chat", rawText: "Rent 50k." });
  await log({ type: "sale", itemId: sugar, qty: 6, unitPrice: naira(1_500), paid: naira(9_000), occurredAt: day(1), rawText: "6 sugar cash." });

  // Today: the README example note.
  await log({
    type: "sale", contactId: musa, itemId: rice, qty: 2, total: naira(150_000), paid: naira(50_000),
    rawText: "Musa take 2 bags rice, he pay 50k. Fuel 8k.",
  });
  await log({ type: "expense", total: naira(8_000), description: "Fuel", rawText: "Musa take 2 bags rice, he pay 50k. Fuel 8k." });
  await log({ type: "sale", itemId: noodles, qty: 2, unitPrice: naira(9_000), paid: naira(18_000), rawText: "2 carton indomie cash." });

  // A note the agent couldn't finish: no price was said for the oil.
  await call("create-question", {
    question: "How much did Aisha pay for the 2 gallons of oil?",
    field: "price",
    choices: [
      { label: "Usual price, ₦24,000 cash", patch: { unitPrice: naira(12_000), total: naira(24_000), paid: naira(24_000) } },
      { label: "₦24,000, all on credit", patch: { unitPrice: naira(12_000), total: naira(24_000), paid: 0 } },
    ],
    entry: { type: "sale", contactId: aisha, itemId: oil, qty: 2, rawText: "Aisha collect 2 gallon oil.", source: "mic" },
  });

  // A payment reminder waiting for the owner's approval (nothing is sent).
  await call("draft-reminder", {
    contactId: musa,
    channel: "whatsapp",
    language: "en",
    message:
      "Hello Musa, hope business is good. Just a friendly reminder that ₦100,000 is still open for the 2 bags of rice. Thank you! - Bisi Provisions",
  });

  const balances = await call("list-balances", {}, "GET");
  console.log("Seeded Bisi Provisions demo books.");
  console.log(JSON.stringify(balances, null, 2).slice(0, 1500));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
