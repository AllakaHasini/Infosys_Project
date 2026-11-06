# Architecture Documentation

## System Overview

The eKYC Risk Intelligence platform is a three-tier web application:

1. **Presentation Layer** — React 18 SPA (Vite + Tailwind CSS)
2. **Application Layer** — FastAPI (Python) REST API
3. **Data Layer** — MongoDB Community Server (local)

## Architecture Diagram (Mermaid)

```mermaid
graph TD
    subgraph Frontend ["🖥️ React Dashboard (Port 5173)"]
        LP[Login Page]
        DB[Dashboard]
        EK[eKYC Verify]
        DOC[Document Analysis]
        LV[Liveness Check]
        RS[Risk Score]
        AL[Applications List]
        AD[Application Detail]
        BV[Batch Verify]
        AUL[Audit Logs]
        ST[Settings]
    end

    subgraph Backend ["⚙️ FastAPI Backend (Port 8000)"]
        AUTH[Auth Router / JWT]
        EKYC[eKYC Router]
        DOCS_R[Documents Router]
        LIVE_R[Liveness Router]
        RISK_R[Risk Router]
        APPS_R[Applications Router]
        DASH_R[Dashboard Router]
        BATCH_R[Batch Router]
        AUDIT_R[Audit Router]
        SET_R[Settings Router]
    end

    subgraph Services ["🔧 Services Layer"]
        EKYC_S[eKYC Orchestration Service]
        DOC_S[Document Service - OpenCV/Pillow]
        LIVE_S[Liveness Service - Mock/Real]
        AUDIT_S[Audit Service]
    end

    subgraph Integrations ["🔌 Integrations"]
        MOSIP[MOSIP Adapter - Mock/Real]
        ESIGNET[eSignet Adapter - Mock/Real]
    end

    subgraph AI ["🤖 AI/ML Layer"]
        RISK_E[Risk Engine - Weighted Heuristic]
        DEC_E[Decision Engine - Thresholds]
    end

    subgraph Database ["🗄️ MongoDB (Port 27017)"]
        USERS[(users)]
        APPS[(applications)]
        VR[(verification_results)]
        RA[(risk_assessments)]
        BJ[(batch_jobs)]
        ALOG[(audit_logs)]
        SS[(system_settings)]
    end

    Frontend -->|Axios REST| Backend
    Backend --> Services
    Backend --> Integrations
    Backend --> AI
    Services --> Database
    AI --> Database
    Integrations --> Services
```

## Data Flow — eKYC Verification

```mermaid
sequenceDiagram
    participant U as Admin User
    participant FE as React Frontend
    participant API as FastAPI
    participant MOSIP as MOSIP Adapter
    participant LIVE as Liveness Service
    participant RISK as Risk Engine
    participant DB as MongoDB

    U->>FE: Fill applicant form & submit
    FE->>API: POST /api/ekyc/verify (JWT)
    API->>MOSIP: verify_identity(applicant)
    MOSIP-->>API: {verified, simulated, ...}
    API->>LIVE: check(image, token)
    LIVE-->>API: {live, confidence, simulated}
    API->>DB: Check duplicate (applications)
    API->>RISK: calculate_risk_score(signals)
    RISK-->>API: {score, category, decision, reasons}
    API->>DB: Insert application, verification_results, risk_assessment
    API->>DB: Insert audit_log event
    API-->>FE: EKYCVerifyResponse
    FE->>U: Show result with risk score & decision
```

## Database Design & Entity Relationship (Module 1 - Data Layer)

The system data model is designed to support 19 logical entities across MOSIP integration, document & liveness verification, and explainable risk scoring:

```mermaid
erDiagram
    ORGANIZATION ||--o{ RISK_THRESHOLD_CONFIG : configures
    ORGANIZATION ||--o{ BATCH_JOB : initiates
    ORGANIZATION ||--o{ API_CLIENT : issues
    ORGANIZATION ||--o{ VERIFICATION_REQUEST : submits

    APPLICANT ||--o{ VERIFICATION_REQUEST : undergoes
    APPLICANT ||--o{ BEHAVIORAL_SIGNAL : emits
    APPLICANT ||--o{ HISTORICAL_RECORD : maintains

    VERIFICATION_REQUEST ||--o| ESIGNET_SESSION : initiates
    VERIFICATION_REQUEST ||--o| MOSIP_AUTH_RESULT : evaluates
    VERIFICATION_REQUEST ||--o{ DOCUMENT : contains
    VERIFICATION_REQUEST ||--o{ BIOMETRIC_CAPTURE : contains
    VERIFICATION_REQUEST ||--o{ CROSS_REF_RESULT : verifies
    VERIFICATION_REQUEST ||--o| RISK_ASSESSMENT : generates
    VERIFICATION_REQUEST ||--o{ AUDIT_LOG : tracks

    DOCUMENT ||--o| FRAUD_DETECTION_RESULT : yields
    BIOMETRIC_CAPTURE ||--o| LIVENESS_RESULT : yields
    DATA_SOURCE ||--o{ CROSS_REF_RESULT : supplies
    RISK_ASSESSMENT ||--o{ RISK_FACTOR : decomposes

    FRAUD_DETECTION_RESULT ..> RISK_FACTOR : feeds
    LIVENESS_RESULT ..> RISK_FACTOR : feeds
    MOSIP_AUTH_RESULT ..> RISK_FACTOR : feeds
    CROSS_REF_RESULT ..> RISK_FACTOR : feeds
    BEHAVIORAL_SIGNAL ..> RISK_FACTOR : feeds
    HISTORICAL_RECORD ..> RISK_FACTOR : feeds
```

## DigiSetu & MOSIP eSignet Onboarding Flow

```mermaid
flowchart TD
    A[Landing Page → eSignet] -->|Consent Request| B[MOSIP eSignet Consent]
    B --> C[Multi-Mode Auth: OTP / Biometric]
    C --> D[Session Dashboard]
    D --> E[Choose Document Type: Passport / National ID / DL]
    E --> F[Upload Document Image / PDF]
    F --> G[Document Review & Integrity Checks]
    G --> H[Verification & OCR Extraction]
    H --> I[AI Risk Scoring & Decision View]

    style A fill:#d1fae5,stroke:#059669
    style B fill:#ede9fe,stroke:#7c3aed
    style C fill:#d1fae5,stroke:#059669
    style D fill:#d1fae5,stroke:#059669
    style E fill:#d1fae5,stroke:#059669
    style F fill:#d1fae5,stroke:#059669
    style G fill:#fef3c7,stroke:#d97706
    style H fill:#fef3c7,stroke:#d97706
    style I fill:#fef3c7,stroke:#d97706
```

## Module Descriptions

### Module 1: Identity Verification (MOSIP Adapter)
- **File**: `app/integrations/mosip/provider.py`
- **MockMosipProvider**: Returns deterministic simulated results based on input hash
- **RealMosipProvider**: Stub — requires MOSIP_BASE_URL + credentials
- **Key design**: Provider interface enables easy swap to real implementation

### Module 2: Document Fraud Detection
- **File**: `app/services/document_service.py`
- **Checks**: File type, size, image dimensions, brightness/contrast, sharpness (Laplacian variance), edge density
- **OCR**: Optional via pytesseract (requires Tesseract binary)
- **Output**: flags[], confidence (0–1), extracted_fields, note

### Module 3: Liveness & Anti-Spoofing
- **File**: `app/services/liveness_service.py`
- **MockLivenessProvider**: Returns simulated live=True with face detection if image uploaded
- **Face detection**: OpenCV Haar cascade (NOT real liveness)
- **Key warning**: Standard face detection ≠ anti-spoofing

### Module 4: eSignet Authentication
- **File**: `app/integrations/esignet/provider.py`
- **MockESignetProvider**: Simulated OIDC authentication
- **RealESignetProvider**: Stub — requires eSignet instance + client registration

### Module 5: AI Risk Scoring Engine
- **File**: `app/ai/risk_engine.py`
- **Approach**: Weighted explainable heuristic model
- **Signals**: 7 configurable weighted signals with zero sensitive attribute bias
- **Output**: score (0–100), category, decision, reasons[], weights_used

### Module 6: Risk Decision Engine
- **Part of**: `app/ai/risk_engine.py`
- **Configurable thresholds**: Read from settings (DB or env vars)
- **Safety**: Simulated providers escalate to MANUAL_REVIEW

### Module 7–10: REST API, Batch, Dashboard, Security
- **All routes**: `app/api/v1/endpoints/`
- **Auth**: JWT Bearer via OAuth2PasswordBearer
- **Roles**: admin (can update decisions), authenticated user (can read/verify)

