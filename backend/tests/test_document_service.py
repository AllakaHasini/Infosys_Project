"""
Tests for the Document Analysis Service (Module 2).
"""
import pytest
import io
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only")

from app.services.document_service import analyze_document


def _make_tiny_png() -> bytes:
    """Return a minimal 1x1 red PNG as bytes."""
    import struct, zlib
    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw = b"\x00\xff\x00\x00"  # filter byte + 1 RGB pixel
    idat = png_chunk(b"IDAT", zlib.compress(raw))
    iend = png_chunk(b"IEND", b"")
    return signature + ihdr + idat + iend


class TestDocumentService:
    def test_unsupported_extension_returns_error(self):
        result = analyze_document(b"data", "file.exe", document_type="national_id")
        assert "ANALYSIS_ERROR" in result["flags"]

    def test_valid_png_returns_result(self):
        img = _make_tiny_png()
        result = analyze_document(img, "doc.png", document_type="passport")
        assert "document_type" in result
        assert isinstance(result["suspicious"], bool)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_flags_is_list(self):
        img = _make_tiny_png()
        result = analyze_document(img, "doc.jpg")
        assert isinstance(result["flags"], list)

    def test_note_present(self):
        img = _make_tiny_png()
        result = analyze_document(img, "doc.png")
        assert "note" in result

    def test_oversized_file_flagged(self):
        big_data = b"x" * (11 * 1024 * 1024)
        result = analyze_document(big_data, "big.pdf")
        assert "FILE_TOO_LARGE" in result["flags"]

    def test_extracted_fields_present(self):
        img = _make_tiny_png()
        result = analyze_document(img, "doc.png")
        assert isinstance(result["extracted_fields"], dict)

    def test_pdf_returns_basic_result(self):
        result = analyze_document(b"%PDF-1.4 fake", "scan.pdf", document_type="driving_license")
        assert result["document_type"] == "driving_license"
        assert result["extracted_fields"].get("format") == "PDF"
