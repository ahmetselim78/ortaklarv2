FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim@sha256:0d048f80b3bac596bdafc6f0b289b4267ecaaf1e73506e4f6da0b4bef8909fef

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT PYTHONDONTWRITEBYTECODE=1 HOME=/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends age ca-certificates postgresql-client python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ops/drive-backup/drive_backup.py ops/drive-backup/trigger_server.py /app/
COPY supabase /workspace/supabase
USER 65532:65532
ENTRYPOINT ["python3"]
CMD ["/app/drive_backup.py"]
