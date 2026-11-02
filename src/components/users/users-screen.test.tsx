import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Role } from "@/domain/role";
import { countUsers, sortUsers, type UserRow } from "@/lib/users/service";

import { UsersScreen } from "./users-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

// The 8 accounts drawn in D17-Users.dc.html; "now" is 27/10/2026 09:00 VN.
const NOW = "2026-10-27T02:00:00.000Z";
const row = (
  id: string,
  name: string,
  username: string,
  role: Role,
  lastLoginAt: string | null,
  device: UserRow["lastLoginDevice"],
  status: UserRow["status"] = "ACTIVE",
  mustChangePassword = false,
  tempPasswordExpiresAt: string | null = null,
): UserRow => ({
  id,
  name,
  username,
  role,
  status,
  mustChangePassword,
  tempPasswordExpiresAt,
  lastLoginAt,
  lastLoginDevice: device,
});

const ROWS = sortUsers([
  row(
    "1",
    "Minh Anh",
    "minhanh",
    "DIRECTOR",
    "2026-10-27T01:02:00Z",
    "DESKTOP",
  ),
  row("2", "Thu Hà", "thuha", "ACCOUNTANT", "2026-10-27T00:55:00Z", "DESKTOP"),
  row("3", "Quốc Bảo", "quocbao", "SALES", "2026-10-26T10:40:00Z", "DESKTOP"),
  row(
    "4",
    "Lan Phương",
    "lanphuong",
    "SALES",
    "2026-10-23T09:20:00Z",
    "DESKTOP",
  ),
  row(
    "5",
    "Văn Tùng",
    "vantung",
    "WAREHOUSE",
    "2026-10-26T23:48:00Z",
    "MOBILE",
  ),
  row(
    "6",
    "Đức Thắng",
    "ducthang",
    "WAREHOUSE",
    "2026-10-27T00:10:00Z",
    "MOBILE",
  ),
  row(
    "7",
    "Hoàng Nam",
    "hoangnam",
    "WORKSHOP",
    "2026-10-24T08:05:00Z",
    "MOBILE",
  ),
  row(
    "8",
    "Ngọc Lâm",
    "ngoclam",
    "WAREHOUSE",
    "2026-09-02T00:30:00Z",
    "MOBILE",
    "LOCKED",
  ),
]);

function renderScreen(users = ROWS, activeRole: Role | null = null) {
  return render(
    <UsersScreen
      users={users}
      counts={countUsers(ROWS)}
      activeRole={activeRole}
      currentUserId="1"
      now={NOW}
    />,
  );
}

const table = () => screen.getByRole("table");

describe("UsersScreen (D17)", () => {
  it("counts active and locked accounts in the heading", () => {
    renderScreen();
    expect(
      screen.getByText("7 tài khoản đang hoạt động · 1 tài khoản bị khóa"),
    ).toBeInTheDocument();
  });

  it("shows a filter per role with its count, Tất cả first and current", () => {
    renderScreen();
    const filters = within(
      screen.getByRole("navigation", { name: "Lọc theo vai trò" }),
    );
    const links = filters.getAllByRole("link").map((link) => link.textContent);
    expect(links).toEqual([
      "Tất cả · 8",
      "Giám đốc · 1",
      "Kế toán · 1",
      "Kinh doanh · 2",
      "Thủ kho · 3",
      "Xưởng · 1",
    ]);
    expect(filters.getByRole("link", { name: "Tất cả · 8" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(filters.getByRole("link", { name: "Thủ kho · 3" })).toHaveAttribute(
      "href",
      "/settings/users?role=WAREHOUSE",
    );
  });

  it("marks the chosen role filter as current", () => {
    renderScreen(
      ROWS.filter((user) => user.role === "WAREHOUSE"),
      "WAREHOUSE",
    );
    expect(screen.getByRole("link", { name: "Thủ kho · 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(table()).getAllByRole("row")).toHaveLength(1 + 3);
  });

  it("lists active accounts first and the locked one last", () => {
    renderScreen();
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(8);
    expect(within(rows.at(-1)!).getByText("Ngọc Lâm")).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByText("Đã khóa")).toBeInTheDocument();
  });

  it("formats device and last sign-in in Vietnam time", () => {
    renderScreen();
    const vantung = screen.getByText("vantung").closest("tr")!;
    expect(within(vantung).getByText("Điện thoại")).toBeInTheDocument();
    expect(within(vantung).getByText("Hôm nay, 06:48")).toBeInTheDocument();
    const quocbao = screen.getByText("quocbao").closest("tr")!;
    expect(within(quocbao).getByText("Hôm qua, 17:40")).toBeInTheDocument();
    const lanphuong = screen.getByText("lanphuong").closest("tr")!;
    expect(
      within(lanphuong).getByText("23/10/2026, 16:20"),
    ).toBeInTheDocument();
  });

  it("offers no actions on one's own row and only Mở khóa on a locked one", async () => {
    const user = userEvent.setup();
    renderScreen();
    const own = screen.getByText("minhanh").closest("tr")!;
    expect(within(own).queryByRole("button", { name: /Thao tác/ })).toBeNull();
    expect(within(own).getByText("Bạn")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Thao tác với Ngọc Lâm" }),
    );
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual(["Mở khóa"]);
  });

  it("offers role change, reset and lock on an active row", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(
      screen.getByRole("button", { name: "Thao tác với Thu Hà" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Đổi vai trò", "Đặt lại mật khẩu", "Khóa tài khoản"]);
  });

  it("starts the role picker with 3 roles and can show all 5", async () => {
    const user = userEvent.setup();
    renderScreen();
    const form = within(
      screen.getByRole("region", { name: "Thêm người dùng" }),
    );
    expect(form.getAllByRole("radio")).toHaveLength(3);
    expect(form.getByRole("radio", { name: "Thủ kho" })).toBeInTheDocument();
    await user.click(form.getByRole("button", { name: "Xem cả 5 vai trò" }));
    expect(form.getAllByRole("radio")).toHaveLength(5);
  });

  it("displays warning badge and 'Cấp lại mật khẩu tạm' action for expired temporary password", async () => {
    const user = userEvent.setup();
    const expiredUser = row(
      "9",
      "Tuấn Kiệt",
      "tuankiet",
      "WAREHOUSE",
      null,
      null,
      "ACTIVE",
      true,
      "2026-10-25T00:00:00.000Z", // Expired relative to NOW (2026-10-27)
    );
    renderScreen([...ROWS, expiredUser]);

    const kiotRow = screen.getByText("tuankiet").closest("tr")!;
    expect(
      within(kiotRow).getByText("Hết hạn mật khẩu tạm"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Thao tác với Tuấn Kiệt" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Đổi vai trò", "Cấp lại mật khẩu tạm", "Khóa tài khoản"]);
  });
});
