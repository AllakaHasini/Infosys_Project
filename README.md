# 🛡️ AI-Powered eKYC & Risk Intelligence on MOSIP
### Infosys AI-on-DPI Internship Project 2024–2026

---

> ⚠️ **IMPORTANT:** This is a **prototype/demonstration system** built for educational and internship purposes.
> All identity verification, liveness checks, and MOSIP/eSignet integrations use **simulated mock providers**.
> This system is **NOT suitable for production use** and must not be used for real identity verification decisions.

---

## 📋 Project Abstract

An AI-powered enterprise onboarding and identity risk intelligence platform built on top of MOSIP (Modular Open Source Identity Platform). The system provides automated identity verification, document fraud detection, biometric liveness simulation, AI-based risk scoring, and a full-featured administrative dashboard — all connected to a local MongoDB database.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 JWT Authentication | Secure login with bcrypt-hashed passwords and role-based access (user / admin / superadmin) |
| 👤 Self-Registration | Applicants create accounts and submit eKYC in a guided 5-step wizard |
| 🆔 MOSIP Identity Check | Simulated MOSIP IDA verification with demographics matching |
| 📄 Document Analysis | OpenCV + Pillow heuristics — sharpness, contrast, duplicate hash, quality score |
| 👁️ Biometric Liveness | Haar-cascade face detection with multi-frame head-movement challenge verification |
| 📊 AI Risk Engine | Configurable weighted heuristic risk scoring (0–100) with explainable factors |
| 🗃️ Admin Dashboard | 11-page dashboard: applications list, detail view, decision override, audit logs, settings |
| 🖼️ Image Evidence Viewer | Admin-only preview of uploaded documents and selfies with zoom/download |
| 🗑️ Delete Applications | Admin-only delete with confirmation popup and audit trail |
| 🔁 Batch Verification | Background thread batch eKYC processing with status polling |
| 📋 Audit Logging | Full audit trail — every verification, decision, and admin action recorded |
| 🔒 Duplicate Prevention | Phone number and ID number uniqueness enforced with friendly error popups |
| 🔑 Forgot Password | OTP-based email password reset flow |
| ⚙️ Configurable Settings | Risk thresholds and provider modes via API + Admin UI |

---

## 🚀 Quick Start (Windows)

### Prerequisites

```powershell
# Python 3.12 (tested stable environment)
py -0p

# Node 18+ and npm
node --version
npm --version

# MongoDB Community 7.0 — running as a Windows service on port 27017
net start MongoDB
Test-NetConnection -ComputerName 127.0.0.1 -Port 27017
```

### Step 1 — Backend Setup

```powershell
cd ekyc-risk-intelligence\backend

# Create virtual environment
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env — set SECRET_KEY, ADMIN_PASSWORD, MONGODB_URI

# Initialize database (creates collections, indexes, default admin)
cd ..
.\.venv\Scripts\python.exe scripts\init_db.py

# (Optional) Seed synthetic demo records
.\.venv\Scripts\python.exe scripts\seed_demo_data.py

# Start FastAPI
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend: http://127.0.0.1:8000  
Swagger UI: http://127.0.0.1:8000/docs

### Step 2 — Frontend Setup

```powershell
cd ekyc-risk-intelligence\frontend

# Configure environment
copy .env.example .env

# Install and run
npm install
npm run dev
```

Frontend: http://localhost:5173

### Step 3 — Login

| Role | Email | Password (default) |
|------|-------|--------------------|
| Admin | `admin@ekyc.local` | Set in `backend/.env` as `ADMIN_PASSWORD` |
| User | Register at `/register` | Your chosen password |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                React Dashboard                   │
│  (Vite + Tailwind CSS + Recharts)               │
│  http://localhost:5173                           │
└────────────────────┬────────────────────────────┘
                     │ REST API (Axios)
                     ▼
┌─────────────────────────────────────────────────┐
│              FastAPI Backend                     │
│  http://127.0.0.1:8000                          │
│                                                  │
│  ┌─────────────┐  ┌────────────┐               │
│  │ Auth (JWT)  │  │ API Routes │               │
│  └─────────────┘  └────────────┘               │
│  ┌─────────────────────────────────────────┐   │
│  │           eKYC Orchestration            │   │
│  │  MOSIP → Document → Liveness → Risk     │   │
│  └─────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Mock     │ │ AI Risk  │ │ Audit        │   │
│  │ MOSIP    │ │ Engine   │ │ Logging      │   │
│  └──────────┘ └──────────┘ └──────────────┘   │
└────────────────────┬────────────────────────────┘
                     │ PyMongo
                     ▼
┌─────────────────────────────────────────────────┐
│          MongoDB Community Server                │
│          mongodb://127.0.0.1:27017              │
│          Database: ekyc_risk_intelligence        │
│                                                  │
│  users │ applications │ verification_results     │
│  risk_assessments │ batch_jobs │ audit_logs      │
│  system_settings                                 │
└─────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
ekyc-risk-intelligence/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── core/config.py             # Settings (pydantic-settings)
│   │   ├── db/mongodb.py              # MongoDB connection & helpers
│   │   ├── security/auth.py           # JWT + bcrypt authentication
│   │   ├── schemas/schemas.py         # Pydantic request/response models
│   │   ├── api/v1/endpoints/
│   │   │   ├── auth.py               # POST /api/auth/login|register|forgot-password
│   │   │   ├── health.py             # GET /api/health
│   │   │   ├── ekyc.py               # POST /api/ekyc/verify
│   │   │   ├── documents.py          # POST /api/documents/analyze
│   │   │   ├── liveness.py           # POST /api/liveness/check
│   │   │   ├── risk.py               # POST /api/risk/score
│   │   │   ├── applications.py       # CRUD + DELETE + images
│   │   │   ├── dashboard.py          # GET /api/dashboard/summary
│   │   │   ├── audit.py              # GET /api/audit-logs
│   │   │   ├── batch.py              # POST /api/batch/verify
│   │   │   └── settings.py           # GET/PATCH /api/settings
│   │   ├── services/
│   │   │   ├── ekyc_service.py       # Orchestration + duplicate checks
│   │   │   ├── document_service.py   # Document analysis (OpenCV/Pillow)
│   │   │   ├── liveness_service.py   # Liveness + face detection
│   │   │   └── audit_service.py      # Audit event logging
│   │   ├── integrations/
│   │   │   ├── mosip/provider.py     # Mock & Real MOSIP adapter
│   │   │   └── esignet/provider.py   # Mock & Real eSignet adapter
│   │   ├── ai/
│   │   │   └── risk_engine.py        # Risk scoring & decision engine
│   │   └── utils/helpers.py          # Serialization, pagination
│   ├── tests/                         # Pytest suite (75 tests)
│   │   ├── test_api.py
│   │   ├── test_database_persistence.py
│   │   ├── test_document_service.py
│   │   ├── test_integrations.py
│   │   ├── test_live_workflow.py
│   │   ├── test_rbac_and_features.py
│   │   └── test_risk_engine.py
│   ├── requirements.txt
│   ├── .env.example                  # Safe template — copy to .env
│   └── .env                          # Your local secrets (NOT committed)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   # React Router setup
│   │   ├── main.jsx                  # Entry point
│   │   ├── index.css                 # Tailwind CSS base
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── ForgotPasswordPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── EKYCVerifyPage.jsx    # 5-step guided eKYC wizard + results
│   │   │   ├── ApplicationsPage.jsx  # Applications list (admin delete)
│   │   │   ├── ApplicationDetailPage.jsx # Detail + admin image viewer + delete
│   │   │   ├── AuditLogsPage.jsx
│   │   │   ├── SettingsPage.jsx
│   │   │   └── BatchVerifyPage.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── Alerts.jsx            # ErrorAlert, AlreadyRegisteredModal
│   │   │   ├── CameraCapture.jsx     # WebRTC face capture + challenge
│   │   │   └── ProtectedRoute.jsx
│   │   ├── services/services.js      # Axios API client
│   │   ├── hooks/useAuth.jsx         # Auth context & hook
│   │   └── utils/utils.js            # Formatting helpers
│   ├── package.json
│   ├── vite.config.js
│   ├── .env.example                  # Safe template — copy to .env
│   └── .env                          # Your local config (NOT committed)
├── scripts/
│   ├── init_db.py                    # DB initialization, indexes, admin user
│   └── seed_demo_data.py             # Synthetic demo data seeder
├── docs/                             # Additional documentation
├── docker-compose.yml                # Optional Docker deployment
├── .gitignore
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | None | App & MongoDB health check |
| POST | `/api/auth/register` | None | Create applicant account |
| POST | `/api/auth/login` | None | Login → JWT token |
| POST | `/api/auth/forgot-password` | None | Request OTP for password reset |
| POST | `/api/auth/reset-password` | None | Reset password with OTP |
| GET | `/api/dashboard/summary` | JWT | Dashboard statistics |
| POST | `/api/ekyc/verify` | JWT | Full eKYC verification workflow |
| POST | `/api/documents/analyze` | JWT | Analyze uploaded document |
| POST | `/api/liveness/check` | JWT | Run liveness check |
| POST | `/api/risk/score` | JWT | Calculate risk score |
| GET | `/api/applications` | JWT | List applications (paginated) |
| GET | `/api/applications/{id}` | JWT | Get single application |
| GET | `/api/applications/{id}/report` | JWT | Get full application report |
| GET | `/api/applications/{id}/images` | **Admin** | Get uploaded images (base64) |
| PATCH | `/api/applications/{id}/decision` | **Admin** | Manual decision override |
| DELETE | `/api/applications/{id}` | **Admin** | Delete application + audit log |
| GET | `/api/audit-logs` | **Admin** | Audit event history |
| POST | `/api/batch/verify` | JWT | Submit batch verification |
| GET | `/api/batch/{id}` | JWT | Check batch status |
| GET | `/api/settings` | **Admin** | Get system settings |
| PATCH | `/api/settings` | **Admin** | Update system settings |

---

## 🗄️ MongoDB Collections

| Collection | Purpose |
|-----------|---------|
| `users` | Accounts, bcrypt-hashed passwords, roles |
| `applications` | eKYC records, decisions, risk scores, base64 images |
| `verification_results` | Identity, document, liveness results per application |
| `risk_assessments` | Score, category, reasons, model version |
| `batch_jobs` | Batch processing status and counters |
| `audit_logs` | Security and decision audit trail |
| `system_settings` | Configurable thresholds and provider modes |

### Key Indexes

```
users:        email [UNIQUE], id_number [UNIQUE SPARSE]
applications: application_id [UNIQUE], id_number [UNIQUE SPARSE],
              status, created_at, applicant_email
```

---

## ⚠️ Risk Scoring Methodology

The risk engine uses a **configurable weighted heuristic model**:

| Signal | Max Points | Notes |
|--------|-----------|-------|
| Identity not verified | 35 | MOSIP provider returned false |
| Document suspicious | 25 | Image heuristics flagged the document |
| Liveness failed | 20 | Liveness check not passed |
| Duplicate detected | 30 | Same ID number in existing application |
| Fields inconsistent | 20 | Submitted data appears inconsistent |
| Low document confidence | 10 | Analysis confidence < 50% |
| Low liveness confidence | 10 | Liveness score < 50% |

**Score = (points / max_possible) × 100**

| Score Range | Category | Default Decision |
|------------|----------|--------------------|
| 0–30 | LOW | APPROVED |
| 31–60 | MEDIUM | MANUAL_REVIEW |
| 61–80 | HIGH | MANUAL_REVIEW |
| 81–100 | VERY_HIGH | REJECTED |

> **Model Disclaimer:** This is a prototype heuristic model, not a validated fraud detection system. Thresholds are fully configurable in Settings.

---

## 🧪 Running Tests

```powershell
cd ekyc-risk-intelligence\backend
.\.venv\Scripts\Activate.ps1

# Run all 75 tests
.\.venv\Scripts\pytest.exe tests\ -q --tb=short

# Run specific modules
pytest tests\test_risk_engine.py -v
pytest tests\test_document_service.py -v
pytest tests\test_rbac_and_features.py -v

# With coverage
pip install pytest-cov
pytest tests\ -v --cov=app --cov-report=term-missing
```

Expected: **75 passed, 0 failed**

---

## 🔒 Security Notes

- JWT tokens expire after 60 minutes (configurable)
- Passwords stored as bcrypt hashes (never plaintext)
- Only `admin` and `superadmin` roles can delete applications or view uploaded images
- CORS restricted to configured frontend origin only
- File uploads validated for type and size
- Phone number and ID number uniqueness enforced at application layer
- No real identity data stored — synthetic demo data only
- `.env` files are excluded from version control via `.gitignore`
- Audit log captures all verification, deletion, and decision events

---

## 🚦 Feature Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Admin Login (JWT) | ✅ | Full bcrypt + JWT |
| Self-Registration | ✅ | No phone at registration — collected in eKYC |
| Forgot / Reset Password | ✅ | OTP-based email flow |
| eKYC 5-Step Wizard | ✅ | Applicant info → Doc type → Upload → Selfie → Review |
| MOSIP Integration | ⚠️ Simulated | Mock provider — real requires credentials |
| eSignet OIDC | ⚠️ Simulated | Mock provider only |
| Document Analysis | ✅ | OpenCV + Pillow heuristics |
| Biometric Liveness | ⚠️ Simulated | Face detection + head-movement challenge |
| Risk Scoring | ✅ | Weighted heuristic model |
| Decision Engine | ✅ | Configurable thresholds |
| Duplicate Prevention | ✅ | Phone + ID uniqueness with popup |
| Admin Dashboard | ✅ | 11 pages |
| Image Evidence Viewer | ✅ | Admin-only, zoom/download |
| Delete Application | ✅ | Confirmation popup + audit log |
| Batch Verification | ✅ | Background thread processing |
| Audit Logging | ✅ | All events logged |
| Configurable Settings | ✅ | Via API + UI |
| Automated Tests | ✅ | 75 pytest tests |
| Docker Deployment | ✅ | docker-compose.yml provided |

---

## ⚠️ Known Limitations

1. **No Real MOSIP Integration** — requires an actual MOSIP deployment, partner ID, API key, and certificates.
2. **Prototype Liveness** — OpenCV face detection ≠ certified liveness. Use a commercial SDK for production.
3. **No Real eSignet** — requires a running eSignet instance with registered client credentials.
4. **OCR Optional** — `pytesseract` needs Tesseract binary installed separately on Windows.
5. **Prototype Risk Model** — weights and thresholds are illustrative; a real system needs actuarial validation.
6. **Single-Threaded Batch** — not suitable for high volume; use Celery + Redis for production.

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|---------|
| `MongoDB not connected` | `net start MongoDB` in PowerShell as Admin |
| `Module not found` | Activate venv: `.\.venv\Scripts\Activate.ps1` |
| `Port 8000 in use` | `netstat -ano \| findstr :8000` then kill the PID |
| `401 Unauthorized` | Run `python scripts\init_db.py` to (re)create admin user |
| Frontend blank page | Check `npm run dev` output for errors |
| `IndexKeySpecsConflict` | Run `python scripts\init_db.py` — it safely migrates indexes |

---

## 📚 Technology Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic v2 |
| Database | MongoDB 7.0 Community, PyMongo |
| AI / CV | OpenCV, NumPy, Pillow, scikit-learn |
| Frontend | React 18, Vite 6, Tailwind CSS, Recharts, React Router v6 |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Testing | pytest, httpx, pytest-asyncio |
| DevOps | Docker Compose (optional) |

---

## 📄 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | ✅ | — | JWT signing secret (min 32 chars) |
| `MONGODB_URI` | ✅ | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MONGODB_DATABASE` | ✅ | `ekyc_risk_intelligence` | Database name |
| `ADMIN_EMAIL` | ✅ | `admin@ekyc.local` | Default admin email |
| `ADMIN_PASSWORD` | ✅ | — | Default admin password |
| `FRONTEND_ORIGIN` | ✅ | `http://localhost:5173` | CORS allowed origin |
| `MOSIP_BASE_URL` | ⬜ | — | Leave blank for mock mode |
| `ESIGNET_BASE_URL` | ⬜ | — | Leave blank for mock mode |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | ✅ | `/api` | Backend API prefix |
| `VITE_BACKEND_TARGET` | ✅ | `http://127.0.0.1:8000` | Vite proxy target |

---

*Infosys AI-on-DPI Internship Project | Built with ❤️ for MOSIP*
