## Summary
- restored full manifest
- added import probe
- hardened mirroring with per-file reporting
- repo init guard
- stage-specific error taxonomy
- smoke checks

## Netlify Preview Checklist
- [ ] Open console; confirm pyodide-init success
- [ ] Verify mirror report (`okCount == manifestSize`, `failCount == 0`)
- [ ] Confirm `sys.path[0] == "/repo"`
- [ ] See `EW_OK` and `ENTRY_OK` on first run
- [ ] Intentionally break one manifest path → see `stage: "mirror"` with file name
- [ ] Remove one manifest module → see `stage: "import-probe"` with module name
