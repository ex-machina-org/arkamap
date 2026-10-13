FROM python:3.12-slim
WORKDIR /app
# Source is bind-mounted in compose; don't leave root-owned .pyc in it.
ENV PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
