export interface PrintOptions {
  /** Shown in the print header and used by "Save as PDF" as the file name. */
  title?: string;
}

/**
 * The only place the app prints (ESLint blocks window.print / print()
 * elsewhere). Today it opens the browser print dialog; a server-made PDF can
 * replace it later without touching the screens.
 */
export function printDocument({ title }: PrintOptions = {}): void {
  if (title !== undefined) {
    const previousTitle = document.title;
    document.title = title;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
      },
      { once: true },
    );
  }
  window.print();
}
