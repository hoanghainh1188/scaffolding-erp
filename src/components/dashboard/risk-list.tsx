// "Công trình đang rủi ro" of D1 (0.2 #92, design D5): one row per site,
// one line per risky contract with its signs. Overdue is red, the others
// warning; the sign text always says what it is.
import { ToneBadge } from "@/components/domain/tone-badge";
import { riskLabel, type RiskSite } from "@/domain/dashboard";

import { Panel, TitleCount } from "./panel";

export function RiskList({ sites }: { sites: readonly RiskSite[] }) {
  return (
    <Panel
      id="risks"
      title={
        <>
          Công trình đang rủi ro
          <TitleCount count={sites.length} />
        </>
      }
      note="Có nợ quá hạn, có hàng mất trong 30 ngày, hoặc quá ngày kết thúc hợp đồng mà còn hàng."
    >
      {sites.length === 0 ? (
        <p className="h-80 text-body text-muted-foreground">
          Không có công trình nào rủi ro.
        </p>
      ) : (
        <ul
          aria-label="Danh sách công trình rủi ro"
          tabIndex={0}
          className="h-80 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-mask
        >
          {sites.map((site) => (
            <li
              key={site.siteId}
              className="flex flex-col gap-2 border-b py-3 last:border-b-0"
            >
              <span className="text-label">{site.siteName}</span>
              {site.contracts.map((entry) => (
                <span key={entry.contractId} className="flex flex-col gap-1.5">
                  <span className="text-caption font-normal text-muted-foreground">
                    {entry.customerName} · {entry.contractCode}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {entry.signs.map((sign) => (
                      <ToneBadge
                        key={sign.kind}
                        tone={
                          sign.kind === "OVERDUE" ? "destructive" : "warning"
                        }
                      >
                        {riskLabel(sign)}
                      </ToneBadge>
                    ))}
                  </span>
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
