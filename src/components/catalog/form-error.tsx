/** The server's (or the form's) message, announced to screen readers. */
export function FormError({ message }: { message: string | null }) {
  return (
    <div role="alert" className="empty:hidden">
      {message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
