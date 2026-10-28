// Drafts kept on the phone (goods-receipt design D1): IndexedDB in the
// browser, a Map where IndexedDB is missing (tests, old browsers). Runs in
// the browser only.

export const DRAFT_KINDS = ["GOODS_RECEIPT", "STOCKTAKE"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

/** EDITING: being filled in; QUEUED: confirmed, waiting for the network;
 * SENDING: on its way; REJECTED: the server said no (error says why). */
export type DraftState = "EDITING" | "QUEUED" | "SENDING" | "REJECTED";

export interface DraftRecord<P = unknown> {
  draftId: string;
  kind: DraftKind;
  /** Only the person who made it sees it. */
  userId: string;
  /** "PO-2026-052". */
  documentRef: string;
  /** "Nhập PO-2026-052 · anh Trần Văn Hùng". */
  title: string;
  /** "2/4 mã đã đếm". */
  progress: string;
  payload: P;
  state: DraftState;
  error: string | null;
  /** ISO instants. */
  createdAt: string;
  updatedAt: string;
  attempts: number;
}

export interface DraftStore {
  put(record: DraftRecord): Promise<void>;
  get(draftId: string): Promise<DraftRecord | null>;
  /** The user's drafts, newest change first. */
  list(userId: string): Promise<DraftRecord[]>;
  remove(draftId: string): Promise<void>;
}

const newestFirst = (a: DraftRecord, b: DraftRecord) =>
  b.updatedAt.localeCompare(a.updatedAt);

export function memoryDraftStore(): DraftStore {
  const rows = new Map<string, DraftRecord>();
  return {
    async put(record) {
      rows.set(record.draftId, structuredClone(record));
    },
    async get(draftId) {
      const found = rows.get(draftId);
      return found ? structuredClone(found) : null;
    },
    async list(userId) {
      return [...rows.values()]
        .filter((row) => row.userId === userId)
        .map((row) => structuredClone(row))
        .sort(newestFirst);
    },
    async remove(draftId) {
      rows.delete(draftId);
    },
  };
}

const DB_NAME = "scaffolding-erp";
const STORE = "drafts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    const store = req.result.createObjectStore(STORE, { keyPath: "draftId" });
    store.createIndex("userId", "userId");
  };
  return request(req);
}

export function indexedDbDraftStore(): DraftStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= openDb());
  async function run<T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const tx = (await db()).transaction(STORE, mode);
    return request(body(tx.objectStore(STORE)));
  }
  return {
    async put(record) {
      await run("readwrite", (store) => store.put(record));
    },
    async get(draftId) {
      return (
        ((await run("readonly", (store) => store.get(draftId))) as
          DraftRecord | undefined) ?? null
      );
    },
    async list(userId) {
      const rows = (await run("readonly", (store) =>
        store.index("userId").getAll(userId),
      )) as DraftRecord[];
      return rows.sort(newestFirst);
    },
    async remove(draftId) {
      await run("readwrite", (store) => store.delete(draftId));
    },
  };
}

let current: DraftStore | null = null;
let persistAsked = false;

/** The store of this browser; tests swap it with setDraftStore. */
export function draftStore(): DraftStore {
  current ??=
    typeof indexedDB === "undefined"
      ? memoryDraftStore()
      : indexedDbDraftStore();
  return current;
}

export function setDraftStore(store: DraftStore | null): void {
  current = store;
}

/** Asks the browser not to evict drafts (design D1); asked once. */
export function askPersistentStorage(): void {
  if (persistAsked || typeof navigator === "undefined") return;
  persistAsked = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** Drafts not sent after 3 days show "Nháp cũ" (spec mobile-drafts). */
export const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function isStale(
  record: Pick<DraftRecord, "createdAt">,
  now: Date,
): boolean {
  return now.getTime() - Date.parse(record.createdAt) > STALE_AFTER_MS;
}
