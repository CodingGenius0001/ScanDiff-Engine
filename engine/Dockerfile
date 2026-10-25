# The engine's API server. Built and run by deploy/docker-compose.yml.
FROM python:3.11-slim

# Open3D loads these at import time, even without a display.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 libegl1 libgomp1 libglib2.0-0 libusb-1.0-0 libidn2-0 libtbb12 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app app
COPY scandiff scandiff
# calibration.json sets the threshold once scripts/calibrate.py has written it.
COPY calibration.json* ./

EXPOSE 8000
# One worker: sessions from GET /health are kept in this process's memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
