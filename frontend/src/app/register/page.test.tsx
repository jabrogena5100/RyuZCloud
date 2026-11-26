import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { authValue } from "@/test/fixtures";
import RegisterPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      signupStatus: vi.fn(),
      listVideos: vi.fn().mockResolvedValue({ items: [] }),
      stats: vi.fn().mockRejectedValue(new Error("offline")),
    },
  };
});

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(authValue(false));
});

describe("RegisterPage", () => {
  it("shows the sign-up form when sign-up is open", async () => {
    vi.mocked(api.signupStatus).mockResolvedValue({ open: true });
    render(<RegisterPage />);
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  it("says sign-up is closed, and keeps the form behind 'Invited?'", async () => {
    vi.mocked(api.signupStatus).mockResolvedValue({ open: false });
    render(<RegisterPage />);
    expect(await screen.findByRole("heading", { name: "Sign-up is closed" })).toBeInTheDocument();
    expect(screen.getByText(/New accounts are closed on this site/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the library" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Invited? Create your account")).toBeInTheDocument();
  });

  it("falls back to the form when the status request fails (the API still enforces it)", async () => {
    vi.mocked(api.signupStatus).mockRejectedValue(new Error("network"));
    render(<RegisterPage />);
    await vi.waitFor(() => expect(api.signupStatus).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });
});
