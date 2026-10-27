#!/bin/bash
# Real-shaped noisy build output: 120 "building module" progress lines,
# one real warning, and a success line.
for i in $(seq 1 120); do
  echo "building module $i/120"
done
echo "warning: unused import 'lodash' in src/utils.js"
echo "Build succeeded in 4.2s"
