# App backend — the single serverless deployable (webhook + scan engine).
# Built ON TOP of the gate engine image, so the scanners + gate.py are already
# present; we just add the web server. One image, deploy once (Cloud Run/Fly).
ARG GATE_IMAGE=ghcr.io/local/gate:v1
FROM ${GATE_IMAGE}

RUN pip install --no-cache-dir flask gunicorn "pyjwt[crypto]" requests

COPY server.py /app/server.py
WORKDIR /app

# The base image runs the CLI; here we run the web server instead.
ENTRYPOINT []
ENV PORT=8080
# Long timeout: a request scans a repo synchronously. Scale-to-zero friendly.
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "-k", "gthread", "--threads", "4", "--timeout", "1800", "server:app"]
