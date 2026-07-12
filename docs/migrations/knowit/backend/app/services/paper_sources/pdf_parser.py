from dataclasses import dataclass
import re
from typing import Any


SECTION_ALIASES = {
    "introduction": "introduction",
    "background": "introduction",
    "related work": "introduction",
    "method": "methods",
    "methods": "methods",
    "methodology": "methods",
    "approach": "methods",
    "model": "methods",
    "experiment": "results",
    "experiments": "results",
    "evaluation": "results",
    "results": "results",
    "discussion": "results",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
}
SECTION_HEADER_PATTERN = re.compile(
    r"^\s*(?:\d+(?:\.\d+)*\s+)?"
    r"(Introduction|Background|Related Work|Method|Methods|Methodology|Approach|"
    r"Model|Experiment|Experiments|Evaluation|Results|Discussion|Conclusion|"
    r"Conclusions)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
REFERENCES_PATTERN = re.compile(
    r"^\s*(?:\d+(?:\.\d+)*\s+)?(References|Bibliography)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


class PdfParsingError(Exception):
    pass


@dataclass(frozen=True)
class ParsedPaperText:
    title_page_text: str
    body_text: str
    sections: dict[str, str]
    references_text: str

    @property
    def has_extractable_text(self) -> bool:
        return bool(self.body_text.strip() or self.title_page_text.strip())


def parse_pdf_text(pdf_bytes: bytes) -> ParsedPaperText:
    if not pdf_bytes:
        raise PdfParsingError("PDF content is empty")

    try:
        import fitz  # type: ignore[import-not-found]
    except ImportError as exc:
        raise PdfParsingError("PyMuPDF is not installed") from exc

    try:
        document = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise PdfParsingError("PDF could not be opened") from exc

    try:
        page_texts = [_clean_text(page.get_text("text")) for page in document]
    except Exception as exc:
        raise PdfParsingError("PDF text could not be extracted") from exc
    finally:
        close = getattr(document, "close", None)
        if callable(close):
            close()

    if not page_texts:
        raise PdfParsingError("PDF did not contain pages")

    full_text = "\n\n".join(text for text in page_texts if text)
    body_text, references_text = _split_references(full_text)
    sections = identify_sections(body_text)
    return ParsedPaperText(
        title_page_text=page_texts[0],
        body_text=body_text,
        sections=sections,
        references_text=references_text,
    )


def identify_sections(text: str) -> dict[str, str]:
    matches = list(SECTION_HEADER_PATTERN.finditer(text))
    if not matches:
        return {"body": text.strip()} if text.strip() else {}

    sections: dict[str, str] = {}
    for index, match in enumerate(matches):
        raw_name = _normalize_header(match.group(1))
        section_name = SECTION_ALIASES.get(raw_name, raw_name)
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        section_text = text[start:end].strip()
        if section_text and section_name not in sections:
            sections[section_name] = section_text

    return sections


def format_sections_for_prompt(
    parsed_text: ParsedPaperText,
    *,
    max_section_chars: int = 2000,
) -> dict[str, str]:
    return {
        "Title Page": _truncate(parsed_text.title_page_text, max_section_chars),
        "Introduction": _truncate(
            _first_section(parsed_text.sections, ["introduction", "body"]),
            max_section_chars,
        ),
        "Methods": _truncate(
            _first_section(parsed_text.sections, ["methods", "body"]),
            max_section_chars,
        ),
        "Results": _truncate(
            _first_section(parsed_text.sections, ["results", "body"]),
            max_section_chars,
        ),
        "Conclusion": _truncate(
            _first_section(parsed_text.sections, ["conclusion", "body"]),
            max_section_chars,
        ),
    }


def _split_references(text: str) -> tuple[str, str]:
    matches = list(REFERENCES_PATTERN.finditer(text))
    if not matches:
        return text.strip(), ""

    reference_match = matches[-1]
    return text[: reference_match.start()].strip(), text[reference_match.end() :].strip()


def _first_section(sections: dict[str, str], names: list[str]) -> str:
    for name in names:
        value = sections.get(name)
        if value:
            return value
    return ""


def _clean_text(value: Any) -> str:
    lines = [line.strip() for line in str(value or "").splitlines()]
    cleaned_lines = [line for line in lines if line]
    return "\n".join(cleaned_lines)


def _normalize_header(value: str) -> str:
    return " ".join(value.lower().split())


def _truncate(value: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    return value[:max_chars].strip()
