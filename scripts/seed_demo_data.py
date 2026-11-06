"""
Demo Data Seeding Script.
Inserts clearly labeled synthetic test records into MongoDB.
ALL data is fictional — not real identities.

Usage:
    cd backend
    python ../scripts/seed_demo_data.py
"""
import sys
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

from app.db.mongodb import check_connection, applications_col, risk_assessments_col, audit_logs_col
from app.utils.helpers import new_application_id

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

SYNTHETIC_APPLICANTS = [
    {"full_name": "Alice Demo", "date_of_birth": "1990-03-15", "gender": "female",
     "nationality": "India", "id_type": "national_id", "id_number": "DEMO001",
     "email": "alice.demo@example.test"},
    {"full_name": "Bob Sample", "date_of_birth": "1985-07-22", "gender": "male",
     "nationality": "India", "id_type": "passport", "id_number": "DEMO002",
     "email": "bob.sample@example.test"},
    {"full_name": "Carol Test", "date_of_birth": "1995-11-08", "gender": "female",
     "nationality": "India", "id_type": "driving_license", "id_number": "DEMO003",
     "email": "carol.test@example.test"},
    {"full_name": "Dave Synthetic", "date_of_birth": "1978-01-30", "gender": "male",
     "nationality": "India", "id_type": "voter_id", "id_number": "DEMO004",
     "email": "dave.synthetic@example.test"},
    {"full_name": "Eva Fixture", "date_of_birth": "2000-05-20", "gender": "female",
     "nationality": "India", "id_type": "national_id", "id_number": "DEMO005",
     "email": "eva.fixture@example.test"},
]

DECISIONS = ["APPROVED", "APPROVED", "MANUAL_REVIEW", "REJECTED", "MANUAL_REVIEW"]
RISK_SCORES = [18.5, 22.0, 54.0, 87.3, 61.5]
RISK_CATS = ["LOW", "LOW", "MEDIUM", "VERY_HIGH", "HIGH"]


def seed():
    status = check_connection()
    if status["status"] != "connected":
        logger.error("MongoDB not connected.")
        sys.exit(1)

    col = applications_col()
    inserted = 0
    now = datetime.now(timezone.utc)

    for i, applicant in enumerate(SYNTHETIC_APPLICANTS):
        app_id = f"DEMO-APP-{i+1:03d}"
        if col.find_one({"application_id": app_id}):
            logger.info("Skipping existing demo record: %s", app_id)
            continue

        created = now - timedelta(days=random.randint(1, 30))
        doc = {
            "application_id": app_id,
            "applicant_name": applicant["full_name"],
            "applicant_email": applicant["email"],
            "id_type": applicant["id_type"],
            "id_number": applicant["id_number"],
            "status": "completed",
            "decision": DECISIONS[i],
            "risk_score": RISK_SCORES[i],
            "risk_category": RISK_CATS[i],
            "identity_result": {"provider": "MOCK_MOSIP", "verified": DECISIONS[i] == "APPROVED", "simulated": True},
            "document_result": None,
            "liveness_result": {"provider": "MOCK_LIVENESS", "live": True, "simulated": True},
            "simulated": True,
            "demo_data": True,
            "note": "SYNTHETIC DEMO DATA — not a real identity",
            "created_at": created,
            "updated_at": created,
        }
        col.insert_one(doc)

        risk_assessments_col().insert_one({
            "application_id": app_id,
            "score": RISK_SCORES[i],
            "category": RISK_CATS[i],
            "decision": DECISIONS[i],
            "reasons": ["Demo record — synthetic data"],
            "model_note": "Synthetic demo record",
            "created_at": created,
        })

        audit_logs_col().insert_one({
            "event_type": "EKYC_VERIFICATION",
            "description": f"Demo eKYC for {applicant['full_name']}",
            "application_id": app_id,
            "performed_by": "seed_script",
            "metadata": {"demo": True},
            "timestamp": created,
        })

        inserted += 1
        logger.info("Inserted demo record: %s — %s", app_id, DECISIONS[i])

    logger.info("✅  Seeded %d demo records (SYNTHETIC DATA ONLY).", inserted)


if __name__ == "__main__":
    seed()
