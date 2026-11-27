import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { supabase } from "./lib/supabase";
import { UsageLimits } from "./UsageLimits";

vi.mock("./lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() } },
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
          retrievedAt: "2026-11-27T10:01:00Z",
        },
      },
      error: null,
    } as never);

    render(<UsageLimits />);
    expect(await screen.findByText("Monitorização ligada")).toBeInTheDocument();
    expect(screen.getByText(/12\s?345/)).toBeInTheDocument();
    expect(screen.getByText("Autenticação")).toBeInTheDocument();
    expect(screen.getByText("840")).toBeInTheDocument();
    expect(screen.getByText("Histórico de utilização")).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("monitor-platform-usage", { body: {} });
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
    expect(screen.getByText("SUPABASE_MANAGEMENT_READ_TOKEN")).toBeInTheDocument();
    expect(screen.getByText(/Não partilhes o seu valor/)).toBeInTheDocument();
  });

  it("não transforma uma falha de consulta em consumo zero", async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error("network error"));

    render(<UsageLimits />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível consultar a utilização");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
