#!/usr/bin/env python3
"""Fail CI when PostgreSQL integration coverage silently disappears."""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

reports = sorted(Path(sys.argv[1]).glob("TEST-*.xml"))
if not any("IntegrationTest" in report.name for report in reports):
    sys.exit("No integration test reports found")
executed = 0
for report in reports:
    suite = ET.parse(report).getroot()
    counts = {key: int(suite.get(key, "0")) for key in ("tests", "skipped", "errors", "failures")}
    if counts["tests"] == 0 or any(counts[key] for key in ("skipped", "errors", "failures")):
        sys.exit(f"Integration coverage incomplete: {report.name}: {counts}")
    executed += counts["tests"]
print(f"Verified {executed} executed tests across {len(reports)} suites")
