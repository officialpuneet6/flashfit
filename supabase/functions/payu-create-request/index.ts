import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin"
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sha512 = async (input: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(input)))).map((n) => n.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const merchantKey = Deno.env.get("PAYU_MERCHANT_KEY");
  const salt = Deno.env.get("PAYU_SALT");
  const successUrl = Deno.env.get("PAYU_SUCCESS_URL");
  const failureUrl = Deno.env.get("PAYU_FAILURE_URL");
  if (!url || !serviceKey || !merchantKey || !salt || !successUrl || !failureUrl) return json({ error: "Payment service unavailable" }, 503);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const caller = createClient(url, serviceKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
  const body = await req.json().catch(() => null) as { paymentIntentId?: string } | null;
  if (!body?.paymentIntentId || typeof body.paymentIntentId !== "string") return json({ error: "Invalid payment request" }, 400);
  const { data: safeIntent, error: intentError } = await caller.rpc("get_secure_payment_intent", { p_intent_id: body.paymentIntentId });
  if (intentError || !safeIntent || safeIntent.provider !== "PAYU") return json({ error: "Payment intent unavailable" }, 404);
  const admin = createClient(url, serviceKey);
  const orderIds = (safeIntent.orders as Array<{ id: number }>).map((row) => row.id);
  const { data: orders } = await admin.from("seller_orders").select("id,order_number,customer_name,customer_mobile").in("id", orderIds).eq("user_id", userData.user.id);
  if (!orders?.length || orders.length !== orderIds.length) return json({ error: "Payment intent unavailable" }, 404);
  const txnid = `FF${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 48);
  const amount = Number(safeIntent.amount).toFixed(2);
  const firstname = String(orders[0].customer_name || "Customer").slice(0, 60);
  const phone = String(orders[0].customer_mobile || "").replace(/\D/g, "").slice(-10);
  const email = userData.user.email || `customer.${userData.user.id.slice(0, 12)}@flashfit.invalid`;
  const productinfo = orders.map((order) => order.order_number).join(", ").slice(0, 255);
  const hash = await sha512([merchantKey, txnid, amount, productinfo, firstname, email, "", "", "", "", "", "", "", "", "", "", salt].join("|"));
  const { error: updateError } = await admin.from("commerce_payment_intents").update({ status: "payment_requested", provider_transaction_id: txnid, updated_at: new Date().toISOString() }).eq("id", safeIntent.id).eq("user_id", userData.user.id).eq("status", "pending");
  if (updateError) return json({ error: "Unable to start payment" }, 409);
  return json({ fields: { key: merchantKey, txnid, amount, firstname, email, phone, productinfo, surl: successUrl, furl: failureUrl, hash, service_provider: "payu_paisa" } });
});
