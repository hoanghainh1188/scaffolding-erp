"use client";

// The signed-in user's drafts on this phone, kept fresh when any draft is
// saved, sent or removed (M1, M7; goods-receipt design D1).
import { useEffect, useState } from "react";

import { draftsChanged } from "@/lib/drafts/runtime";
import { draftStore, type DraftRecord } from "@/lib/drafts/store";

export function useDrafts(userId: string): DraftRecord[] | null {
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void draftStore()
        .list(userId)
        .then((rows) => {
          if (alive) setDrafts(rows);
        });
    load();
    const stop = draftsChanged.subscribe(load);
    return () => {
      alive = false;
      stop();
    };
  }, [userId]);
  return drafts;
}
