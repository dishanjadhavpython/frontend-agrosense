from __future__ import annotations

import io
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

FIXTURE = Path(__file__).parent / "fixtures" / "soil_health_card_marathi.pdf"

"""
A card belongs to the farmer who uploaded it.

The hole this closes was live. `list()` took no arguments and returned every
stored card in full — extracted readings included — and `get()` would hand over
any id to any caller. A Maharashtra Soil Health Card carries a name, a village
and a survey number. On localhost that is invisible; behind a public address it
is a disclosure of other people's land records.

The interesting assertion here is not that A can read their own card. It is the
*shape* of the refusal when B tries.
"""


class DocumentsAreOwned(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="agrosense-owner-"))
        uploads = cls.tmp / "uploads"
        uploads.mkdir(parents=True)

        # Storage points at a scratch directory, and the vector store gets its
        # own file, so this can never touch a developer's real data.
        cls.patches = [
            mock.patch("backend.document_service.UPLOAD_DIR", uploads),
            mock.patch("backend.vector_store.VECTOR_STORE_FILE", cls.tmp / "store.pkl"),
        ]
        for patch in cls.patches:
            patch.start()

        from backend.document_service import DocumentService

        cls.service = DocumentService()
        with FIXTURE.open("rb") as handle:
            record = cls.service.ingest(
                filename="soil_health_card_marathi.pdf",
                stream=io.BytesIO(handle.read()),
                owner_id="user_alice",
            )
        cls.doc_id = record["id"]

    @classmethod
    def tearDownClass(cls) -> None:
        for patch in cls.patches:
            patch.stop()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_the_owner_can_read_their_card(self) -> None:
        card = self.service.get(self.doc_id, owner_id="user_alice")
        self.assertEqual(card["id"], self.doc_id)
        self.assertEqual(card["metric_count"], 12)

    def test_another_user_cannot(self) -> None:
        with self.assertRaises(FileNotFoundError):
            self.service.get(self.doc_id, owner_id="user_bob")

    def test_the_refusal_is_indistinguishable_from_absence(self) -> None:
        """Not a 403. Distinguishing "not yours" from "does not exist" confirms
        to a stranger that a given id is real, which is the single bit of
        information an enumeration attempt is looking for."""
        with self.assertRaises(FileNotFoundError) as theirs:
            self.service.get(self.doc_id, owner_id="user_bob")
        with self.assertRaises(FileNotFoundError) as missing:
            self.service.get("0000000000-nothing.pdf", owner_id="user_bob")
        self.assertEqual(str(theirs.exception), str(missing.exception))

    def test_listing_is_scoped(self) -> None:
        self.assertEqual(len(self.service.list(owner_id="user_alice")), 1)
        # The failure this replaces: `list()` returned everybody's cards.
        self.assertEqual(self.service.list(owner_id="user_bob"), [])

    def test_asking_questions_about_it_is_scoped_too(self) -> None:
        """Reading a card and interrogating it are the same disclosure."""
        with self.assertRaises(FileNotFoundError):
            self.service.ask(
                "How much nitrogen?",
                document_id=self.doc_id,
                owner_id="user_bob",
            )

    def test_an_unowned_upload_is_refused(self) -> None:
        """There is no default owner. A card nobody owns is a card readable by
        the first person who asks for it, which is the state being fixed."""
        with FIXTURE.open("rb") as handle:
            with self.assertRaises(ValueError):
                self.service.ingest(
                    filename="x.pdf", stream=io.BytesIO(handle.read()), owner_id=""
                )

    def test_re_extraction_keeps_the_owner(self) -> None:
        """A bump to EXTRACTION_VERSION re-reads every stored card. If that path
        drops `owner_id`, every document silently becomes unowned — a regression
        that looks like nothing at all until somebody reads somebody else's
        card."""
        from backend import document_service as ds

        with mock.patch.object(ds, "EXTRACTION_VERSION", ds.EXTRACTION_VERSION + 1):
            card = self.service.get(self.doc_id, owner_id="user_alice")
            self.assertEqual(card["id"], self.doc_id)
        with self.assertRaises(FileNotFoundError):
            self.service.get(self.doc_id, owner_id="user_bob")


if __name__ == "__main__":
    unittest.main()
