# Content pipeline

Fetch public Singapore Telegram/confirmgood posts, merge source identities, and extract deal/event drafts into ignored `out/` JSON files. Gemini is optional; without its key, extraction uses regex. The API adds geocoding and automatic publication eligibility. There is no review UI.

Setup, private credentials, the $0 policy, Docker operation and verification are documented once in [Development](../docs/DEVELOPMENT.md#pipeline-development). Current limitations and dated data counts live in [Project](../docs/PROJECT.md).

From the repository root, after installing the pipeline environment:

```bash
pipeline/.venv/bin/python pipeline/run.py --limit 15
pipeline/.venv/bin/python pipeline/run.py --channels sgfooddeals,dateideas --no-confirmgood
pipeline/.venv/bin/python pipeline/evaluate.py
```

Use `pipeline/.venv/Scripts/python.exe` on Windows. Label examples according to [labels/README.md](labels/README.md) before interpreting extraction accuracy.

Outputs: `out/raw_posts.json`, `out/drafts.json` and `out/ingest_runs.json`. New/edited posts are extracted; source identities prevent accidental duplicate records. Unknown fields remain null. A source failure is reported and skipped. Provider/account credentials and these local output files are not committed.
