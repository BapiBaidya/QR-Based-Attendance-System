# Enterprise QR-Based Attendance & Anti-Proxy Verification System

A high-performance, tamper-resistant attendance system built with **FastAPI**, **PostgreSQL**, **Redis**, and **WebSockets**. Designed to defeat QR screenshot sharing, replay attacks, device sharing, and location spoofing.

---

## 🛡️ Anti-Proxy Defense Architecture

1. **Dynamic Rotating HMAC-SHA256 QR Codes**: Rotates every 15 seconds with server-side time-drift validation ($\pm 20\text{s}$).
2. **Atomic Single-Use Nonce Burn**: Redis `SETNX` burns nonces upon scan, preventing replay attacks.
3. **Hardware Device Binding**: Locks student accounts to their physical device UUID.
4. **Server-Side Geofencing**: Computes Haversine distance against classroom coordinates ($d \le \text{radius}$).
5. **Atomic Database Upsert**: Unique constraints (`uq_session_student`) prevent race conditions.
6. **Real-time Live Attendance**: WebSocket feeds (`/api/v1/ws/sessions/{id}`) stream check-ins to teachers instantly.

---

## 🚀 Quickstart with Docker Compose

Spin up **PostgreSQL 16**, **Redis 7**, and the **FastAPI Backend** with auto-applied Alembic migrations in one command:

```bash
# 1. Clone repository & configure environment
cp .env.example .env

# 2. Start all services
docker compose up --build -d

# 3. Check logs
docker compose logs -f backend
```

- API Docs: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🛠️ Local Development (Without Docker)

### Prerequisites
- Python 3.11+
- PostgreSQL 16 & Redis running locally

### Setup Steps
```bash
cd backend

# Create virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Run database migrations
alembic upgrade head

# Run development server with auto-reload
uvicorn app.main:app --reload --port 8000
```

### Running Tests
```bash
pytest
```

---

## 🖥️ Teacher Web Console (`frontend-web`)

A modern, high-contrast cybernetic React 19 + TypeScript dashboard featuring:
- **Dynamic Rotating QR Projector**: Big-screen projection mode for auditoriums with a 15-second SVG circular countdown timer ring.
- **Sub-Second Live Stream**: Real-time WebSocket connection to `/api/v1/ws/sessions/{id}` with instant student check-in card entries.
- **Spatial Telemetry**: Real-time Haversine distance distribution histogram and security metrics.
- **Manual Audit Overrides**: Role-based teacher override with mandatory audit reasons.
- **Report Export**: Instant CSV download for lecture records.

### Running Frontend Locally
```bash
cd frontend-web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
