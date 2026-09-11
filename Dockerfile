FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY studyflow ./studyflow
COPY migrations ./migrations
COPY wsgi.py ./
COPY --from=frontend /build/dist ./frontend/dist
RUN useradd --create-home studyflow && mkdir -p /app/instance && chown -R studyflow:studyflow /app
USER studyflow
EXPOSE 5000
CMD ["sh", "-c", "flask --app wsgi db upgrade && waitress-serve --listen=0.0.0.0:5000 --threads=12 wsgi:app"]
