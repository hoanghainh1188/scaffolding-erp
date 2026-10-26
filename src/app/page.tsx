import { Button } from "@/components/ui/button";

// Temporary home until task 7.3 redirects "/" to /dashboard.
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16">
      <h1 className="text-display-xl">Phiếu nhập thu hồi – Ước tính đền bù</h1>
      <p className="text-body-lg text-muted-foreground">
        Khung dự án đã sẵn sàng. Các màn hình sẽ được thêm theo lộ trình.
      </p>
      <div>
        <Button>Bắt đầu</Button>
      </div>
    </main>
  );
}
