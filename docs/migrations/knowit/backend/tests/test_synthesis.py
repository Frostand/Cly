import unittest
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from app.models.ai_providers import ProviderCapabilities, ProviderHealth, ProviderInfo
from app.models.extractions import PaperExtraction
from app.services.ai_providers.base import BaseAIProvider
from app.services.synthesis.landscape_synthesizer import synthesize_landscape


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
        return {"overview": "missing required fields"}


def extraction() -> PaperExtraction:
    return PaperExtraction(
        run_id="run-1",
        paper_id="arxiv:0000.0001v1",
        provider_name="mock",
        problem="Problem",
        method="Method",
        datasets_or_setting="Dataset",
        key_results=["Result"],
        main_contribution="Contribution",
        limitations=["Limitation"],
        tags=["tag"],
        confidence=1.0,
        source_quote_or_evidence="Evidence",
        created_at=datetime.now(timezone.utc),
    )


class SynthesisTest(unittest.TestCase):
    def test_malformed_provider_output_returns_fallback_landscape(self) -> None:
        landscape = synthesize_landscape(
            run_id="run-1",
            topic="tool using language models",
            extractions=[extraction()],
            provider=MalformedProvider(),
        )

        self.assertEqual(landscape.provider_name, "malformed")
        self.assertIn("Fallback landscape", landscape.overview)
        self.assertEqual(landscape.recommended_reading_path, ["arxiv:0000.0001v1"])


if __name__ == "__main__":
    unittest.main()
