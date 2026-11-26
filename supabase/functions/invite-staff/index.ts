import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const allowedOrigin = Deno.env.get("APP_ALLOWED_ORIGIN") ?? "https://miguelcustodio9.github.io";
const corsHeaders = {
  "access-control-allow-origin": allowedOrigin,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "content-type": "application/json",
  vary: "Origin",
};

function respond(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    if (request.headers.get("origin") !== allowedOrigin) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST" || request.headers.get("origin") !== allowedOrigin) {
    return respond(403, { error: "Pedido não autorizado." });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const redirectTo = Deno.env.get("APP_REDIRECT_URL") ?? "https://miguelcustodio9.github.io/plataforma-futsal/";

  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(401, { error: "Sessão inválida ou serviço não configurado." });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond(401, { error: "Sessão inválida." });

  // A consulta do perfil é feita com o JWT do próprio gestor.
  // A política RLS permite-lhe ler o seu perfil; não exige privilégios elevados.
  const managerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: manager, error: managerError } = await managerClient.from("profiles")
    .select("role, status").eq("id", authData.user.id).maybeSingle();
  if (managerError) {
    console.error("Erro ao consultar perfil do gestor:", {
      code: managerError.code,
      message: managerError.message,
      details: managerError.details,
      hint: managerError.hint,
    });
    return respond(500, {
      error: "Não foi possível validar o perfil da conta.",
      diagnostic: [managerError.code, managerError.message].filter(Boolean).join(" — "),
    });
  }
  if (!manager) {
    console.error("Perfil do utilizador autenticado não encontrado.");
    return respond(403, { error: "A conta autenticada não tem um perfil associado na plataforma." });
  }
  if (manager.status !== "ativo") {
    console.error("Conta gestora não está ativa:", manager.status);
    return respond(403, { error: "A conta tem de estar ativa para enviar convites." });
  }
  if (!["administrador_principal", "treinador_principal"].includes(manager.role)) {
    console.error("Papel sem permissões para gerir Staff:", manager.role);
    return respond(403, { error: "O papel desta conta não permite gerir o Staff." });
  }

  let payload: { staffMemberId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return respond(400, { error: "Pedido inválido." });
  }
  const staffMemberId = typeof payload.staffMemberId === "string" ? payload.staffMemberId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffMemberId)) {
    return respond(400, { error: "Elemento de Staff inválido." });
  }

  const { data: member, error: memberError } = await admin.from("staff_members")
    .select("id, name, email, status, profile_id")
    .eq("id", staffMemberId).maybeSingle();
  if (memberError || !member) return respond(404, { error: "Elemento de Staff não encontrado." });
  if (member.profile_id) return respond(409, { error: "Este elemento já tem uma conta associada." });
  if (!["pendente", "convite_expirado"].includes(member.status)) {
    return respond(409, { error: "O estado atual não permite enviar um convite." });
  }

  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    member.email,
    { data: { display_name: member.name }, redirectTo },
  );
  if (inviteError || !invitation.user) {
    return respond(502, { error: "Não foi possível enviar o convite. Verifica a configuração de email da Supabase." });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invitation.user.id,
    display_name: member.name,
    role: "staff",
    status: "convite_pendente",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return respond(500, { error: "O convite não pôde ser associado ao perfil. O link enviado foi invalidado." });
  }

  const sentAt = new Date();
  const { error: updateError } = await admin.from("staff_members").update({
    profile_id: invitation.user.id,
    status: "convite_enviado",
    invite_sent_at: sentAt.toISOString(),
    invite_expires_at: new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq("id", staffMemberId);
  if (updateError) {
    await admin.from("profiles").delete().eq("id", invitation.user.id);
    await admin.auth.admin.deleteUser(invitation.user.id);
    return respond(500, { error: "Não foi possível atualizar o registo. O link enviado foi invalidado." });
  }

  return respond(200, { message: "Convite enviado com sucesso." });
});
