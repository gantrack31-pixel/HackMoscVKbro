#!/bin/sh
set -eu

template_dir="${STORAGE_PATH:-data}/templates"
mkdir -p "$template_dir"

for template in tech.pptx workspace.pptx education.pptx; do
    if [ ! -e "$template_dir/$template" ]; then
        cp "/app/backend/seed-templates/$template" "$template_dir/$template"
    fi
done

exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log