"use client";

import { Check, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COMPANY_MESSAGES,
  companyProfileInputSchema,
  MAX_LOGO_SIZE_BYTES,
  type CompanyProfile,
} from "@/domain/company";

interface CompanyProfileFormProps {
  initialProfile: CompanyProfile;
}

export function CompanyProfileForm({ initialProfile }: CompanyProfileFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialProfile.name || "");
  const [shortName, setShortName] = useState(initialProfile.shortName || "");
  const [taxId, setTaxId] = useState(initialProfile.taxId || "");
  const [address, setAddress] = useState(initialProfile.address || "");
  const [phone, setPhone] = useState(initialProfile.phone || "");
  const [email, setEmail] = useState(initialProfile.email || "");
  const [website, setWebsite] = useState(initialProfile.website || "");
  const [bankAccount, setBankAccount] = useState(initialProfile.bankAccount || "");
  const [bankName, setBankName] = useState(initialProfile.bankName || "");
  const [logoUrl, setLogoUrl] = useState(initialProfile.logoUrl || "");

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setFieldErrors((prev) => ({
        ...prev,
        logoUrl: COMPANY_MESSAGES.logoTooLarge,
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next.logoUrl;
          return next;
        });
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    const payload = {
      name,
      shortName,
      taxId,
      address,
      phone,
      email,
      website,
      bankAccount,
      bankName,
      logoUrl,
    };

    const parsed = companyProfileInputSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const fieldName = String(issue.path[0] ?? "general");
        errors[fieldName] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const json = await response.json();
      if (!response.ok) {
        setErrorMessage(json.error ?? "Không thể lưu thông tin công ty.");
        return;
      }

      setSuccessMessage("Đã lưu thông tin công ty thành công.");
      router.refresh();
    } catch {
      setErrorMessage("Lỗi kết nối máy chủ, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex max-w-3xl flex-col gap-6 rounded-lg border bg-card p-6 shadow-sm"
      aria-label="Cài đặt thông tin công ty"
    >
      {successMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-success bg-card p-3 text-sm text-success"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-card p-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="company-name" className="text-sm font-medium">
            Tên công ty <span className="text-destructive">*</span>
          </label>
          <Input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Công ty Cổ phần Cơ khí Xây dựng An Phát"
            required
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && <FieldMessage message={fieldErrors.name} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-short-name" className="text-sm font-medium">
            Tên viết tắt / Tên ngắn
          </label>
          <Input
            id="company-short-name"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="VD: An Phát"
            aria-invalid={Boolean(fieldErrors.shortName)}
          />
          {fieldErrors.shortName && (
            <FieldMessage message={fieldErrors.shortName} />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-tax-id" className="text-sm font-medium">
            Mã số thuế (MST)
          </label>
          <Input
            id="company-tax-id"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="VD: 0101234567 hoặc 0101234567-001"
            aria-invalid={Boolean(fieldErrors.taxId)}
          />
          {fieldErrors.taxId && <FieldMessage message={fieldErrors.taxId} />}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="company-address" className="text-sm font-medium">
            Địa chỉ trụ sở / văn phòng
          </label>
          <Input
            id="company-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="VD: 123 Đường Giải Phóng, Phường Phương Mai, Hà Nội"
            aria-invalid={Boolean(fieldErrors.address)}
          />
          {fieldErrors.address && <FieldMessage message={fieldErrors.address} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-phone" className="text-sm font-medium">
            Số điện thoại / Hotline
          </label>
          <Input
            id="company-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="VD: 0243 123 4567 hoặc 0901234567"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone && <FieldMessage message={fieldErrors.phone} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-email" className="text-sm font-medium">
            Email liên hệ
          </label>
          <Input
            id="company-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="VD: lienhe@anphat.vn"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email && <FieldMessage message={fieldErrors.email} />}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="company-website" className="text-sm font-medium">
            Website
          </label>
          <Input
            id="company-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="VD: https://anphat.vn"
            aria-invalid={Boolean(fieldErrors.website)}
          />
          {fieldErrors.website && <FieldMessage message={fieldErrors.website} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-bank-account" className="text-sm font-medium">
            Số tài khoản ngân hàng
          </label>
          <Input
            id="company-bank-account"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            placeholder="VD: 1903 1234 5678"
            aria-invalid={Boolean(fieldErrors.bankAccount)}
          />
          {fieldErrors.bankAccount && (
            <FieldMessage message={fieldErrors.bankAccount} />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company-bank-name" className="text-sm font-medium">
            Ngân hàng & Chi nhánh
          </label>
          <Input
            id="company-bank-name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="VD: Techcombank - Chi nhánh Thăng Long"
            aria-invalid={Boolean(fieldErrors.bankName)}
          />
          {fieldErrors.bankName && (
            <FieldMessage message={fieldErrors.bankName} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <label className="text-sm font-medium">Logo công ty (in trên phiếu)</label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="relative size-20 overflow-hidden rounded-md border bg-card p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo xem trước"
                className="size-full object-contain"
              />
              <button
                type="button"
                onClick={() => setLogoUrl("")}
                className="absolute top-0 right-0 rounded-bl bg-card p-1 text-muted-foreground hover:text-foreground"
                aria-label="Xóa logo"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : (
            <div className="grid size-20 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
              Chưa có logo
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">
              <Upload className="size-3.5" aria-hidden="true" />
              <span>Tải ảnh lên (PNG, JPG, SVG &lt; 500 KB)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={handleLogoFileChange}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              Hoặc nhập đường dẫn ảnh bên dưới:
            </span>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://... hoặc data:image/..."
              className="text-xs"
              aria-invalid={Boolean(fieldErrors.logoUrl)}
            />
            {fieldErrors.logoUrl && (
              <FieldMessage message={fieldErrors.logoUrl} />
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu thông tin"}
        </Button>
      </div>
    </form>
  );
}
