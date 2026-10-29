"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReceiptOption } from "@/lib/inventory/revaluations";

import {
  AdjustmentFormSheet,
  type ItemOption,
  type PlaceOption,
} from "./adjustment-form-sheet";
import { CREATE_CHOICES, type CreateChoice } from "./create-choices";
import { TripCostSheet } from "./trip-cost-sheet";
import { ValueAdjustmentSheet } from "./value-adjustment-sheet";

interface AdjustmentCreateMenuProps {
  items: ItemOption[];
  places: PlaceOption[];
  receipts: ReceiptOption[];
  today: string;
  /** ?new= of the URL: the form to open at once. */
  initial?: CreateChoice | null;
}

/** "Lập phiếu" with the four kinds of document (stock-value-adjustment D6). */
export function AdjustmentCreateMenu({
  items,
  places,
  receipts,
  today,
  initial = null,
}: AdjustmentCreateMenuProps) {
  // The count remounts the chosen sheet so it opens again after a close.
  const [chosen, setChosen] = useState<{
    kind: CreateChoice;
    n: number;
  } | null>(initial ? { kind: initial, n: 0 } : null);
  const pick = (kind: CreateChoice) =>
    setChosen((current) => ({ kind, n: (current?.n ?? 0) + 1 }));
  const key = chosen ? `${chosen.kind}-${chosen.n}` : "none";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            Lập phiếu
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CREATE_CHOICES.map((choice) => (
            <DropdownMenuItem
              key={choice.key}
              onSelect={() => pick(choice.key)}
            >
              {choice.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {chosen?.kind === "ADJUSTMENT" || chosen?.kind === "OPENING" ? (
        <AdjustmentFormSheet
          key={key}
          kind={chosen.kind}
          items={items}
          places={places}
          today={today}
          defaultOpen
        />
      ) : null}
      {chosen?.kind === "REVALUE" ? (
        <ValueAdjustmentSheet key={key} items={items} defaultOpen />
      ) : null}
      {chosen?.kind === "TRIP" ? (
        <TripCostSheet key={key} receipts={receipts} defaultOpen />
      ) : null}
    </>
  );
}
