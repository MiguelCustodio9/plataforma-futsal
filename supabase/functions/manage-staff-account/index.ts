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

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) return respond(401, { error: "Sessão inválida ou serviço não configurado." });

  const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return respond(401, { error: "Sessão inválida." });

  const managerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: manager, error: managerError } = await managerClient.from("profiles")
    .select("role, status").eq("id", authData.user.id).maybeSingle();
  if (managerError || !manager || manager.status !== "ativo" ||
      !["administrador_principal", "treinador_principal"].includes(manager.role)) {
    return respond(403, { error: "Apenas o Administrador Principal e o Treinador Principal podem gerir acessos Staff." });
  }

  let payload: { action?: unknown; staffMemberId?: unknown };
  try { payload = await request.json(); } catch { return respond(400, { error: "Pedido inválido." }); }
  const action = payload.action;
  const staffMemberId = payload.staffMemberId;
  if (!["resend_invite", "delete_account"].includes(String(action)) || !isUuid(staffMemberId)) {
    return respond(400, { error: "Operação ou elemento de Staff inválido." });
  }

  const { data: member, error: memberError } = await admin.from("staff_members")
    .select("id, name, email, status, profile_id")
    .eq("id", staffMemberId).maybeSingle();
  if (memberError || !member) return respond(404, { error: "Elemento de Staff não encontrado." });

  if (action === "delete_account") {
    if (!member.profile_id) return respond(409, { error: "Este elemento não tem uma conta de acesso associada." });
    const { data: targetProfile, error: targetProfileError } = await admin.from("profiles")
      .select("role").eq("id", member.profile_id).maybeSingle();
    if (targetProfileError || !targetProfile || targetProfile.role !== "staff") {
      return respond(409, { error: "A conta associada não é uma conta Staff válida." });
    }
    if (member.profile_id === authData.user.id) return respond(409, { error: "Não podes eliminar a tua própria conta através desta operação." });

    const targetUserId = member.profile_id;
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteError) return respond(502, { error: "Não foi possível eliminar a conta de acesso. A ficha foi mantida." });

    const deletedAt = new Date().toISOString();
    const { error: memberUpdateError } = await admin.from("staff_members")
      .update({ profile_id: null, account_deleted_at: deletedAt }).eq("id", member.id);
    const { error: auditError } = await admin.from("staff_account_audit").insert({
      staff_member_id: member.id,
      target_auth_user_id: targetUserId,
      actor_profile_id: authData.user.id,
      event_type: "account_deleted",
    });
    if (memberUpdateError || auditError) {
      console.error("Conta eliminada, mas houve falha ao concluir registos de auditoria:", {
        memberUpdateError: memberUpdateError?.message, auditError: auditError?.message,
      });
      return respond(500, { error: "A conta foi eliminada, mas não foi possível concluir todos os registos. Contacta o administrador." });
    }
    return respond(200, { message: "Conta de acesso eliminada. A ficha Staff e o histórico foram preservados." });
  }

  if (!["convite_enviado", "convite_expirado"].includes(member.status)) {
    return respond(409, { error: "Só é possível reenviar convites pendentes ou expirados." });
  }

  if (member.profile_id) {
    const { data: existingUser, error: existingUserError } = await admin.auth.admin.getUserById(member.profile_id);
    if (existingUserError) return respond(502, { error: "Não foi possível validar a conta associada." });
    if (existingUser.user?.email_confirmed_at) {
      return respond(409, { error: "Esta conta já foi confirmada. Não é necessário reenviar o convite." });
    }
    const { error: removePendingError } = await admin.auth.admin.deleteUser(member.profile_id);
    if (removePendingError) return respond(502, { error: "Não foi possível invalidar o convite anterior." });
  }

  const redirectTo = Deno.env.get("APP_REDIRECT_URL") ?? "https://miguelcustodio9.github.io/plataforma-futsal/";
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    member.email, { data: { display_name: member.name }, redirectTo },
  );
  if (inviteError || !invitation.user) {
    return respond(502, { error: "Não foi possível enviar um novo convite. Verifica a configuração de email." });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invitation.user.id, display_name: member.name, role: "staff", status: "convite_pendente",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return respond(500, { error: "O novo convite não pôde ser associado ao perfil." });
  }

  const sentAt = new Date();
  const { error: updateError } = await admin.from("staff_members").update({
    profile_id: invitation.user.id,
    status: "convite_enviado",
    invite_sent_at: sentAt.toISOString(),
    invite_expires_at: new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    account_deleted_at: null,
  }).eq("id", member.id);
  if (updateError) {
    await admin.auth.admin.deleteUser(invitation.user.id);
    return respond(500, { error: "Não foi possível atualizar a ficha. O novo convite foi invalidado." });
  }

  const { error: auditError } = await admin.from("staff_account_audit").insert({
    staff_member_id: member.id,
    target_auth_user_id: invitation.user.id,
    actor_profile_id: authData.user.id,
    event_type: "invite_resent",
  });
  if (auditError) {
    console.error("Convite enviado, mas falhou a auditoria:", auditError.message);
    return respond(500, { error: "O convite foi enviado, mas não foi possível concluir o registo de auditoria." });
  }
  return respond(200, { message: "Novo convite enviado com sucesso." });
});
