FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim@sha256:0d048f80b3bac596bdafc6f0b289b4267ecaaf1e73506e4f6da0b4bef8909fef

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT PYTHONDONTWRITEBYTECODE=1 HOME=/tmp

RUN apt-get update \
  && apt-get install -y --no-install-recommends age ca-certificates curl gnupg python3 \
  && install -d -m 0755 /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ops/drive-backup/drive_backup.py ops/drive-backup/trigger_server.py /app/
COPY supabase /workspace/supabase
USER 65532:65532
ENTRYPOINT ["python3"]
CMD ["/app/drive_backup.py"]
