# Scaffolding ERP

Phần mềm quản lý cho công ty thu mua, sửa chữa, bán và cho thuê giàn giáo, vật tư xây dựng đã qua sử dụng.

## Tài liệu

- [Nghiệp vụ](docs/requirements.md)
- [Giao diện](docs/ui.md)
- [Lộ trình change](docs/roadmap.md)
- [Hướng dẫn cho Claude Code](CLAUDE.md)

## Quy trình phát triển

Dùng [OpenSpec](https://github.com/Fission-AI/OpenSpec) với Claude Code:

```bash
npm install -g @fission-ai/openspec@latest
```

Trong Claude Code: `/opsx:explore` → `/opsx:propose` → duyệt → `/opsx:apply` → `/opsx:archive`.

Change đầu tiên: `/opsx:propose setup-project`.
