#!/usr/bin/env python3
"""Import the publication-approved binary/static assets from the private Article 04 checkout.

The public skeleton deliberately excludes feature-bearing research artifacts. This script
reads only an explicit allow-list from the frozen private source commit and writes it into
the public repository layout.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

SOURCE_COMMIT = "f0be2850ea0ef57e5630eced915908e0ab29594b"
PRIVATE_REPO_URL = "https://github.com/vlada22/grounded-temporal-intelligence"
PUBLIC_REPO_URL = "https://github.com/vlada22/grounded-temporal-intelligence-public"
ARTICLE_SOURCE = "docs/article-04/article.md"

ARTICLE_REPLACEMENTS = {
    "../../artifacts/article-04-confirmatory-result-v1/figure-cf-06-scene-fusion-cube.png": "assets/figures/figure-cf-06-scene-fusion-cube.png",
    PRIVATE_REPO_URL: PUBLIC_REPO_URL,
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

DIRECT_FILES = {
    "assets/article-04-source.mov": "assets/article-04-source.mov",
    "artifacts/article-04-publication-v1/figure-01-ftg-strict-alignment.png": (
        "assets/figures/figure-01-ftg-strict-alignment.png"
    ),
    "artifacts/article-04-fusion-representation-v2/figure-fusion-v2-leakage-diagnostic.png": (
        "assets/figures/figure-fusion-v2-leakage-diagnostic.png"
    ),
    "artifacts/article-04-multivideo-fusion-v1/figure-mv-03-pca-bottleneck.png": (
        "assets/figures/figure-mv-03-pca-bottleneck.png"
    ),
    "artifacts/article-04-confirmatory-result-v1/figure-cf-04-discovery-vs-confirmatory.png": (
        "assets/figures/figure-cf-04-discovery-vs-confirmatory.png"
    ),
    "artifacts/article-04-confirmatory-result-v1/figure-cf-05-class-delta.png": (
        "assets/figures/figure-cf-05-class-delta.png"
    ),
    "artifacts/article-04-confirmatory-result-v1/figure-cf-06-scene-fusion-cube.png": (
        "assets/figures/figure-cf-06-scene-fusion-cube.png"
    ),
}


def git_bytes(repo: Path, spec: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(repo), "show", spec],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.decode("utf-8", errors="replace").strip())
    return proc.stdout


def tracked_demo_files(repo: Path) -> list[str]:
    proc = subprocess.run(
        [
            "git",
            "-C",
            str(repo),
            "ls-tree",
            "-r",
            "--name-only",
            SOURCE_COMMIT,
            "demo",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip())
    return [
        line for line in proc.stdout.splitlines()
        if line and not line.endswith(".pyc") and line != "demo/README.md"
    ]


def write_from_git(repo: Path, public_root: Path, source: str, destination: str) -> None:
    data = git_bytes(repo, f"{SOURCE_COMMIT}:{source}")
    target = public_root / destination
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(f"imported {source} -> {destination}")


def patch_public_links(path: Path) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return
    updated = text.replace(PRIVATE_REPO_URL, PUBLIC_REPO_URL)
    if updated != text:
        path.write_text(updated, encoding="utf-8")


def import_article(repo: Path, public_root: Path) -> None:
    write_from_git(repo, public_root, ARTICLE_SOURCE, "ARTICLE.md")
    article_path = public_root / "ARTICLE.md"
    text = article_path.read_text(encoding="utf-8")
    for old, new in ARTICLE_REPLACEMENTS.items():
        text = text.replace(old, new)
    article_path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-repo", type=Path, required=True)
    parser.add_argument(
        "--public-repo",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()
    private_repo = args.private_repo.resolve()
    public_root = args.public_repo.resolve()

    if not (private_repo / ".git").exists():
        raise SystemExit(f"not a git checkout: {private_repo}")

    probe = subprocess.run(
        ["git", "-C", str(private_repo), "cat-file", "-e", f"{SOURCE_COMMIT}^{{commit}}"],
        check=False,
    )
    if probe.returncode != 0:
        raise SystemExit(f"private checkout does not contain source commit {SOURCE_COMMIT}")

    import_article(private_repo, public_root)

    for source, destination in DIRECT_FILES.items():
        write_from_git(private_repo, public_root, source, destination)

    for source in tracked_demo_files(private_repo):
        destination = source
        write_from_git(private_repo, public_root, source, destination)

    for path in (public_root / "demo").rglob("*"):
        if path.is_file():
            patch_public_links(path)

    print("public media/demo import complete")


if __name__ == "__main__":
    main()
