import type { Metadata } from "next";
import { connection } from "next/server";
import { cache, Suspense, type ReactNode } from "react";

import { ApprovalsList } from "@/components/dashboard/approvals-list";
import {
  OnSiteTile,
  OverdueTile,
  RevenueTile,
  RiskTile,
} from "@/components/dashboard/kpi-tiles";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { RegionTable } from "@/components/dashboard/region-table";
import { RevenuePanel } from "@/components/dashboard/revenue-panel";
import { RiskList } from "@/components/dashboard/risk-list";
import { SiteLookup } from "@/components/dashboard/site-lookup";
import { StockTable } from "@/components/dashboard/stock-table";
import { TopCustomers } from "@/components/dashboard/top-customers";
import { Skeleton } from "@/components/ui/skeleton";
import { getDatabase } from "@/db/client";
import {
  formatDateTime,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { blocksFor, dayText, greeting } from "@/domain/dashboard";
import type { ContractUser } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { pendingApprovals } from "@/lib/dashboard/approvals";
import { overdueSummary } from "@/lib/dashboard/overdue";
import { riskySites } from "@/lib/dashboard/risk";
import { onSiteSummary, stockByCondition } from "@/lib/dashboard/stock";
import { readBook, revenueSummary, topOfYear } from "@/lib/dashboard/summary";

export const metadata: Metadata = { title: "Tổng quan" };

// One request reads each source once, whichever blocks ask (design D2).
const bookOf = cache((today: BusinessDate) => readBook(getDatabase(), today));
const risksOf = cache((viewer: ContractUser, today: BusinessDate) =>
  riskySites(getDatabase(), viewer, today),
);
const onSiteOf = cache(() => onSiteSummary(getDatabase()));

function Loading({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

function Block({ height, children }: { height: string; children: ReactNode }) {
  return (
    <Suspense fallback={<Loading className={`${height} rounded-lg`} />}>
      {children}
    </Suspense>
  );
}

async function Overdue({ today }: { today: BusinessDate }) {
  return <OverdueTile overdue={await overdueSummary(getDatabase(), today)} />;
}

async function RevenueCard({ today }: { today: BusinessDate }) {
  const summary = revenueSummary(await bookOf(today), today);
  return <RevenueTile month={summary.month} />;
}

async function OnSiteCard() {
  return <OnSiteTile onSite={await onSiteOf()} />;
}

async function RiskCard(props: { viewer: ContractUser; today: BusinessDate }) {
  return <RiskTile count={(await risksOf(props.viewer, props.today)).length} />;
}

async function Revenue({ today }: { today: BusinessDate }) {
  const summary = revenueSummary(await bookOf(today), today);
  return (
    <RevenuePanel
      months={summary.months}
      days={summary.days}
      today={summary.today}
      separate={summary.separate}
    />
  );
}

async function Stock() {
  return <StockTable rows={await stockByCondition(getDatabase())} />;
}

async function Top({ today }: { today: BusinessDate }) {
  const top = await topOfYear(getDatabase(), await bookOf(today), today);
  return (
    <TopCustomers year={top.year} byRevenue={top.byRevenue} byKg={top.byKg} />
  );
}

async function Risks(props: { viewer: ContractUser; today: BusinessDate }) {
  return <RiskList sites={await risksOf(props.viewer, props.today)} />;
}

async function Regions() {
  return <RegionTable onSite={await onSiteOf()} />;
}

/** D1 Tổng quan (spec dashboard; design D1–D7). */
export default async function Page() {
  const user = await requirePermission("dashboard.view");
  await connection();
  const now = new Date();
  const today = toBusinessDate(now);
  const viewer: ContractUser = {
    role: user.role,
    contractScope: user.contractScope,
  };
  const blocks = blocksFor(viewer);
  const approvals = await pendingApprovals(getDatabase(), viewer);
  const tiles = 2 + (blocks.money ? 2 : 0) - (blocks.rentals ? 0 : 1);

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-h1" data-mask>
            {greeting(user.name, user.role, approvals.length)}
          </h1>
          <p className="text-label font-normal text-muted-foreground" data-mask>
            {dayText(today)} · số liệu lúc {formatDateTime(now).slice(11)}
          </p>
        </div>
        <RefreshButton />
      </header>

      <div
        className={
          tiles >= 4
            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]"
            : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        }
      >
        {blocks.money ? (
          <Block height="h-40">
            <Overdue today={today} />
          </Block>
        ) : null}
        {blocks.money ? (
          <Block height="h-28">
            <RevenueCard today={today} />
          </Block>
        ) : null}
        <Block height="h-28">
          <OnSiteCard />
        </Block>
        {blocks.rentals ? (
          <Block height="h-28">
            <RiskCard viewer={viewer} today={today} />
          </Block>
        ) : null}
      </div>

      {blocks.rentals ? <SiteLookup /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {blocks.money ? (
            <Block height="h-[460px]">
              <Revenue today={today} />
            </Block>
          ) : null}
          {blocks.stock ? (
            <Block height="h-[440px]">
              <Stock />
            </Block>
          ) : null}
          {blocks.money ? (
            <Block height="h-[400px]">
              <Top today={today} />
            </Block>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ApprovalsList role={user.role} rows={approvals} />
          {blocks.rentals ? (
            <Block height="h-[420px]">
              <Risks viewer={viewer} today={today} />
            </Block>
          ) : null}
          <Block height="h-[320px]">
            <Regions />
          </Block>
        </div>
      </div>
    </div>
  );
}
