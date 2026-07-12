import unittest
from collections.abc import Mapping
from typing import Any

from app.models.ai_providers import ProviderCapabilities, ProviderHealth, ProviderInfo
from app.models.papers import Paper
from app.services.ai_providers.base import BaseAIProvider
from app.services.extraction.paper_extractor import extract_paper_notes
from app.services.paper_sources.pdf_parser import ParsedPaperText


def paper() -> Paper:
    return Paper(
        paper_id="arxiv:0000.0001v1",
        source="arxiv",
        source_id="0000.0001v1",
        title="Tool Using Language Models",
        authors=["Ada Lovelace"],
        abstract="Tool learning augments language models with external tools.",
        paper_url="https://arxiv.org/abs/0000.0001v1",
        pdf_url="https://arxiv.org/pdf/0000.0001v1",
        categories=["cs.CL"],
    )


class MalformedProvider(BaseAIProvider):
    name = "malformed"

    def info(self) -> ProviderInfo:
        return ProviderInfo(
            name=self.name,
            provider_type="test",
            display_name="Malformed",
            capabilities=ProviderCapabilities(supports_json_generation=True),
            enabled=True,
            is_local=True,
            sends_data_off_machine=False,
        )

    def health_check(self) -> ProviderHealth:
        return ProviderHealth(
            provider_name=self.name,
            available=True,
            status="available",
            message="test",
        )

    def generate_json(
        self,
        prompt: str,
        schema: Mapping[str, Any],
        options: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        return {"problem": "missing required fields"}


class TruncatingProvider(MalformedProvider):
    name = "truncating"
    max_abstract_chars = 12


class FullTextTruncatingProvider(MalformedProvider):
    name = "full-text-truncating"
    max_full_text_section_chars = 10


class ExtractionTest(unittest.TestCase):
    def test_malformed_provider_output_returns_fallback_extraction(self) -> None:
        extraction = extract_paper_notes(
            run_id="run-1",
            paper=paper(),
            provider=MalformedProvider(),
        )

        self.assertEqual(extraction.provider_name, "malformed")
        self.assertEqual(extraction.confidence, 0)
        self.assertIn("Provider output", extraction.limitations[0])
        self.assertEqual(extraction.paper_id, "arxiv:0000.0001v1")
        self.assertFalse(extraction.has_full_text)
        self.assertEqual(extraction.full_text_status, "abstract_only")

    def test_provider_can_limit_abstract_characters_sent_to_prompt(self) -> None:
        provider = TruncatingProvider()
        captured_prompt = ""

        def capture_prompt(
            prompt: str,
            schema: Mapping[str, Any],
            options: Mapping[str, Any] | None = None,
        ) -> Mapping[str, Any]:
            nonlocal captured_prompt
            captured_prompt = prompt
            return {"problem": "missing required fields"}

        provider.generate_json = capture_prompt  # type: ignore[method-assign]

        extract_paper_notes(
            run_id="run-1",
            paper=paper(),
            provider=provider,
        )

        self.assertIn("Abstract: Tool learnin", captured_prompt)
        self.assertNotIn("augments language models", captured_prompt)

    def test_full_text_uses_default_section_limit_when_provider_does_not_set_one(self) -> None:
        provider = MalformedProvider()
        captured_prompt = ""

        def capture_prompt(
            prompt: str,
            schema: Mapping[str, Any],
            options: Mapping[str, Any] | None = None,
        ) -> Mapping[str, Any]:
            nonlocal captured_prompt
            captured_prompt = prompt
            return {"problem": "missing required fields"}

        provider.generate_json = capture_prompt  # type: ignore[method-assign]

        extraction = extract_paper_notes(
            run_id="run-1",
            paper=paper(),
            provider=provider,
            full_text=ParsedPaperText(
                title_page_text="Tool Using Language Models",
                body_text="full body",
                sections={
                    "methods": "The system uses tool APIs with a planner component.",
                },
                references_text="References list omitted.",
            ),
            full_text_status="pdf_downloaded",
        )

        self.assertIn("Parsed PDF sections:", captured_prompt)
        self.assertIn(
            "Methods: The system uses tool APIs with a planner component.",
            captured_prompt,
        )
        self.assertTrue(extraction.has_full_text)
        self.assertEqual(extraction.full_text_status, "pdf_downloaded")

    def test_full_text_sections_are_sent_to_provider_when_available(self) -> None:
        provider = FullTextTruncatingProvider()
        captured_prompt = ""

        def capture_prompt(
            prompt: str,
            schema: Mapping[str, Any],
            options: Mapping[str, Any] | None = None,
        ) -> Mapping[str, Any]:
            nonlocal captured_prompt
            captured_prompt = prompt
            return {"problem": "missing required fields"}

        provider.generate_json = capture_prompt  # type: ignore[method-assign]

        extraction = extract_paper_notes(
            run_id="run-1",
            paper=paper(),
            provider=provider,
            full_text=ParsedPaperText(
                title_page_text="Tool Using Language Models",
                body_text="full body",
                sections={
                    "introduction": "Agents need tools.",
                    "methods": "Planner routes calls through APIs.",
                    "results": "Benchmarks improve.",
                    "conclusion": "Tools help.",
                },
                references_text="Reference text omitted from prompt.",
            ),
            full_text_status="pdf_downloaded",
        )

        self.assertIn("Parsed PDF sections:", captured_prompt)
        self.assertIn("Methods: Planner r", captured_prompt)
        self.assertNotIn("routes calls", captured_prompt)
        self.assertNotIn("Reference text omitted", captured_prompt)
        self.assertTrue(extraction.has_full_text)
        self.assertEqual(extraction.full_text_status, "pdf_downloaded")


if __name__ == "__main__":
    unittest.main()
