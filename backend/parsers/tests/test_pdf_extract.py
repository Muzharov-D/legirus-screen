"""Smoke tests for parsers/lib/pdf_extract.py."""
import os
import sys

import pytest

PARSERS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PARSERS_DIR not in sys.path:
    sys.path.insert(0, PARSERS_DIR)

from lib.pdf_extract import (
    extract_page_texts,
    extract_page_text,
    extract_text_blocks,
    parse_value_with_pct,
    parse_number,
    parse_ru_number,
    split_row_tokens,
)


PDF_2010 = os.path.join(PARSERS_DIR, "sportvisor_legirus2010_match001.pdf")


def test_parse_value_with_pct():
    assert parse_value_with_pct("13 (69%)") == {"value": 13, "pct": 69}
    assert parse_value_with_pct("8.4") == {"value": 8.4, "pct": None}
    assert parse_value_with_pct("0") == {"value": 0, "pct": None}
    assert parse_value_with_pct("") == {"value": 0, "pct": None}


def test_parse_number():
    assert parse_number("11778.00") == 11778.0
    assert parse_number("0") == 0
    assert parse_number("") is None
    assert parse_number("1234,5") == 1234.5


def test_parse_ru_number():
    assert parse_ru_number("1 234,5") == 1234.5
    assert parse_ru_number("1234") == 1234


def test_split_row_tokens():
    tokens = split_row_tokens("1 1 3 (0%) 2 (0%) 8 (38%) 5 (40%)")
    assert tokens[0] == "1"
    assert tokens[2] == "3 (0%)"
    assert tokens[3] == "2 (0%)"


def test_extract_page_text_2010_has_overall_anchor():
    text = extract_page_text(PDF_2010, 2)
    assert "Overall" in text
    # Players appear with last-name + initial
    assert "Турапин" in text


def test_extract_page_texts_2010_full_count():
    pages = extract_page_texts(PDF_2010)
    assert len(pages) == 35


def test_extract_text_blocks_returns_words():
    blocks = extract_text_blocks(PDF_2010)
    assert blocks
    sample = blocks[0]
    for k in ("page", "x0", "y0", "x1", "y1", "text"):
        assert k in sample
