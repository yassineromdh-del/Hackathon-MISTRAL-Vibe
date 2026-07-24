# Security gate — provider-agnostic, self-contained scanner image.
# Bundles Semgrep + Gitleaks + Trivy + the scoring/publish logic (gate.py).
# The CI host only runs this image with the code mounted at /src.
FROM python:3.12-slim

ARG GITLEAKS_VERSION=8.30.1
ARG TRIVY_VERSION=0.56.2

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

# Semgrep (Python) — pinned major line.
RUN pip install --no-cache-dir "semgrep==1.*"

# Gitleaks — same version the original gate used.
RUN curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      | tar -xz -C /usr/local/bin gitleaks \
    && chmod +x /usr/local/bin/gitleaks

# Trivy CLI.
RUN curl -sSfL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      | tar -xz -C /usr/local/bin trivy \
    && chmod +x /usr/local/bin/trivy

COPY gate.py /app/gate.py

# git needs the mounted repo to be a "safe" directory when owned by another uid.
RUN git config --system --add safe.directory /src

ENV SRC_DIR=/src
WORKDIR /src
ENTRYPOINT ["python", "/app/gate.py"]
