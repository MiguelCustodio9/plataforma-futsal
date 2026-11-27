import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getTimeZones } from "@vvo/tzdb";
import geoClient from "countrycitystatejson/client";
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
  actor_display_name?: string;
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

const allTimeZones = getTimeZones({ locale: "pt" });
const countryCollator = new Intl.Collator("pt", { sensitivity: "base" });
const countryNames = new Intl.DisplayNames(["pt-PT"], { type: "region" });

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
  const [localityOptions, setLocalityOptions] = useState<string[]>([]);
  const [localitiesLoading, setLocalitiesLoading] = useState(false);

  const countryOptions = useMemo(
    () => geoClient.getCountries().map((country) => ({
      code: country.shortName,
      name: countryNames.of(country.shortName) ?? country.name,
    })).sort((a, b) => countryCollator.compare(a.name, b.name)),
    [],
  );

  const selectedCountry = countryOptions.find((country) => country.name === draft.country);
  const selectedCountryCode = selectedCountry?.code ?? "";
  const zonesForCountry = useMemo(
    () => selectedCountryCode ? allTimeZones.filter((zone) => zone.countryCode === selectedCountryCode) : [],
    [selectedCountryCode],
  );

  useEffect(() => {
    if (!selectedCountryCode) {
      setLocalityOptions([]);
      return;
    }
    let cancelled = false;
    setLocalitiesLoading(true);
    const states = geoClient.getStatesByShort(selectedCountryCode) ?? [];
    Promise.all(states.map((state) => geoClient.getCities(selectedCountryCode, state)))
      .then((cityLists) => {
        if (cancelled) return;
        setLocalityOptions(Array.from(new Set(cityLists.flatMap((cities) => cities ?? [])))
          .sort(countryCollator.compare));
      })
      .catch(() => {
        if (!cancelled) setLocalityOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLocalitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCountryCode]);
  const zonesForLocality = useMemo(
    () => zonesForCountry.filter((zone) => zone.mainCities.includes(draft.locality)),
    [zonesForCountry, draft.locality],
  );
  const timezoneOptions = zonesForLocality.length ? zonesForLocality : zonesForCountry;
  const selectedTimezone = timezoneOptions.find(
    (zone) => zone.name === draft.timezone || zone.group.includes(draft.timezone),
  );

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
      const auditRows = (auditResult.data ?? []) as AuditRow[];
      const actorIds = [...new Set(auditRows.map((row) => row.actor_profile_id).filter((id): id is string => Boolean(id)))];
      if (actorIds.length) {
        const actorsResult = await supabase.from("profiles").select("id,display_name").in("id", actorIds);
        const actorNames = new Map((actorsResult.data ?? []).map((actor: { id: string; display_name: string }) => [actor.id, actor.display_name]));
        setAudit(auditRows.map((row) => ({ ...row, actor_display_name: row.actor_profile_id ? actorNames.get(row.actor_profile_id) : undefined })));
      } else {
        setAudit(auditRows);
      }
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

  const updateCountry = (countryCode: string) => {
    const country = countryOptions.find((item) => item.code === countryCode);
    if (!country) return;
    const firstZone = allTimeZones.find((zone) => zone.countryCode === countryCode);
    setDraft((current) => ({
      ...current,
      country: country.name,
      locality: "",
      timezone: firstZone?.name ?? "",
    }));
  };

  const updateLocality = (locality: string) => {
    const matchingZone = zonesForCountry.find((zone) => zone.mainCities.includes(locality));
    setDraft((current) => ({
      ...current,
      locality,
      timezone: matchingZone?.name ?? current.timezone,
    }));
  };

  const updateColor = (entity: "club" | "team", key: string, value: string) => {
    const field = entity === "club" ? "club_colors" : "team_colors";
    setDraft((current) => ({ ...current, [field]: { ...current[field], [key]: value } }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      new Intl.DateTimeFormat("pt-PT", { timeZone: draft.timezone }).format(new Date());
    } catch {
      setError("Indica um fuso horário IANA válido, por exemplo Europe/Lisbon.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const uploadedPaths: string[] = [];
    let clubEmblemPath = draft.club_emblem_path;
    let teamEmblemPath = draft.team_emblem_path;
    const uploadEmblem = async (file: File, folder: "clube" | "equipa") => {
      const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
      const path = folder + "/" + crypto.randomUUID() + "." + extension;
      const result = await supabase.storage.from("platform-branding").upload(path, file, { upsert: false, contentType: file.type });
      if (result.error) throw result.error;
      uploadedPaths.push(path);
      return path;
    };
    try {
      if (clubFile) clubEmblemPath = await uploadEmblem(clubFile, "clube");
      if (teamFile) teamEmblemPath = await uploadEmblem(teamFile, "equipa");
    } catch (uploadError) {
      if (uploadedPaths.length) await supabase.storage.from("platform-branding").remove(uploadedPaths);
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível carregar o emblema.");
      setSaving(false);
      return;
    }
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
      if (uploadedPaths.length) await supabase.storage.from("platform-branding").remove(uploadedPaths);
      setError(saveError.message);
    } else {
      setNotice("Configurações guardadas e registadas no histórico.");
      setShowConfirmation(false);
      setClubFile(null);
      setTeamFile(null);
      setClubPreview("");
      setTeamPreview("");
      await loadSettings();
    }
    setSaving(false);
  };
  const resetDraft = () => {
    setDraft(settings);
    setClubFile(null);
    setTeamFile(null);
    setClubPreview("");
    setTeamPreview("");
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
            <h3>Localização e fuso horário</h3><p>Seleciona primeiro o país. As localidades disponíveis e os fusos horários são filtrados automaticamente; o fuso horário é sugerido pela localidade e pode ser ajustado manualmente.</p>
            <label>País
              <select value={selectedCountry?.code ?? ""} onChange={(event) => updateCountry(event.target.value)}>
                <option value="">Selecionar país</option>
                {countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </select>
            </label>
            <label>Localidade / cidade
              <select value={draft.locality} onChange={(event) => updateLocality(event.target.value)} disabled={!selectedCountry || localitiesLoading}>
                <option value="">{localitiesLoading ? "A carregar localidades…" : "Selecionar localidade"}</option>
                {draft.locality && !localityOptions.includes(draft.locality) && <option value={draft.locality}>{draft.locality} (valor guardado)</option>}
                {localityOptions.map((locality) => <option key={locality} value={locality}>{locality}</option>)}
              </select>
              <span className="settings-field-hint">A lista inclui as localidades catalogadas para o país selecionado. Os dados são carregados apenas quando escolhes o país.</span>
            </label>
            <label>Fuso horário
              <select value={selectedTimezone?.name ?? draft.timezone} onChange={(event) => updateDraft("timezone", event.target.value)} disabled={!selectedCountry}>
                {!selectedTimezone && draft.timezone && <option value={draft.timezone}>{draft.timezone} (valor guardado)</option>}
                {timezoneOptions.map((zone) => <option key={zone.name} value={zone.name}>{zone.currentTimeFormat} · {zone.name}</option>)}
              </select>
            </label>
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
