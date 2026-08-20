#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

SOURCE_COMMIT = "f0be2850ea0ef57e5630eced915908e0ab29594b"
VIDEO_SHA256 = "895055643b5797b139ab05baecd7f265fc698bdc11bc9cce690b760c1cee174a"
PRIVATE_URL = "https://github.com/vlada22/grounded-temporal-intelligence"
PUBLIC_URL = "https://github.com/vlada22/grounded-temporal-intelligence-public"

ARTICLE_REPLACEMENTS = {
    "../../artifacts/article-04-confirmatory-result-v1/figure-cf-06-scene-fusion-cube.png": "assets/figures/figure-cf-06-scene-fusion-cube.png",
    PRIVATE_URL: PUBLIC_URL,
    "../../demo/README.md": "demo/README.md",
    "../../artifacts/article-04-fusion-representation-v2/README.md": "results/representation/README.md",
    "../../artifacts/article-04-multivideo-fusion-v1/README.md": "results/discovery/README.md",
    "../../artifacts/article-04-confirmatory-result-v1/README.md": "results/confirmatory/README.md",
    "../../artifacts/article-04-publication-v1/figure-01-ftg-strict-alignment.png": "assets/figures/figure-01-ftg-strict-alignment.png",
    "../../artifacts/article-04-fusion-representation-v2/figure-fusion-v2-leakage-diagnostic.png": "assets/figures/figure-fusion-v2-leakage-diagnostic.png",
    "../../artifacts/article-04-multivideo-fusion-v1/figure-mv-03-pca-bottleneck.png": "assets/figures/figure-mv-03-pca-bottleneck.png",
    "../../artifacts/article-04-confirmatory-result-v1/figure-cf-04-discovery-vs-confirmatory.png": "assets/figures/figure-cf-04-discovery-vs-confirmatory.png",
    "../../artifacts/article-04-confirmatory-result-v1/figure-cf-05-class-delta.png": "assets/figures/figure-cf-05-class-delta.png",
}

REQUIRED = [
    "ARTICLE.md",
    "README.md",
    "PUBLICATION_SOURCE.json",
    "THIRD_PARTY.md",
    "index.html",
    "assets/article-04-source.mov",
    "assets/figures/figure-01-ftg-strict-alignment.png",
    "assets/figures/figure-fusion-v2-leakage-diagnostic.png",
    "assets/figures/figure-mv-03-pca-bottleneck.png",
    "assets/figures/figure-cf-04-discovery-vs-confirmatory.png",
    "assets/figures/figure-cf-05-class-delta.png",
    "assets/figures/figure-cf-06-scene-fusion-cube.png",
    "demo/index.html",
    "demo/app.js",
    "demo/styles.css",
    "demo/data/scene.json",
    "results/representation/README.md",
    "results/discovery/README.md",
    "results/confirmatory/README.md",
]

FORBIDDEN_TOP_LEVEL = {
    "notebooks",
    "experiments",
    "src",
    "schemas",
    "tests",
}

FORBIDDEN_SUFFIXES = {".f32", ".pt", ".pth", ".ckpt", ".safetensors"}
FORBIDDEN_FILE_NAMES = {".DS_Store"}
FORBIDDEN_DIR_NAMES = {"__pycache__", ".pytest_cache", ".ruff_cache", ".venv"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_text(repo: Path, spec: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), "show", spec],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace"))
    return proc.stdout.decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-repo", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    failures: list[str] = []

    for rel in REQUIRED:
        if not (root / rel).is_file():
            failures.append(f"missing required public file: {rel}")

    for name in FORBIDDEN_TOP_LEVEL:
        if (root / name).exists():
            failures.append(f"private/research top-level path must not be public: {name}/")

    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if any(part in FORBIDDEN_DIR_NAMES for part in relative.parts):
            failures.append(f"cache/environment path must not be public: {relative}")
            continue
        if path.is_file() and path.name in FORBIDDEN_FILE_NAMES:
            failures.append(f"system metadata must not be public: {relative}")
        if path.is_file() and path.suffix.lower() in FORBIDDEN_SUFFIXES:
            failures.append(f"feature/model payload must not be public: {relative}")
        if path.is_file() and path.suffix.lower() == ".zip":
            failures.append(f"GPU/research ZIP must not be public: {relative}")
        if path.is_file() and path.suffix.lower() == ".svg":
            failures.append(f"SVG publication asset must be converted to PNG: {relative}")

    article = (root / "ARTICLE.md").read_text(encoding="utf-8")
    if f"]({PRIVATE_URL})" in article:
        failures.append("ARTICLE.md still links to the private repository")
    if "../../artifacts/" in article or "../../demo/" in article:
        failures.append("ARTICLE.md still contains private-layout relative links")

    publication_source = json.loads((root / "PUBLICATION_SOURCE.json").read_text(encoding="utf-8"))
    if publication_source.get("private_source_commit") != SOURCE_COMMIT:
        failures.append("PUBLICATION_SOURCE.json source commit mismatch")

    video = root / "assets/article-04-source.mov"
    if video.is_file() and sha256(video) != VIDEO_SHA256:
        failures.append("source video SHA-256 does not match the frozen publication manifest")

    demo_index = root / "demo/index.html"
    if demo_index.is_file():
        demo_text = demo_index.read_text(encoding="utf-8")
        if f'href="{PRIVATE_URL}"' in demo_text:
            failures.append("demo/index.html still links to the private repository")

    if args.private_repo:
        private_repo = args.private_repo.resolve()
        try:
            source = git_text(private_repo, f"{SOURCE_COMMIT}:docs/article-04/article.md")
            expected = source
            for old, new in ARTICLE_REPLACEMENTS.items():
                expected = expected.replace(old, new)
            if article != expected:
                failures.append(
                    "ARTICLE.md is not verbatim source text plus the allowed public link/path replacements"
                )
        except Exception as exc:  # pragma: no cover - command-line diagnostic
            failures.append(f"could not verify source article from private repo: {exc}")

    if failures:
        print("PUBLIC BUNDLE VALIDATION FAILED", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("PUBLIC BUNDLE VALIDATION PASSED")
    print(f"source commit: {SOURCE_COMMIT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
