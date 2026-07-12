import sys
import types
import unittest
from unittest.mock import patch

from app.services.paper_sources.pdf_parser import (
    format_sections_for_prompt,
    identify_sections,
    parse_pdf_text,
)


class FakePage:
    def __init__(self, text: str) -> None:
        self.text = text

    def get_text(self, mode: str) -> str:
        return self.text


class FakeDocument(list[FakePage]):
    def __init__(self, pages: list[FakePage]) -> None:
        super().__init__(pages)
        self.closed = False

    def close(self) -> None:
        self.closed = True


class PdfParserTest(unittest.TestCase):
    def test_pdf_parser_extracts_sections_and_strips_references(self) -> None:
        fake_document = FakeDocument(
            [
                FakePage(
                    """
                    Retrieval Augmented Generation for Agents
                    1 Introduction
                    Agents need grounded retrieval.
                    """
                ),
                FakePage(
                    """
                    2 Methods
                    The system uses DPR plus FiD.
                    3 Results
                    It is evaluated on KILT and Natural Questions.
                    4 Conclusion
                    Retrieval improves tool use.
                    References
                    [1] Bibliographic entry.
                    """
                ),
            ]
        )

        def fake_open(stream: bytes, filetype: str) -> FakeDocument:
            self.assertEqual(stream, b"%PDF test")
            self.assertEqual(filetype, "pdf")
            return fake_document

        fake_fitz = types.SimpleNamespace(open=fake_open)
        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            parsed = parse_pdf_text(b"%PDF test")

        self.assertTrue(fake_document.closed)
        self.assertIn("Retrieval Augmented Generation", parsed.title_page_text)
        self.assertIn("DPR plus FiD", parsed.sections["methods"])
        self.assertIn("KILT", parsed.sections["results"])
        self.assertIn("Retrieval improves tool use", parsed.sections["conclusion"])
        self.assertNotIn("Bibliographic entry", parsed.body_text)
        self.assertIn("Bibliographic entry", parsed.references_text)

    def test_identify_sections_falls_back_to_body_when_headers_are_missing(self) -> None:
        sections = identify_sections("Unstructured paper text with useful details.")

        self.assertEqual(
            sections,
            {"body": "Unstructured paper text with useful details."},
        )

    def test_format_sections_for_prompt_truncates_each_section(self) -> None:
        fake_document = FakeDocument([FakePage("Introduction\nabcdef")])

        fake_fitz = types.SimpleNamespace(
            open=lambda stream, filetype: fake_document,
        )
        with patch.dict(sys.modules, {"fitz": fake_fitz}):
            parsed = parse_pdf_text(b"%PDF test")

        sections = format_sections_for_prompt(parsed, max_section_chars=3)

        self.assertEqual(sections["Introduction"], "abc")


if __name__ == "__main__":
    unittest.main()
