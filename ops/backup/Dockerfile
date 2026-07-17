FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim

ARG SUPABASE_CLI_VERSION=2.109.1
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg jq gzip openssl python3 python3-cryptography \
  && install -d -m 0755 /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin supabase \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY ops/backup/*.sh /app/
COPY ops/backup/*.py /app/
COPY supabase /workspace/supabase
RUN chmod 0555 /app/*.sh

ENTRYPOINT ["/app/entrypoint.sh"]
