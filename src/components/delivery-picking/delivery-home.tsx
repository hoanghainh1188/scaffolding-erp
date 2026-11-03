"use client";

// M1 "Xuất hàng" (spec mobile-home): one card per note waiting or being
// picked, due by today; a draft on this phone turns the button into
// "Tiếp tục nhặt". No prices anywhere (deliveries design D11).
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { daysBetween, type BusinessDate } from "@/domain/business-date";
import { useDrafts } from "@/hooks/use-drafts";
import type { MobileTask } from "@/lib/deliveries/queries";

interface DeliveryHomeProps {
  tasks: MobileTask[];
  today: BusinessDate;
  userId: string;
}

function dayLabel(task: MobileTask, today: BusinessDate) {
  if (task.plannedDate === null) return { late: false, text: "Chưa hẹn" };
  const late = daysBetween(task.plannedDate, today);
  return late > 0
    ? { late: true, text: `Trễ ${late} ngày` }
    : { late: false, text: "Hôm nay" };
}

export function DeliveryHome({ tasks, today, userId }: DeliveryHomeProps) {
  const drafts = useDrafts(userId) ?? [];
  if (tasks.length === 0) return null;
  return (
    <section
      aria-labelledby="deliveries-title"
      data-mask
      className="flex flex-col gap-3"
    >
      <h2 id="deliveries-title" className="text-h3">
        Xuất hàng
      </h2>
      {tasks.map((task) => {
        const draft = drafts.find(
          (row) => row.kind === "DELIVERY" && row.documentRef === task.code,
        );
        const label = dayLabel(task, today);
        return (
          <article
            key={task.code}
            aria-label={task.code}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              {label.late ? (
                <ToneBadge tone="warning">{label.text}</ToneBadge>
              ) : (
                <span className="text-label text-muted-foreground">
                  {label.text}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-label">
                  {task.code} · Đợt {task.batchNo} · {task.place}
                </p>
                <p className="text-body text-muted-foreground">
                  {task.requested}
                </p>
                {task.status === "PICKING" ? (
                  <p className="text-body">
                    Đang nhặt
                    {draft ? ` · ${draft.progress}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <Button asChild className="h-12">
              <Link href={`/m/deliveries/${encodeURIComponent(task.code)}`}>
                {task.status === "PICKING" ? "Tiếp tục nhặt" : "Bắt đầu nhặt"}
              </Link>
            </Button>
          </article>
        );
      })}
    </section>
  );
}
