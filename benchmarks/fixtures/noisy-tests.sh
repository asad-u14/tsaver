#!/bin/bash
# Real-shaped noisy test suite output: 80 PASS lines across 10 modules,
# one genuine failure, and a summary line.
for m in 1 2 3 4 5 6 7 8 9 10; do
  for t in 1 2 3 4 5 6 7 8; do
    echo "PASS tests/test_module$m.py::test_case$t"
  done
done
echo "FAILED tests/test_module5.py::test_case_special - AssertionError: expected 90, got 100"
echo "80 passed, 1 failed in 2.31s"
exit 1
