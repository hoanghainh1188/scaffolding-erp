// A transfer that is not a draft any more (D6b read-only): route, lines with
// what was written and carried, and who posted it.
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { TRANSFER_STATUS_LABELS } from "@/domain/site-transfer";
import type { TransferView } from "@/lib/site-transfers/queries";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TransferDetail({ view }: { view: TransferView }) {
  const posted = view.status === "POSTED";
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="transfer-route"
        className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2"
      >
        <h2 id="transfer-route" className="sr-only">
          Chuyển từ đâu sang đâu
        </h2>
        <div className="flex flex-col gap-1">
          <span className="text-label">Lấy ở</span>
          <span className="font-medium">{view.from.siteName}</span>
          <span className="text-sm text-muted-foreground">
            {view.from.contractCode} · {view.from.customerName}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label">Chở tới</span>
          <span className="font-medium">{view.to.siteName}</span>
          <span className="text-sm text-muted-foreground">
            {view.to.contractCode} · {view.to.customerName}
          </span>
        </div>
      </section>
      <section
        aria-labelledby="transfer-lines"
        className="flex flex-col gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="transfer-lines" className="text-h2">
          Hàng chuyển
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hàng</TableHead>
              <TableHead className="text-right">Văn phòng ghi</TableHead>
              {posted ? (
                <TableHead className="text-right">Thực chở</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.lines.map((line) => (
              <TableRow key={line.itemId}>
                <TableCell>
                  <span className="font-medium">{line.itemName}</span>{" "}
                  <span className="text-caption text-muted-foreground">
                    {line.itemCode}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.planned}
                </TableCell>
                {posted ? (
                  <TableCell className="text-right tabular-nums">
                    {line.moved ?? "–"}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <dl className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
          <div>
            <dt className="inline text-muted-foreground">Trạng thái: </dt>
            <dd className="inline">{TRANSFER_STATUS_LABELS[view.status]}</dd>
          </div>
          {view.businessDate ? (
            <div>
              <dt className="inline text-muted-foreground">Ngày chuyển: </dt>
              <dd className="inline">
                {formatBusinessDate(view.businessDate)}
              </dd>
            </div>
          ) : null}
          {view.postedByName ? (
            <div>
              <dt className="inline text-muted-foreground">Người xác nhận: </dt>
              <dd className="inline">{view.postedByName}</dd>
            </div>
          ) : null}
          {view.confirmedOnDeviceAt ? (
            <div>
              <dt className="inline text-muted-foreground">
                Xác nhận trên máy:{" "}
              </dt>
              <dd className="inline">
                {formatDateTime(new Date(view.confirmedOnDeviceAt))}
              </dd>
            </div>
          ) : null}
          {view.vehiclePlate ? (
            <div>
              <dt className="inline text-muted-foreground">Biển số: </dt>
              <dd className="inline">{view.vehiclePlate}</dd>
            </div>
          ) : null}
          {view.cancelledReason ? (
            <div>
              <dt className="inline text-muted-foreground">Lý do hủy: </dt>
              <dd className="inline">{view.cancelledReason}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
