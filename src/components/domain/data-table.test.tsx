import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "./data-table";

interface Row {
  code: string;
  name: string;
  quantity: number;
  note: string;
}

const columns: DataTableColumn<Row>[] = [
  { accessorKey: "code", header: "Mã" },
  { accessorKey: "name", header: "Tên vật tư" },
  { accessorKey: "quantity", header: "Số lượng", meta: { align: "right" } },
  {
    accessorKey: "note",
    header: "Ghi chú",
    enableSorting: false,
    meta: { hideBelow: "xl" },
  },
];

// Quantities are not in code order, so sorting is visible.
const rows: Row[] = Array.from({ length: 45 }, (_, i) => ({
  code: `VT${String(i + 1).padStart(3, "0")}`,
  name: `Vật tư ${i + 1}`,
  quantity: (i * 37) % 101,
  note: "",
}));

const emptyState = { message: "Chưa có đơn thu mua nào" };

const bodyRows = () =>
  within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");
const firstCode = () =>
  within(bodyRows()[0]!).getAllByRole("cell")[0]!.textContent;

describe("DataTable", () => {
  it("shows 20 rows per page with a position label", async () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText("1–20 / 45")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(screen.getByText("41–45 / 45")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });

  it("cycles sorting ascending, descending, then off", async () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    const header = screen.getByRole("button", { name: /Số lượng/ });

    await userEvent.click(header);
    expect(
      screen.getByRole("columnheader", { name: /Số lượng/ }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0]!).getAllByRole("cell")[2]).toHaveTextContent(
      "0",
    );

    await userEvent.click(header);
    expect(
      screen.getByRole("columnheader", { name: /Số lượng/ }),
    ).toHaveAttribute("aria-sort", "descending");
    expect(within(bodyRows()[0]!).getAllByRole("cell")[2]).toHaveTextContent(
      "100",
    );

    await userEvent.click(header);
    expect(
      screen.getByRole("columnheader", { name: /Số lượng/ }),
    ).toHaveAttribute("aria-sort", "none");
    expect(firstCode()).toBe("VT001");
  });

  it("sorts from the keyboard", async () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    screen.getByRole("button", { name: /Số lượng/ }).focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("columnheader", { name: /Số lượng/ }),
    ).toHaveAttribute("aria-sort", "ascending");
  });

  it("right-aligns number columns", () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    expect(within(bodyRows()[0]!).getAllByRole("cell")[2]).toHaveClass(
      "text-right",
    );
  });

  it("hides a column below its breakpoint with CSS", () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    expect(screen.getByRole("columnheader", { name: "Ghi chú" })).toHaveClass(
      "hidden",
      "xl:table-cell",
    );
    expect(within(bodyRows()[0]!).getAllByRole("cell")[3]).toHaveClass(
      "hidden",
      "xl:table-cell",
    );
  });

  it("pins the first column and the header", () => {
    render(<DataTable columns={columns} data={rows} emptyState={emptyState} />);
    expect(screen.getByRole("columnheader", { name: /Mã/ })).toHaveClass(
      "sticky",
      "left-0",
      "top-0",
    );
    expect(within(bodyRows()[0]!).getAllByRole("cell")[0]).toHaveClass(
      "sticky",
      "left-0",
    );
    expect(screen.getByRole("region", { name: "Bảng dữ liệu" })).toHaveClass(
      "overflow-auto",
    );
  });

  it("shows the screen's invitation and button when empty", async () => {
    const onClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={{
          message: "Chưa có đơn thu mua nào",
          action: { label: "Tạo đơn", onClick },
        }}
      />,
    );
    expect(screen.getByText("Chưa có đơn thu mua nào")).toBeInTheDocument();
    expect(screen.queryByText("Không có dữ liệu")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Trang sau" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tạo đơn" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a link action when given an href", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={{
          message: "Chưa có đơn thu mua nào",
          action: { label: "Tạo đơn", href: "/purchasing/new" },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Tạo đơn" })).toHaveAttribute(
      "href",
      "/purchasing/new",
    );
  });

  it("shows only the invitation when there is no action", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={{ message: "Chưa có phiếu nhập nào hôm nay" }}
      />,
    );
    expect(
      screen.getByText("Chưa có phiếu nhập nào hôm nay"),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole("button").filter((b) => !b.closest("th")),
    ).toEqual([]);
  });
});

// Compile-time contract: emptyState is required (checked by `npm run typecheck`).
export function MissingEmptyState() {
  // @ts-expect-error emptyState must be provided by the screen
  return <DataTable columns={columns} data={rows} />;
}
