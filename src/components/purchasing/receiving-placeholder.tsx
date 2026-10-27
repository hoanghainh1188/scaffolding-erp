/** D3b "Các chuyến nhập" until goods-receipt fills it (design D9). */
export function ReceivingPlaceholder() {
  return (
    <section
      aria-labelledby="order-trips"
      className="flex flex-col gap-3 rounded-lg border bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="order-trips" className="font-display text-h2">
          Các chuyến nhập
        </h2>
        <span className="text-sm text-muted-foreground">
          Mỗi chuyến xe một phiếu nhập
        </span>
      </div>
      <p className="rounded-md border border-dashed px-4 py-6 text-center text-muted-foreground">
        Chưa có chuyến nhập. Thủ kho nhập hàng trên điện thoại khi xe về.
      </p>
    </section>
  );
}
