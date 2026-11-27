import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { supabase } from "./lib/supabase";
import { SecurityActivity } from "./SecurityActivity";

vi.mock("./lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

afterEach(() => cleanup());

describe("Segurança e atividade", () => {
  it("apresenta o estado das contas e os registos de atividade", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        accounts: [{
          id: "security-user-1",
          display_name: "Conta de teste",
          email: "teste@exemplo.pt",
          role: "staff",
          status: "ativo",
          email_confirmed: true,
          last_sign_in_at: "2026-11-27T10:00:00Z",
          banned_until: null,
        }],
        events: [{
          id: "access-event-1",
          source: "acessos",
          event_type: "account_suspended",
          actor_name: "Admin",
          target_name: "Conta de teste",
          detail: "Estado: ativo → suspenso",
          created_at: "2026-11-27T10:10:00Z",
        }],
      },
      error: null,
    } as never);

    render(<SecurityActivity />);
    expect(await screen.findAllByText("Conta de teste")).not.toHaveLength(0);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.getByText("Conta suspensa")).toBeInTheDocument();
    expect(supabase.functions.invoke).toHaveBeenCalledWith("manage-platform-access", {
      body: { action: "security_overview" },
    });
  });
});
