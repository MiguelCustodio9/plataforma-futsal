import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("estrutura inicial da plataforma", () => {
  it("apresenta o centro de controlo e as áreas planeadas", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Centro de controlo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Áreas do projeto" })).toBeInTheDocument();
    expect(screen.getAllByText("Biblioteca de vídeos")).toHaveLength(2);
  });

  it("identifica que a aplicação ainda não tem sessão iniciada", () => {
    render(<App />);
    expect(screen.getByLabelText("Sem sessão iniciada")).toBeInTheDocument();
  });
});
