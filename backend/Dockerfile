# The reading service, containerised.
#
# Build from the REPO ROOT, not from backend/:
#
#   docker build -f backend/Dockerfile -t agrosense-api .
#
# because `backend/models.py` resolves the trained models as <root>/ML/models
# and they have to come into the image alongside the code.
#
# Why this exists at all: Vercel hosts the Next.js half and cannot host this
# half. torch alone unpacks to roughly 800 MB against a 250 MB function limit,
# OCR needs the `tesseract` binary rather than a Python package, the research
# sweep is an 11-minute background job rather than a request, and uploads plus
# the vector index need a disk that survives the response. None of those are
# tuning problems.

FROM python:3.14-slim

# Tesseract is a binary dependency, not a wheel: pytesseract shells out to it.
# Both language packs are deliberate — the reference Soil Health Card is a
# Marathi document from Palghar, and `AGROSENSE_OCR_LANGUAGES` defaults to
# "eng+mar". Installing only English would read the numbers and lose the labels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-mar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch first, and from the CPU index exclusively. This service runs a single
# EfficientNet forward pass on CPU and will never see a GPU, so the default
# CUDA build is about 2 GB of driver nobody here can use.
#
# `--index-url` rather than `--extra-index-url`: with `--extra-` pip sees both
# indexes and resolves across them, which is a coin toss on which torch wins.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch torchvision

# Everything else from PyPI. torch and torchvision are already satisfied above,
# so their entries in requirements.txt resolve to "already satisfied" rather
# than a second, CUDA-flavoured download.
#
# The 244 MB of nvidia libraries in this image came from xgboost, not torch —
# it declares nvidia-nccl-cu13 unconditionally on linux. NCCL is for collective
# communication between several GPUs and XGBoost only loads it for
# `device="cuda"`, so dropping it leaves CPU inference untouched. Removed in the
# same layer, because uninstalling in a later one would leave the files in the
# earlier layer and save nothing.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip uninstall -y nvidia-nccl-cu13

COPY backend/ ./backend/
COPY ML/models/ ./ML/models/

# Everything the service writes goes to one directory so the host has exactly
# one volume to mount. Without a volume this still runs — it just forgets the
# uploaded cards and the research reports on every restart.
ENV AGROSENSE_DATA_DIR=/data
VOLUME ["/data"]

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# One worker on purpose. The background research sweep lives in the process, so
# a second worker would mean two schedulers researching the same topics and
# billing the same OpenAI account twice.
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
