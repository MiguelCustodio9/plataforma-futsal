import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

type Settings = {
  club_name: string;
  club_emblem_path: string | null;
  club_colors: Record<string, string>;
  team_name: string;
  team_emblem_path: string | null;
  team_colors: Record<string, string>;
  country: string;
  locality: string;
  timezone: string;
  updated_at?: string;
};

type AuditRow = {
  id: number;
  actor_profile_id: string | null;
  setting_key: string;
  previous_value: unknown;
  new_value: unknown;
  outcome: string;
  created_at: string;
};

const tabs = [
  "Identidade do clube",
  "Identidade da equipa",
  "Época desportiva",
  "Localização e fuso horário",
  "Estado dos serviços",
  "Histórico de alterações",
] as const;

type Tab = typeof tabs[number];

const emptySettings: Settings = {
  club_name: "",
  club_emblem_path: null,
  club_colors: { principal: "#166534", secundaria: "#f8fafc" },
  team_name: "",
  team_emblem_path: null,
  team_colors: { principal: "#166534", secundaria: "#f8fafc" },
  country: "Portugal",
  locality: "",
  timezone: "Europe/Lisbon",
};

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function PlatformSettings() {
  const [tab, setTab] = useState<Tab>("Identidade do clube");
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [draft, setDraft] = useState<Settings>(emptySettings);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [authStatus, setAuthStatus] = useState("A verificar…");
  const [databaseStatus, setDatabaseStatus] = useState("A verificar…");
  const [clubFile, setClubFile] = useState<File | null>(null);
  const [teamFile, setTeamFile] = useState<File | null>(null);
  const [clubPreview, setClubPreview] = useState("");
  const [teamPreview, setTeamPreview] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    const [settingsResult, auditResult, authResult] = await Promise.all([
      supabase.from("platform_settings").select("*").eq("singleton", true).single(),
      supabase.from("platform_settings_audit").select("id,actor_profile_id,setting_key,previous_value,new_value,outcome,created_at").order("created_at", { ascending: false }).limit(100),
      supabase.auth.getSession(),
    ]);
    if (settingsResult.error) {
      setError(settingsResult.error.message.includes("platform_settings")
        ? "As tabelas das configurações ainda não estão disponíveis. Aplica primeiro a migração indicada no repositório."
        : settingsResult.error.message);
      setDatabaseStatus("Indisponível");
    } else {
      const current = settingsResult.data as Settings;
      setSettings(current);
      setDraft(current);
      setDatabaseStatus("Disponível");
    }
    if (auditResult.error) {
      if (!settingsResult.error) setError(auditResult.error.message);
      setAudit([]);
    } else {
      setAudit((auditResult.data ?? []) as AuditRow[]);
    }
    setAuthStatus(authResult.error ? "Com problemas" : authResult.data.session ? "Disponível" : "Sessão não confirmada");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateDraft = (key: keyof Settings, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateColor = (entity: "club" | "team", key: string, value: string) => {
    const field = entity === "club" ? "club_colors" : "team_colors";
    setDraft((current) => ({ ...current, [field]: { ...current[field], [key]: value } }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const { error: saveError } = await supabase.from("platform_settings").update({
      club_name: draft.club_name.trim(),
      club_emblem_path: clubEmblemPath || null,
      club_colors: draft.club_colors,
      team_name: draft.team_name.trim(),
      team_emblem_path: teamEmblemPath || null,
      team_colors: draft.team_colors,
      country: draft.country.trim(),
      locality: draft.locality.trim(),
      timezone: draft.timezone.trim(),
    }).eq("singleton", true);
    if (saveError) {
      setError(saveError.message);
    } else {
      setNotice("Configurações guardadas e registadas no histórico.");
      setShowConfirmation(false);
      await loadSettings();
    }
    setSaving(false);
  };

  const resetDraft = () => {
    setDraft(settings);
    setShowConfirmation(false);
  };

  return (
    <div className="content platform-settings-content">
      <div className="staff-heading">
        <div><span className="eyebrow">ADMINISTRAÇÃO PRINCIPAL</span><h2>Configurações da plataforma</h2><p>Identidade, localização, serviços e histórico da plataforma.</p></div>
      </div>
      <nav className="platform-settings-tabs" aria-label="Secções das configurações">
        {tabs.map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {loading ? <div className="empty-state"><strong>A carregar configurações…</strong></div> : (
        <>
          {tab === "Identidade do clube" && <section className="settings-panel">
            <h3>Identidade do clube</h3><p>As alterações são confirmadas antes de guardar. A identidade histórica deve permanecer associada aos registos da respetiva época.</p>
            <label>Nome do clube<input value={draft.club_name} maxLength={160} onChange={(event) => updateDraft("club_name", event.target.value)} /></label>
            <label>Emblema do clube<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) return; if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) { setError("O emblema deve ser PNG, JPG ou WebP e ter no máximo 3 MB."); event.target.value = ""; return; } setError(""); setClubFile(file); setClubPreview(URL.createObjectURL(file)); }} /></label>{(clubPreview || draft.club_emblem_path) && <p className="settings-emblem-note">{clubPreview ? "Novo emblema selecionado para pré-visualização." : `Emblema guardado: ${draft.club_emblem_path}`}</p>}
            <div className="settings-color-row"><label>Cor principal<input type="color" value={draft.club_colors.principal ?? "#166534"} onChange={(event) => updateColor("club", "principal", event.target.value)} /></label><label>Cor secundária<input type="color" value={draft.club_colors.secundaria ?? "#f8fafc"} onChange={(event) => updateColor("club", "secundaria", event.target.value)} /></label></div>
            <button className="primary-button" type="button" onClick={() => setShowConfirmation(true)}>Pré-visualizar e guardar</button>
          </section>}

          {tab === "Identidade da equipa" && <section className="settings-panel">
            <h3>Identidade da equipa</h3><p>A identidade da equipa é independente da identidade do clube.</p>
            <label>Nome da equipa<input value={draft.team_name} maxLength={160} onChange={(event) => updateDraft("team_name", event.target.value)} /></label>
            <label>Emblema da equipa<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (!file) return; if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) { setError("O emblema deve ser PNG, JPG ou WebP e ter no máximo 3 MB."); event.target.value = ""; return; } setError(""); setTeamFile(file); setTeamPreview(URL.createObjectURL(file)); }} /></label>{(teamPreview || draft.team_emblem_path) && <p className="settings-emblem-note">{teamPreview ? "Novo emblema selecionado para pré-visualização." : `Emblema guardado: ${draft.team_emblem_path}`}</p>}
            <div className="settings-color-row"><label>Cor principal<input type="color" value={draft.team_colors.principal ?? "#166534"} onChange={(event) => updateColor("team", "principal", event.target.value)} /></label><label>Cor secundária<input type="color" value={draft.team_colors.secundaria ?? "#f8fafc"} onChange={(event) => updateColor("team", "secundaria", event.target.value)} /></label></div>
            <button className="primary-button" type="button" onClick={() => setShowConfirmation(true)}>Pré-visualizar e guardar</button>
          </section>}

          {tab === "Época desportiva" && <section className="settings-panel"><h3>Época desportiva</h3><p>Consulta apenas. O Administrador Principal não pode criar, trocar, encerrar ou reabrir épocas.</p><div className="settings-info"><strong>Informação da época</strong><span>Não existe ainda um módulo de épocas ligado às configurações. Esta secção ficará ligada quando o modelo de épocas for implementado.</span></div></section>}

          {tab === "Localização e fuso horário" && <section className="settings-panel">
            <h3>Localização e fuso horário</h3><p>As alterações aplicam-se a novos horários. Os instantes dos registos históricos não devem ser reinterpretados.</p>
            <label>País<input value={draft.country} maxLength={120} onChange={(event) => updateDraft("country", event.target.value)} /></label>
            <label>Localidade<input value={draft.locality} maxLength={160} onChange={(event) => updateDraft("locality", event.target.value)} /></label>
            <label>Fuso horário (identificador IANA)<input value={draft.timezone} maxLength={80} onChange={(event) => updateDraft("timezone", event.target.value)} placeholder="Europe/Lisbon" /></label>
            <button className="primary-button" type="button" onClick={() => setShowConfirmation(true)}>Pré-visualizar e guardar</button>
          </section>}

          {tab === "Estado dos serviços" && <section className="settings-panel"><h3>Estado dos serviços</h3><p>Esta área é exclusivamente informativa. Não permite ativar, desativar ou contratar serviços.</p><div className="service-status-list">
            <div><span>Autenticação</span><strong>{authStatus}</strong></div><div><span>Base de dados</span><strong>{databaseStatus}</strong></div><div><span>Armazenamento</span><strong>Não verificado</strong></div><div><span>Notificações</span><strong>Não verificado</strong></div><div><span>Sincronização offline</span><strong>Não verificado</strong></div>
          </div></section>}

          {tab === "Histórico de alterações" && <section className="settings-panel"><h3>Histórico de alterações</h3><p>Registos gerados automaticamente na base de dados. Consulta apenas.</p>
            {audit.length === 0 ? <div className="empty-state"><strong>Sem alterações registadas.</strong></div> : <div className="settings-audit-list">{audit.map((row) => <article key={row.id}><div><strong>{row.setting_key}</strong><span>{row.actor_display_name ?? row.actor_profile_id ?? "Utilizador não identificado"} · {new Date(row.created_at).toLocaleString("pt-PT")}</span></div><p><span>Anterior: {valueLabel(row.previous_value)}</span><span>Novo: {valueLabel(row.new_value)}</span></p></article>)}</div>}
          </section>}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="demo-notice" role="status">{notice}</p>}
      <div className="settings-footer"><button type="button" className="secondary-button" onClick={() => void loadSettings()}>Atualizar informação</button><span>Área exclusiva do Administrador Principal</span></div>

      {showConfirmation && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) resetDraft(); }}>
        <section className="staff-modal settings-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="settings-confirm-title">
          <div className="modal-heading"><div><span className="eyebrow">CONFIRMAÇÃO DE ALTERAÇÕES</span><h2 id="settings-confirm-title">Pré-visualização</h2></div><button className="icon-button" type="button" onClick={resetDraft} aria-label="Fechar" disabled={saving}>×</button></div>
          <div className="settings-preview"><div><strong>{draft.club_name || "Clube sem nome"}</strong><span>{draft.team_name || "Equipa sem nome"}</span></div>{(clubPreview || teamPreview) && <div className="settings-preview-emblems">{clubPreview && <img src={clubPreview} alt="Pré-visualização do emblema do clube" />}{teamPreview && <img src={teamPreview} alt="Pré-visualização do emblema da equipa" />}</div>}<div className="settings-preview-swatches"><i style={{ background: draft.club_colors.principal ?? "#166534" }} /><i style={{ background: draft.club_colors.secundaria ?? "#f8fafc" }} /><i style={{ background: draft.team_colors.principal ?? "#166534" }} /><i style={{ background: draft.team_colors.secundaria ?? "#f8fafc" }} /></div><p>{draft.country} · {draft.locality} · {draft.timezone}</p></div>
          <p>Ao guardar, as novas definições passam a ser utilizadas na configuração atual. Os registos históricos não devem ser alterados retroativamente.</p>
          <form onSubmit={save}><div className="modal-actions"><button type="button" className="secondary-button" onClick={resetDraft} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "A guardar…" : "Confirmar e guardar"}</button></div></form>
        </section>
      </div>}
    </div>
  );
}
