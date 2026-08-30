from __future__ import annotations

import unittest

from backend.ingest import UnsupportedDocument, looks_like, verify_magic
from backend.pdf_processor import MAX_PDF_PAGES

"""
What we agree to store, and how much of it we agree to read.

Two cheap checks in front of the two expensive things this service does. The
extension already chose which reader runs; these decide whether the bytes are
plausibly that thing at all, and whether the document is small enough to be
worth reading.
"""


class TheBytesMustMatchTheName(unittest.TestCase):
    def test_real_files_are_accepted(self) -> None:
        self.assertTrue(looks_like("pdf", b"%PDF-1.7\n"))
        self.assertTrue(looks_like("image", b"\xff\xd8\xff\xe0"))       # JPEG
        self.assertTrue(looks_like("image", b"\x89PNG\r\n\x1a\n"))       # PNG
        self.assertTrue(looks_like("image", b"II*\x00"))                 # TIFF

    def test_html_named_pdf_is_refused(self) -> None:
        """The interesting case. A browser handed a `.pdf` that is really HTML
        may decide to render it — `nosniff` covers the served response, this
        covers agreeing to keep it at all."""
        self.assertFalse(looks_like("pdf", b"<!DOCTYPE html><html>"))

    def test_an_executable_named_pdf_is_refused(self) -> None:
        self.assertFalse(looks_like("pdf", b"MZ\x90\x00\x03"))

    def test_a_script_named_jpg_is_refused(self) -> None:
        self.assertFalse(looks_like("image", b"#!/bin/sh\nrm -rf /"))

    def test_the_refusal_names_what_to_send_instead(self) -> None:
        """A farmer reading this needs an instruction, not a diagnosis."""
        with self.assertRaises(UnsupportedDocument) as caught:
            verify_magic("pdf", b"<html>")
        self.assertIn("PDF, JPG or PNG", str(caught.exception))

    def test_an_unknown_kind_is_not_blocked(self) -> None:
        """This check exists to refuse obvious mismatches, not to be the
        allowlist. A kind with no signature registered passes through to the
        reader, which rejects what it genuinely cannot read."""
        self.assertTrue(looks_like("something-else", b"anything"))


class TheresACeilingOnPages(unittest.TestCase):
    def test_the_cap_is_above_a_real_card_and_far_below_an_attack(self) -> None:
        """A Soil Health Card is one or two pages. A 400-page PDF fits easily
        inside the 10 MB upload limit and would hold a worker for minutes
        rendering every page at 300 DPI for OCR — free for the sender."""
        self.assertGreaterEqual(MAX_PDF_PAGES, 2)
        self.assertLessEqual(MAX_PDF_PAGES, 50)


if __name__ == "__main__":
    unittest.main()
