import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  /** What the screen will do, from docs/ui.md. */
  description: string;
}

/** Stand-in for a screen a later change builds, so navigation never 404s. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">{title}</h1>
      <section className="flex max-w-xl items-start gap-4 rounded-lg border bg-card p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-highlight text-highlight-foreground">
          <Construction aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-label">Đang xây dựng</p>
          <p className="text-body text-muted-foreground">{description}</p>
        </div>
      </section>
    </div>
  );
}
