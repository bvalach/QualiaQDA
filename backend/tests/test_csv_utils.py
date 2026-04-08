from __future__ import annotations

import unittest

from qualia.core.csv_utils import sanitize_csv_cell, sanitize_csv_row


class CsvUtilsTests(unittest.TestCase):
    def test_sanitize_csv_cell_prefixes_formula_like_values(self) -> None:
        for value in ("=SUM(1,1)", "+cmd", "-10+20", "@SUM(A1:A2)"):
            self.assertEqual(sanitize_csv_cell(value), f"'{value}")

    def test_sanitize_csv_cell_prefixes_when_formula_is_after_whitespace(self) -> None:
        value = " \t=HYPERLINK(\"http://evil.test\", \"click\")"
        self.assertEqual(sanitize_csv_cell(value), f"'{value}")

    def test_sanitize_csv_row_leaves_safe_values_untouched(self) -> None:
        row = ["texto normal", 42, "", None]
        self.assertEqual(sanitize_csv_row(row), row)


if __name__ == "__main__":
    unittest.main()
