import { Construction } from "lucide-react";

interface UnderConstructionProps {
  /** What the screen will do, from docs/ui.md. */
  description: string;
}

/** "Đang xây dựng" card for screens a later change builds. */
export function UnderConstruction({ description }: UnderConstructionProps) {
  return (
    <section className="flex max-w-xl items-start gap-4 rounded-lg border bg-card p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-highlight text-highlight-foreground">
        <Construction aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-label">Đang xây dựng</p>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}

interface PlaceholderPageProps extends UnderConstructionProps {
  title: string;
}

/** Desktop stand-in page, so navigation never 404s. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">{title}</h1>
      <UnderConstruction description={description} />
    </div>
  );
}
