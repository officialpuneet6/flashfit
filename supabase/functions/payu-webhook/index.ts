import { createClient } from "npm:@supabase/supabase-js@2";

const sha512 = async (input: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(input)))).map((n) => n.toString(16).padStart(2, "0")).join("");

// PayU's documented reverse-hash format optionally prefixes additionalCharges.
// Keep this pure helper deterministic so staging payload fixtures can validate it.
export const buildReverseHash = (values: Record<string, string>, salt: string) => {
  const base = [salt, values.status || "", "", "", "", "", "", "", "", "", "", values.email || "", values.firstname || "", values.productinfo || "", values.amount || "", values.txnid || "", values.key || ""];
  return values.additionalCharges ? [values.additionalCharges, ...base].join("|") : base.join("|");
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST required", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const merchantKey = Deno.env.get("PAYU_MERCHANT_KEY"); const salt = Deno.env.get("PAYU_SALT");
  if (!url || !serviceKey || !merchantKey || !salt) return new Response("Payment service unavailable", { status: 503 });
  const contentType = req.headers.get("content-type") || "";
  const raw = await req.text();
  const values = Object.fromEntries(new URLSearchParams(raw));
  if (!contentType.includes("application/x-www-form-urlencoded") || !values.txnid || !values.hash || values.key !== merchantKey) return new Response("Invalid callback", { status: 400 });
  const reverse = buildReverseHash(values, salt);
  if ((await sha512(reverse)).toLowerCase() !== String(values.hash).toLowerCase()) return new Response("Invalid callback", { status: 401 });
  const admin = createClient(url, serviceKey);
  const payloadHash = await sha512(raw);
  const { data: event } = await admin.from("payment_callback_events").upsert({ provider: "PAYU", provider_transaction_id: values.txnid, payload_hash: payloadHash, payload: values }, { onConflict: "provider,provider_transaction_id,payload_hash", ignoreDuplicates: true }).select("id").maybeSingle();
  if (!event) return new Response("OK", { status: 200 });
  const { data: intent } = await admin.from("commerce_payment_intents").select("*").eq("provider", "PAYU").eq("provider_transaction_id", values.txnid).maybeSingle();
  if (!intent || Number(intent.amount).toFixed(2) !== Number(values.amount).toFixed(2)) return new Response("Invalid payment", { status: 400 });
  const paymentStatus = String(values.status || "").toLowerCase();
  // Do not release a hold for a non-terminal provider response (for example,
  // a pending state). Only PayU's explicit terminal values reach the finalizer.
  if (!["success", "failure"].includes(paymentStatus)) {
    await admin.from("payment_callback_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return new Response("OK", { status: 200 });
  }
  const success = paymentStatus === "success";
  // The database RPC locks the intent and reservations, updates order state,
  // and deducts physical stock exactly once. Never duplicate that lifecycle in
  // this handler: callbacks can be retried or delivered more than once.
  const { error: finalizeError } = await admin.rpc("finalize_secure_payment_intent", {
    p_intent_id: intent.id,
    p_outcome: success ? "paid" : "failed",
    p_provider_payment_id: values.mihpayid || values.txnid,
  });
  if (finalizeError) return new Response("Unable to finalize payment", { status: 409 });
  await admin.from("commerce_payment_intents").update({ callback_payload: values, updated_at: new Date().toISOString() }).eq("id", intent.id);
  await admin.from("payment_callback_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
  return new Response("OK", { status: 200 });
});
