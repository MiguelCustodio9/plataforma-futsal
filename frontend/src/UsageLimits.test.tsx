import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { supabase } from "./lib/supabase";
import { UsageLimits } from "./UsageLimits";

vi.mock("./lib/supabase", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

afterEach(() => cleanup());

describe("Utilização e limites", () => {
  it("apresenta métricas reais devolvidas pelo serviço", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        configured: true,
        status: "available",
        message: "Métricas recebidas diretamente da Management API do Supabase.",
        metrics: {
          apiRequestsCount: 12345,
          apiCounts: [{
            timestamp: "2026-11-27T10:00:00Z",
            authRequests: 120,
            realtimeRequests: 35,
            restRequests: 840,
            storageRequests: 22,
          }],
          latest: {
            timestamp: "2026-11-27T10:00:00Z",
            authRequests: 120,
            realtimeRequests: 35,
            restRequests: 840,
            storageRequests: 22,
          },
          apiCountsAvailable: true,
          requestCountAvailable: true,
          databaseSizeBytes: 524288000,
          storageSizeBytes: 104857600,
          storageSnapshotAvailable: true,
          monthlyHistory: [{
            snapshot_month: "2026-11-01",
            database_size_bytes: 524288000,
            storage_size_bytes: 104857600,
            api_requests_count: 12345,
            captured_at: "2026-11-27T10:01:00Z",
          }],
          monthlyHistoryAvailable: true,
          retrievedAt: "2026-11-27T10:01:00Z",
        },
      },
      error: null,
    } as never);

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { feature_key: "staff", event_count: 18 },
        { feature_key: "usage_limits", event_count: 7 },
      ],
      error: null,
    } as never);

    render(<UsageLimits />);
    expect(await screen.findByText("Monitorização ligada")).toBeInTheDocument();
    expect(screen.getByText("Utilização por funcionalidade")).toBeInTheDocument();
    expect(screen.getByText("Gestão de Staff")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getAllByText(/12\s?345/)).toHaveLength(2);
    expect(screen.getByText("Autenticação")).toBeInTheDocument();
    expect(screen.getAllByText("840")).toHaveLength(2);
    expect(screen.getByText("Histórico de utilização")).toBeInTheDocument();
    expect(screen.getByText("Histórico mensal persistente")).toBeInTheDocument();
    expect(screen.getByText("Avisos preventivos e previsão")).toBeInTheDocument();
    expect(screen.getByText("Limite atingido")).toBeInTheDocument();
    expect(screen.getByText(/Disponível após existirem registos de pelo menos dois meses distintos/)).toBeInTheDocument();
    expect(screen.getByText("novembro de 2026")).toBeInTheDocument();
    expect(screen.getByText("Ocupação atual")).toBeInTheDocument();
    expect(screen.getAllByText("500 MB")).toHaveLength(3);
    expect(screen.getAllByText("100 MB")).toHaveLength(3);
    expect(supabase.functions.invoke).toHaveBeenCalledWith("monitor-platform-usage", { body: {} });
    expect(supabase.rpc).toHaveBeenCalledWith("get_platform_feature_usage");
  });

  it("explica como configurar o token sem o expor na interface", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        configured: false,
        status: "not_configured",
        message: "A monitorização ainda não está configurada.",
        metrics: null,
      },
      error: null,
    } as never);

    render(<UsageLimits />);
    expect(await screen.findByText("Configuração pendente")).toBeInTheDocument();
    expect(screen.getByText("MANAGEMENT_READ_TOKEN")).toBeInTheDocument();
    expect(screen.getByText(/Não partilhes o seu valor/)).toBeInTheDocument();
  });

  it("não transforma uma falha de consulta em consumo zero", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error("network error"));

    render(<UsageLimits />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar a utilização");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("estima o tempo até à quota apenas com dois registos mensais distintos", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        configured: true,
        status: "available",
        message: "Métricas recebidas diretamente da Management API do Supabase.",
        metrics: {
          apiRequestsCount: 12345,
          apiCounts: [],
          latest: null,
          apiCountsAvailable: false,
          requestCountAvailable: true,
          databaseSizeBytes: 400 * 1024 * 1024,
          storageSizeBytes: 100 * 1024 * 1024,
          storageSnapshotAvailable: true,
          monthlyHistory: [
            {
              snapshot_month: "2026-11-01",
              database_size_bytes: 400 * 1024 * 1024,
              storage_size_bytes: 100 * 1024 * 1024,
              api_requests_count: 12345,
              captured_at: "2026-11-01T10:00:00Z",
            },
            {
              snapshot_month: "2026-10-01",
              database_size_bytes: 300 * 1024 * 1024,
              storage_size_bytes: 90 * 1024 * 1024,
              api_requests_count: 10000,
              captured_at: "2026-10-01T10:00:00Z",
            },
          ],
          monthlyHistoryAvailable: true,
          retrievedAt: "2026-11-27T10:01:00Z",
        },
      },
      error: null,
    } as never);

    render(<UsageLimits />);
    expect(await screen.findByText("Avisos preventivos e previsão")).toBeInTheDocument();
    expect(screen.getAllByText(/Previsão: cerca de .* dias até ao limite/)).toHaveLength(2);
    expect(screen.getByText("Atenção")).toBeInTheDocument();
  });

});
