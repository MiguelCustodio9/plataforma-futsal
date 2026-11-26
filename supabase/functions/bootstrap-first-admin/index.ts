import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-bootstrap-secret",
  "content-type": "application/json",
};

function jsonResponse(status: number, body: Record<string, string>, origin: string | null, allowedOrigin: string) {
  const headers = new Headers(corsHeaders);
  if (origin && origin === allowedOrigin) headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  return new Response(JSON.stringify(body), { status, headers });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const allowedOrigin = Deno.env.get("BOOTSTRAP_ALLOWED_ORIGIN") ?? "";

  if (request.method === "OPTIONS") {
    if (!origin || origin !== allowedOrigin) {
      return new Response(null, { status: 403 });
    }
    return new Response("ok", {
      headers: { ...corsHeaders, "access-control-allow-origin": origin, vary: "Origin" },
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido." }, origin, allowedOrigin);
  }

  const bootstrapSecret = Deno.env.get("BOOTSTRAP_SECRET") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const redirectUrl = Deno.env.get("BOOTSTRAP_REDIRECT_URL") ?? "";

  if (
    bootstrapSecret.length < 32 ||
    !supabaseUrl ||
    !serviceRoleKey ||
    !redirectUrl
  ) {
    return jsonResponse(503, { error: "Bootstrap não configurado no servidor." }, origin, allowedOrigin);
  }

  const suppliedSecret = request.headers.get("x-bootstrap-secret") ?? "";
  if (!constantTimeEqual(suppliedSecret, bootstrapSecret)) {
    return jsonResponse(401, { error: "Pedido não autorizado." }, origin, allowedOrigin);
  }

  let payload: { email?: unknown; display_name?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Pedido inválido." }, origin, allowedOrigin);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const displayName = typeof payload.display_name === "string" ? payload.display_name.trim() : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    displayName.length < 1 ||
    displayName.length > 120
  ) {
    return jsonResponse(400, { error: "Indica um email e nome válidos." }, origin, allowedOrigin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // O convite envia o link de ativação; o papel é atribuído apenas pela RPC protegida.
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: redirectUrl,
  });

  if (inviteError || !invitation.user) {
    return jsonResponse(409, { error: "Não foi possível criar o convite inicial." }, origin, allowedOrigin);
  }

  const { error: profileError } = await admin.rpc("bootstrap_first_admin", {
    p_user_id: invitation.user.id,
    p_display_name: displayName,
  });

  if (profileError) {
    // Evita deixar uma conta Auth órfã se o bootstrap já tiver sido consumido.
    await admin.auth.admin.deleteUser(invitation.user.id);
    return jsonResponse(409, { error: "O bootstrap já foi utilizado ou não pôde ser concluído." }, origin, allowedOrigin);
  }

  return jsonResponse(201, { message: "Convite inicial enviado. O bootstrap ficou bloqueado." }, origin, allowedOrigin);
});
