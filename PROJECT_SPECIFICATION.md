# Production Specification & Implementation Blueprint
## Enterprise QR-Based Attendance & Anti-Proxy Verification System

---

## Executive Summary
This document outlines the end-to-end engineering specification, architectural topology, cryptographic anti-proxy protocol, database schema, API contracts, deployment configuration, and execution roadmap for an enterprise-grade **QR-Based Attendance System**. 

The system is designed as a **modular monolith** optimized for scalability, defensive security, sub-second latency, and audit compliance. It addresses vulnerabilities in conventional attendance systems—namely proxy attendance, QR screenshot sharing, GPS spoofing, and multi-device credential abuse.

---

## 1. Product Requirements & Role Matrix

### 1.1 Core Problem Statement
Traditional roll-calls consume 10–15 minutes of lecture time and introduce human recording errors. Static QR codes and link-based check-ins fail immediately in student environments because screenshots of QR codes or direct links are easily forwarded to absent peers via messaging platforms.

### 1.2 User Roles & Permissions Matrix

| Feature / Capability | Admin | Teacher / Instructor | Student |
| :--- | :---: | :---: | :---: |
| Institution / Department / Course CRUD | ✅ | ❌ | ❌ |
| Faculty & Student User Provisioning | ✅ | ❌ | ❌ |
| Batch Student Import (CSV parsing) | ✅ | ❌ | ❌ |
| Create & Launch Attendance Session | ❌ | ✅ | ❌ |
| Dynamic QR Broadcast & Projection | ❌ | ✅ | ❌ |
| Real-time WebSocket Attendance Monitor | ❌ | ✅ | ❌ |
| Manual Attendance Override & Audit Reason | ❌ | ✅ | ❌ |
| Export Session / Course Reports (CSV, PDF) | ✅ | ✅ | ❌ |
| Device Binding & Biometric Scan Validation | ❌ | ❌ | ✅ |
| Scan Dynamic Rotating QR with Geofencing | ❌ | ❌ | ✅ |
| View Individual Attendance Analytics | ❌ | ❌ | ✅ |
| System Audit Trail Inspection | ✅ | ❌ | ❌ |

---

## 2. High-Level System Architecture

```
                  ┌────────────────────────────────────────┐
                  │          CLIENT APPLICATIONS           │
                  └────────────────────────────────────────┘
                   /                                      \
        HTTPS / WSS (TLS 1.3)                    HTTPS (TLS 1.3)
                 /                                          \
    ┌───────────────────────────┐             ┌───────────────────────────┐
    │  Web Frontend (React+TS)  │             │ Mobile App (Expo/RN + TS) │
    │   Teacher Dashboard /     │             │    Student Scanner /      │
    │   Admin Control Center    │             │   Device Biometrics       │
    └───────────────────────────┘             └───────────────────────────┘
                 \                                          /
                  \                                        /
                   ▼                                      ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                 REVERSE PROXY & GATEWAY (Caddy / Nginx)              │
    │   • SSL Termination  • HTTP/2 & WebSockets  • Rate Limiting (IP)    │
    └──────────────────────────────────┬──────────────────────────────────┘
                                       │
                                       ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                 FASTAPI APPLICATION CORE (Async ASGI)               │
    │ ┌───────────────┐ ┌────────────────┐ ┌────────────────────────────┐ │
    │ │ /api/v1/auth  │ │ /api/v1/session│ │ /api/v1/attendance         │ │
    │ └───────────────┘ └────────────────┘ └────────────────────────────┘ │
    │ ┌───────────────┐ ┌────────────────┐ ┌────────────────────────────┐ │
    │ │ /api/v1/admin │ │ /api/v1/reports│ │ /ws/sessions/{id} (PubSub) │ │
    │ └───────────────┘ └────────────────┘ └────────────────────────────┘ │
    └──────────────────┬───────────────────────────────┬──────────────────┘
                       │                               │
                       ▼                               ▼
    ┌───────────────────────────────────┐   ┌─────────────────────────────┐
    │      DATABASE (PostgreSQL 16)     │   │      CACHE & COORDINATION   │
    │  • Strict Foreign Keys            │   │         (Redis / Dragonfly) │
    │  • Composite Indexes              │   │  • QR Nonce Expiry Store    │
    │  • Row-Level Security (RLS)       │   │  • WebSocket Connection Hub │
    │  • Alembic Schema Migrations      │   │  • Sliding-Window Limits    │
    └───────────────────────────────────┘   └─────────────────────────────┘
```

### Architectural Rationale (Modular Monolith)
* **Single Deployment Artifact**: Avoids network latency, distributed transactions, and overhead typical of microservices.
* **Strict Logical Boundaries**: Modules (`auth`, `sessions`, `attendance`, `reports`, `notifications`) are isolated through service interfaces, allowing future extraction into microservices if scaling requirements demand it.
* **In-Memory Concurrency**: Python async I/O via ASGI (Uvicorn) paired with asyncpg connection pools allows thousands of concurrent student check-ins.

---

## 3. Defensive Anti-Proxy Security Architecture

```
 Student Device                     FastAPI Backend                     Redis & DB
       │                                   │                                │
       │ 1. POST /attendance/scan          │                                │
       │    {qr_payload, lat, lng, dev_id} │                                │
       ├──────────────────────────────────►│                                │
       │                                   │ 2. Check Expiry (|now - ts| <= 20s)
       │                                   │    Check Device ID in User Profile
       │                                   │                                │
       │                                   │ 3. Atomic Nonce Check (SETNX)  │
       │                                   ├───────────────────────────────►│
       │                                   │◄───────────────────────────────┤
       │                                   │    (If exists: 409 REPLAY)     │
       │                                   │                                │
       │                                   │ 4. Verify HMAC-SHA256 Signature│
       │                                   │    using session.qr_secret     │
       │                                   │                                │
       │                                   │ 5. Geofence Distance Calc      │
       │                                   │    Haversine(student, session) │
       │                                   │                                │
       │                                   │ 6. Insert Attendance Record    │
       │                                   ├───────────────────────────────►│
       │                                   │    (Unique constraint checks)  │
       │                                   │◄───────────────────────────────┤
       │                                   │                                │
       │                                   │ 7. Publish WebSocket Event     │
       │                                   ├───────────────────────────────► [Teacher Screen]
       │ 8. 201 Created (Attendance Valid) │
       │◄──────────────────────────────────┤
```

### 3.1 Dynamic Time-Drift HMAC QR Protocol
1. **Dynamic Payload**:
   ```json
   {
     "sid": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
     "ts": 1728645020,
     "nonce": "e3b0c442",
     "sig": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
   }
   ```
2. **Signature Computation**:
   $$\text{sig} = \text{HMAC-SHA256}(\text{key}=\text{session\_qr\_secret}, \text{data}=\text{sid} + \text{":"} + \text{ts} + \text{":"} + \text{nonce})$$
3. **Verification Steps**:
   * **Timestamp Window**: If $| \text{Server\_Time} - \text{ts} | > 20\text{ seconds}$, return `400 BAD_REQUEST: QR Code Expired`.
   * **Nonce Burn**: Redis atomic `SETNX qr:nonce:<nonce> 1 EX 30`. If return is `0`, return `409 CONFLICT: Token Replayed`.
   * **Signature Verification**: Verify signature using `hmac.compare_digest()` to eliminate timing attacks.

### 3.2 Server-Side Geofencing
Geofence verification runs entirely on the backend using the Haversine equation:
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$
$$d = R \cdot c \quad (\text{where } R = 6,371,000 \text{ meters})$$

* Allowed threshold: $d \le \text{session.radius\_meters} + \text{accuracy\_fudge}$ (typically 30–50 meters).
* Rejection policy: If $d > \text{threshold}$, reject with `403 FORBIDDEN: Student location outside classroom boundary`.

### 3.3 Hardware Device Fingerprinting & Binding
* On first login, the student's mobile hardware UUID (`SecureStore` + device fingerprint) is registered into `users.device_id`.
* Every subsequent attendance attempt must supply this device identifier.
* Attempts using another user's credentials on the same physical phone are blocked, preventing peer attendance fraud.

---

## 4. Production Database Specification (PostgreSQL)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');
CREATE TYPE session_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE attendance_status AS ENUM ('PRESENT', 'LATE', 'FLAGGED', 'MANUAL_OVERRIDE');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    device_id VARCHAR(128) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Academic Hierarchy
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(16) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(16) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_student UNIQUE (course_id, student_id)
);

-- Class Sessions
CREATE TABLE class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(128) NOT NULL,
    status session_status NOT NULL DEFAULT 'PENDING',
    qr_secret VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 50,
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attendance Records
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status attendance_status NOT NULL DEFAULT 'PRESENT',
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    distance_meters DOUBLE PRECISION NULL,
    device_id VARCHAR(128) NOT NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    CONSTRAINT uq_session_student UNIQUE (session_id, student_id)
);

-- System Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id UUID NULL,
    payload JSONB NULL,
    ip_address INET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_users_role_email ON users (role, email);
CREATE INDEX idx_attendance_session ON attendance_records (session_id);
CREATE INDEX idx_attendance_student_marked ON attendance_records (student_id, marked_at DESC);
CREATE INDEX idx_sessions_course_status ON class_sessions (course_id, status);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);
```

---

## 5. API Interface Contracts

### 5.1 Authentication & Profile
* **POST `/api/v1/auth/login`**
  * *Request*: `{ "email": "prof@univ.edu", "password": "secure_password" }`
  * *Response*: `{ "access_token": "...", "token_type": "bearer", "expires_in": 900, "user": {...} }`
* **POST `/api/v1/auth/refresh`**
  * *Request*: Cookie/Token payload
  * *Response*: Refreshed access token pair
* **POST `/api/v1/auth/device/bind`**
  * *Header*: `Authorization: Bearer <student_token>`
  * *Request*: `{ "device_id": "apple-vendor-uuid-or-android-id" }`

### 5.2 Sessions & Dynamic QR Broadcast
* **POST `/api/v1/sessions`**
  * *Request*: `{ "course_id": "...", "title": "Lecture 08", "latitude": 28.6139, "longitude": 77.2090, "radius_meters": 40 }`
  * *Response (201)*: Full session model with generated cryptographic secret.
* **GET `/api/v1/sessions/{id}/qr`**
  * *Description*: Polled by teacher screen or streamed via WebSocket every 15s.
  * *Response*: `{ "session_id": "...", "timestamp": 1728645020, "nonce": "...", "signature": "..." }`
* **POST `/api/v1/sessions/{id}/end`**
  * *Description*: Locks session; prevents future submissions.

### 5.3 Attendance Check-in & Ingestion
* **POST `/api/v1/attendance/scan`**
  * *Request*:
    ```json
    {
      "session_id": "uuid",
      "timestamp": 1728645020,
      "nonce": "a98df23",
      "signature": "hmac_hex",
      "latitude": 28.61391,
      "longitude": 77.20902,
      "device_id": "hardware_uuid"
    }
    ```
  * *Response*: `201 Created` with attendance confirmation and validated distance.

### 5.4 Real-time WebSocket Protocol
* **WS `/api/v1/ws/sessions/{session_id}`**
  * *Authentication*: Passed via initial ticket or query param `?token=...`
  * *Events Pushed to Teacher*:
    ```json
    {
      "event": "ATTENDANCE_MARKED",
      "data": {
        "student_id": "uuid",
        "student_name": "Alex Doe",
        "marked_at": "2026-10-11T19:30:00Z",
        "distance_meters": 12.4
      }
    }
    ```

---

## 6. Monorepo Project Structure

```
qr-attendance-system/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml / requirements.txt
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   └── app/
│       ├── main.py
│       ├── core/
│       │   ├── config.py
│       │   ├── security.py
│       │   └── database.py
│       ├── models/
│       │   ├── user.py
│       │   ├── academic.py
│       │   ├── session.py
│       │   └── attendance.py
│       ├── schemas/
│       │   ├── auth.py
│       │   ├── session.py
│       │   └── attendance.py
│       ├── services/
│       │   ├── qr_service.py
│       │   ├── geo_service.py
│       │   ├── attendance_service.py
│       │   └── export_service.py
│       ├── api/
│       │   └── v1/
│       │       ├── auth.py
│       │       ├── sessions.py
│       │       ├── attendance.py
│       │       ├── reports.py
│       │       └── ws.py
│       └── tests/
│           ├── test_qr.py
│           ├── test_geofence.py
│           └── test_attendance_flow.py
│
├── frontend-web/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/
│       ├── components/
│       │   ├── TeacherQrDisplay.tsx
│       │   ├── LiveAttendanceList.tsx
│       │   └── AnalyticsChart.tsx
│       ├── pages/
│       └── store/
│
└── mobile-app/
    ├── package.json
    ├── app.json
    └── src/
        ├── screens/
        │   ├── ScannerScreen.tsx
        │   └── StudentHistoryScreen.tsx
        ├── services/
        └── utils/
```

---

## 7. Quality Assurance & Testing Matrix

* **Backend Unit & Integration (`pytest`)**:
  * Verify HMAC signature generation and rejection on modified data.
  * Test timestamp expiration ($\Delta t > 20\text{s}$) and clock drift tolerance ($\pm 5\text{s}$).
  * Verify Redis nonce deduplication (submitting identical nonce twice returns 409).
  * Verify Haversine computation for boundary conditions ($d = 49\text{m}$ accepted, $d = 51\text{m}$ rejected).
  * Verify database unique constraint prevents duplicate scans for the same session.
* **End-to-End (`Playwright`)**:
  * Teacher login $\rightarrow$ session creation $\rightarrow$ live QR view.
  * Real-time WebSocket verification: simulate check-in via API $\rightarrow$ observe immediate UI render on teacher dashboard without page refresh.

---

## 8. Eight-Week Implementation Timeline

| Timeline | Milestone Focus | Deliverables |
| :--- | :--- | :--- |
| **Week 1** | Foundation & Containerization | Setup FastAPI, PostgreSQL, Redis in Docker Compose. Alembic initial migration. |
| **Week 2** | Auth & Identity Control | JWT auth, Argon2 hashing, RBAC dependencies, device binding endpoint. |
| **Week 3** | Anti-Proxy Core Engine | Dynamic QR generation, HMAC validator, Redis nonce store, Haversine checks. |
| **Week 4** | WebSockets & Teacher UI | FastAPI WebSocket channel, React web dashboard with dynamic QR projection and live stream. |
| **Week 5** | Student Mobile Scanner | React Native / Expo scanner, camera integration, hardware UUID binding, GPS capture. |
| **Week 6** | Reports & Admin Utilities | CSV streaming, PDF generation, bulk student import CSV with batch inserts. |
| **Week 7** | Testing & CI/CD Pipeline | Comprehensive `pytest` test suite, Playwright E2E tests, GitHub Actions workflow. |
| **Week 8** | Cloud Deployment & Portfolio Polish | Production deployment (Supabase, Fly.io, Vercel), Sentry logging, architectural documentation. |

---

## 9. Interview Presentation Guide

When showcasing this project to interviewers:
1. **Highlight Engineering Trade-offs**: Explain why you chose a **modular monolith** instead of premature microservices (zero distributed transaction overhead, easy local development, unified transactions).
2. **Explain the Anti-Proxy Strategy**: Explain the multi-layered defense (HMAC signature to prevent forgery, 15s window to defeat screenshots, Redis nonce burning to stop replays, Haversine server-side checks to prevent location spoofing, hardware device binding to eliminate proxy check-ins).
3. **Show Data Integrity Safeguards**: Reference database-level unique constraints `(session_id, student_id)` and immutable audit logs that prevent duplicates even under concurrent race conditions.
