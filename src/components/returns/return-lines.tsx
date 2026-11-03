import { numberText } from "@/components/deliveries/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QUANTITY_UNIT_LABELS, type QuantityUnit } from "@/domain/quantity";

export interface ReturnLineRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  goodMilli: number;
  repairMilli: number;
  scrapMilli: number;
  lostMilli: number;
}

const cell = (milli: number, unit: QuantityUnit) =>
  milli === 0 ? "–" : numberText(milli, unit);

/** The split of each item: Tốt / Chờ sửa / Phế liệu / Mất. */
export function ReturnLines({ lines }: { lines: readonly ReturnLineRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hàng</TableHead>
          <TableHead>Đơn vị</TableHead>
          <TableHead className="text-right">Trả về</TableHead>
          <TableHead className="text-right">Tốt</TableHead>
          <TableHead className="text-right">Chờ sửa</TableHead>
          <TableHead className="text-right">Phế liệu</TableHead>
          <TableHead className="text-right">Mất</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.itemId}>
            <TableCell>
              <span className="font-medium">{line.itemName}</span>{" "}
              <span className="text-caption text-muted-foreground">
                {line.itemCode}
              </span>
            </TableCell>
            <TableCell>{QUANTITY_UNIT_LABELS[line.unit]}</TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(
                line.goodMilli + line.repairMilli + line.scrapMilli,
                line.unit,
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(line.goodMilli, line.unit)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(line.repairMilli, line.unit)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(line.scrapMilli, line.unit)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {cell(line.lostMilli, line.unit)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
