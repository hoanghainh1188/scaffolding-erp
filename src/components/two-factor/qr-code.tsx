import { encode } from "uqr";

interface QrCodeProps {
  value: string;
  label: string;
}

/** Drawn as one SVG path from the module matrix; no injected markup. */
export function QrCode({ value, label }: QrCodeProps) {
  const { data, size } = encode(value, { ecc: "M", border: 1 });
  const path = data
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")),
    )
    .join("");
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 fill-foreground"
    >
      <path d={path} />
    </svg>
  );
}
