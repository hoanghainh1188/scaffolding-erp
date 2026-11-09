import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/domain/role";

import { UserMenu } from "./user-menu";

vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

async function open(role: Role, systemAdmin = false) {
  render(
    <UserMenu user={{ name: "Người A", username: "a", role, systemAdmin }} />,
  );
  await userEvent.click(screen.getByRole("button"));
}

const item = (name: string) => screen.queryByRole("menuitem", { name });

describe("UserMenu", () => {
  it.each(["DIRECTOR", "ACCOUNTANT"] as const)(
    "links %s to 2FA",
    async (role) => {
      await open(role);
      expect(item("Xác thực 2 lớp")).toBeInTheDocument();
    },
  );

  it("hides 2FA from a sales account", async () => {
    await open("SALES");
    expect(item("Xác thực 2 lớp")).toBeNull();
  });

  it("gives a flagged sales account both links", async () => {
    await open("SALES", true);
    expect(item("Xác thực 2 lớp")).toBeInTheDocument();
    expect(item("Gỡ xác thực 2 lớp cho người khác")).toBeInTheDocument();
  });

  it("hides 2FA in demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await open("DIRECTOR");
    expect(item("Xác thực 2 lớp")).toBeNull();
  });
});
