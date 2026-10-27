/** A message under the field it is about (spec "Form đơn thu mua D3"). */
export function FieldMessage({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="mt-1 text-caption text-destructive">
      {message}
    </p>
  ) : null;
}
