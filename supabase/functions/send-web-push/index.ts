import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:flashfithelp@gmail.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: corsHeaders });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Push service unavailable" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const authClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const body = await req.json().catch(() => ({}));
  const notificationId = Number(body.notification_id);
  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    return new Response(JSON.stringify({ error: "notification_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = authClient;
  let notifications: any[] = [];
  const results: Array<Record<string, unknown>> = [];

  {
    const { data } = await supabase
      .from("platform_notifications")
      .select("*")
      .eq("id", notificationId)
      .eq("recipient_id", userData.user.id)
      .limit(1);
    notifications = data || [];
  }

  for (const notification of notifications) {
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id,subscription,endpoint")
      .eq("role", notification.role)
          .eq("recipient_id", userData.user.id)
      .eq("active", true);

    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          notification_id: notification.id,
          title: notification.title,
          body: notification.body,
          priority: notification.priority,
          icon: "/flashfitshop/50x100logo.png",
          badge: "/flashfitshop/favicon-32x32.png",
          data: {
            url: notification.action_url || "/flashfitshop/index.html",
            role: notification.role,
            recipient_id: String(notification.recipient_id || ""),
            event_type: notification.event_type,
            order_number: notification.order_number
          }
        }));
        results.push({ endpoint: sub.endpoint, ok: true });
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        results.push({ endpoint: sub.endpoint, ok: false, statusCode, message: String(error?.message || error) });
        if ([404, 410].includes(statusCode)) {
          await supabase.from("push_subscriptions").update({ active: false }).eq("id", sub.id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
