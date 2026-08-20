# Grounded Temporal Intelligence

Public, publication-focused distillation of Article 4 in the Grounded Visual Intelligence series.

> When does local motion evidence improve a camera-aware geometric state, and when does fusion make that state estimate worse?

- [Read **From Relationships to Motion**](ARTICLE.md)
- [Open the **Semantic Motion Explorer**](demo/)

The central measured result is deliberately narrower than a general fusion claim. Compression produced a strong held-out discovery gain, but that gain contracted sharply on a frozen independent confirmatory set. The residual benefit was class-specific: articulation improved substantially, translation slightly, while stationary classification degraded.

## Headline result

| condition | discovery macro F1 | frozen confirmatory macro F1 |
| --- | ---: | ---: |
| G — geometry | 0.668 | 0.673 |
| X — X3D bottleneck | 0.621 | 0.522 |
| M — compact fusion | **0.876** | **0.683** |

On the confirmatory set, M and G have identical accuracy and balanced accuracy. The pooled macro-F1 gain is only `+0.010`, with a clear class tradeoff:

- stationary F1: `0.653 -> 0.451` (`-0.202`)
- translating F1: `0.932 -> 0.966` (`+0.033`)
- articulating F1: `0.435 -> 0.634` (`+0.199`)

The measured finding is a small, class-dependent confirmatory gain. **Reliability-aware residual fusion** is the next hypothesis to test, not an established result.

## Public boundary

This repository intentionally contains only material needed for publication, inspection, and bounded reproducibility:

- canonical Article 04 text;
- publication figures used by the article;
- concise reviewed result summaries;
- the static Semantic Motion Explorer and its reviewed browser bundle;
- the publication-permitted synthetic source video;
- model identifiers and upstream license references;
- deterministic public-bundle validation.

It does **not** contain GPU return ZIPs, raw X3D `.f32` descriptors, dense VGGT arrays, checkpoints or model weights, gated/licensed model payloads, internal notebooks, experiment plans, research handoffs, iteration ledgers, or the private implementation workspace.

The originating private checkpoint is recorded in [`PUBLICATION_SOURCE.json`](PUBLICATION_SOURCE.json).

## Repository layout

```text
ARTICLE.md                     canonical Article 04 text
PUBLICATION_SOURCE.json        private-source checkpoint and public-boundary record
THIRD_PARTY.md                 model references and redistribution boundaries
assets/article-04-source.mov   publication-permitted synthetic source video
assets/figures/                article/publication figures
demo/                          static Semantic Motion Explorer
results/                       concise public result summaries and aggregate metrics
scripts/validate_public_bundle.py
```

## Validate

Requires Python 3.11 or newer.

```bash
python scripts/validate_public_bundle.py
```

Serve the explorer locally with:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/demo/`.

## Methodology boundaries

- The original-source T/G diagnostic uses two frozen AI-assisted source reviews, not independent human validation.
- Random overlapping-window splits are shown only as a leakage diagnostic and are not performance evidence.
- The two-component bottleneck is an Article 04 discovery result, not a universal optimum.
- The frozen confirmatory result is weak/mixed confirmation, not evidence that compact fusion broadly outperforms geometry.
- The controlled synthetic discovery and confirmatory scenes are bounded experiments, not a general computer-vision benchmark.
- Artifact hash integrity does not by itself establish semantic experiment validity.
