"use client";

import { useState, type FormEvent } from "react";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GroupRow } from "@/lib/catalog/item-groups";

import { ConfirmAction } from "./confirm-action";
import { FormError } from "./form-error";
import { useCatalogAction } from "./use-catalog-action";

/** D9 "Nhóm hàng" tab: list, add, rename, archive, delete (spec item-catalog). */
export function GroupsEditor({
  groups,
  canEdit,
}: {
  groups: GroupRow[];
  canEdit: boolean;
}) {
  const [name, setName] = useState("");
  const create = useCatalogAction();

  async function add(event: FormEvent) {
    event.preventDefault();
    if (
      await create.run("/api/catalog/item-groups", {
        method: "POST",
        body: { name },
      })
    ) {
      setName("");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
            <Label htmlFor="new-group">Tên nhóm mới</Label>
            <Input
              id="new-group"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
            />
          </div>
          <Button type="submit" disabled={create.pending}>
            Thêm nhóm
          </Button>
          <div className="basis-full">
            <FormError message={create.error} />
          </div>
        </form>
      ) : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {groups.map((group) => (
          <GroupLine key={group.id} group={group} canEdit={canEdit} />
        ))}
      </ul>
    </div>
  );
}

function GroupLine({ group, canEdit }: { group: GroupRow; canEdit: boolean }) {
  const [name, setName] = useState(group.name);
  const save = useCatalogAction();
  const change = useCatalogAction();
  const archived = group.status === "ARCHIVED";

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      {canEdit ? (
        <form
          className="flex min-w-0 flex-1 basis-56 items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await save.run(`/api/catalog/item-groups/${group.id}`, {
              method: "PATCH",
              body: { name },
            });
          }}
        >
          <Input
            aria-label={`Tên nhóm ${group.name}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={name === group.name}
          >
            Lưu
          </Button>
        </form>
      ) : (
        <span className="flex-1">{group.name}</span>
      )}
      <span className="text-sm text-muted-foreground">
        {group.itemCount} vật tư
      </span>
      {archived ? <ToneBadge tone="muted">Ngừng dùng</ToneBadge> : null}
      {canEdit ? (
        <>
          <ConfirmAction
            trigger={
              <Button type="button" variant="ghost">
                {archived ? "Dùng lại" : "Ngừng dùng"}
              </Button>
            }
            title={
              archived
                ? `Dùng lại nhóm ${group.name}?`
                : `Ngừng dùng nhóm ${group.name}?`
            }
            description="Nhóm ngừng dùng không chọn được cho vật tư mới."
            confirmLabel={archived ? "Dùng lại" : "Ngừng dùng"}
            error={change.error}
            onConfirm={async () =>
              (await change.run(`/api/catalog/item-groups/${group.id}`, {
                method: "PATCH",
                body: { status: archived ? "ACTIVE" : "ARCHIVED" },
              })) !== null
            }
          />
          <ConfirmAction
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
              >
                Xóa
              </Button>
            }
            title={`Xóa nhóm ${group.name}?`}
            description="Chỉ xóa được nhóm không còn vật tư nào."
            confirmLabel="Xóa"
            destructive
            error={change.error}
            onConfirm={async () =>
              (await change.run(`/api/catalog/item-groups/${group.id}`, {
                method: "DELETE",
              })) !== null
            }
          />
          <div className="basis-full">
            <FormError message={save.error} />
          </div>
        </>
      ) : null}
    </li>
  );
}
