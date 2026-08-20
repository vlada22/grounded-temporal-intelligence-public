# Semantic Motion Explorer

This directory is a self-contained static browser application. It reads a reviewed portable semantic 4D derivative and performs no live model inference.

## Public bundle

The explorer exposes the publication-facing review surface only:

- six shot-local camera/geometry worlds;
- reviewed entity tracks and sparse semantic 3D observations;
- deterministic temporal hypotheses and source-review intervals;
- browser-safe 64×36 mask previews;
- the reviewed identity-switch failure case;
- the publication-permitted synthetic source video.

Full-resolution SAM 2 output, dense VGGT arrays, raw X3D descriptors, model weights, credentials, and GPU execution artifacts remain outside the public repository.

The source labels embedded in the explorer come from an AI-assisted review and are not represented as independent human ground truth.

## Run locally

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/demo/`.

The browser performs display interpolation and lightweight visualization only. It does not execute SAM 2, VGGT, X3D-S, or any other research model.
