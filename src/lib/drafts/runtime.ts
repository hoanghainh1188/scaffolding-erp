// The browser side of drafts (goods-receipt design D1): one outbox per
// signed-in user, a change signal for lists that show drafts, and whether
// the open page is working on a draft (the offline banner says so).
import { createOutbox, draftSender, type Outbox } from "./outbox";
import { draftStore, type DraftKind, type DraftRecord } from "./store";

type Listener = () => void;

function signal() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of listeners) listener();
    },
  };
}

/** Fires when any draft is saved, sent or removed in this tab. */
export const draftsChanged = signal();

export interface PostedNotice {
  kind: DraftKind;
  title: string;
  code: string;
}

const posted = signal();
let lastPosted: PostedNotice | null = null;

export const postedNotices = {
  subscribe: posted.subscribe,
  current: (): PostedNotice | null => lastPosted,
  clear() {
    lastPosted = null;
    posted.emit();
  },
};

const outboxes = new Map<string, Outbox>();

export function outboxFor(userId: string): Outbox {
  let outbox = outboxes.get(userId);
  if (!outbox) {
    const store = draftStore();
    outbox = createOutbox({
      store,
      userId,
      send: draftSender(fetch, store),
      onPosted(record: DraftRecord, code: string) {
        lastPosted = { kind: record.kind, title: record.title, code };
        posted.emit();
        draftsChanged.emit();
      },
      onRejected() {
        draftsChanged.emit();
      },
    });
    outboxes.set(userId, outbox);
  }
  return outbox;
}

/** Tests start from a clean slate. */
export function resetDraftRuntime(): void {
  outboxes.clear();
  lastPosted = null;
  activeDrafts = 0;
}

let activeDrafts = 0;
const active = signal();

/** Pages holding a draft register here while mounted. */
export const draftPresence = {
  subscribe: active.subscribe,
  current: (): boolean => activeDrafts > 0,
  enter(): () => void {
    activeDrafts += 1;
    active.emit();
    return () => {
      activeDrafts -= 1;
      active.emit();
    };
  },
};
