# 📑 smartTOC

> AI-generated, editable, and auditable Table of Contents for large PDF documents — built as a fully static web application.

---

## Project Structure

```
smartTOC/
├── app/
│   ├── web/                  # React + TypeScript frontend
│   │   ├── src/
│   │   │   ├── components/   # UI components (TocTree, PdfViewer, AuditTrailPane, …)
│   │   │   ├── lib/          # Core logic (tocExtractor, auditLog)
│   │   │   └── types/        # Domain types (TocNode, AuditLog, AppState)
│   │   └── package.json
│   └── scenario/             # Product documentation
│       ├── CONSTITUTION.md   # Governing principles (highest priority)
│       ├── PRD.md            # Full product requirements
│       ├── SPEC.md           # Authoritative feature specification
│       ├── PLAN.md           # Tech stack & architecture decisions
│       └── TASKS.md          # Task breakdown by milestone
├── .github/workflows/ci.yml  # CI: type-check + build + artifact upload
└── LICENSE                   # MIT
```

---

## License

[MIT](LICENSE) © 2026 Belle Podeanu
