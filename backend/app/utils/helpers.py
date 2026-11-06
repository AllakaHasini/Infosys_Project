"""
Utility helpers shared across the application.
"""
import uuid
from bson import ObjectId
from datetime import datetime


def new_application_id() -> str:
    """Generate a short, URL-safe application ID."""
    return "APP-" + uuid.uuid4().hex[:10].upper()


def new_batch_id() -> str:
    return "BATCH-" + uuid.uuid4().hex[:8].upper()


def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document ObjectIds and datetimes to JSON-safe types.
    Guarantees full Aadhaar numbers are never exposed in serialized output.
    """
    if doc is None or not isinstance(doc, dict):
        return {}
    result = {}
    for k, v in doc.items():
        if k == "_id":
            result["id"] = str(v)
        elif isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, dict):
            result[k] = serialize_doc(v)
        elif isinstance(v, list):
            result[k] = [serialize_doc(i) if isinstance(i, dict) else i for i in v]
        else:
            result[k] = v

    # Security guard: Never expose unmasked Aadhaar in serialized API dictionaries
    id_t = str(result.get("id_type", "")).lower()
    if id_t in ("aadhaar", "aadhaar_card") and "id_number" in result:
        result["id_number"] = mask_id_number(id_t, result["id_number"])

    return result


def paginate(col, query: dict, page: int, page_size: int, sort_field: str = "created_at", sort_dir: int = -1):
    """Return a paginated result set from a MongoDB collection."""
    total = col.count_documents(query)
    skip = (page - 1) * page_size
    cursor = col.find(query).sort(sort_field, sort_dir).skip(skip).limit(page_size)
    items = [serialize_doc(doc) for doc in cursor]
    return items, total


def mask_id_number(id_type: str | None = None, id_number: str | None = None) -> str:
    """
    Mask sensitive identification numbers.
    For Aadhaar (12 digits): masks as XXXX-XXXX-1234.
    For other IDs: masks middle characters while preserving format length.
    Never exposes full Aadhaar numbers in responses or UI views.
    Supports either mask_id_number(id_type, id_number) or mask_id_number(id_number).
    """
    if id_number is None and id_type is not None:
        id_number = id_type
        id_type = "unknown"
        clean_cand = str(id_number).strip().replace(" ", "").replace("-", "")
        if len(clean_cand) == 12 and clean_cand.isdigit():
            id_type = "aadhaar"

    if not id_number:
        return ""
    clean = str(id_number).strip().replace(" ", "").replace("-", "")
    if id_type and id_type.lower() in ("aadhaar", "aadhaar_card"):
        if len(clean) >= 4:
            return f"XXXX-XXXX-{clean[-4:]}"
        return "XXXX-XXXX-XXXX"
    if len(clean) <= 4:
        return "*" * len(clean)
    return clean[:2] + ("*" * (len(clean) - 4)) + clean[-2:]
