# Third-party models and redistribution boundary

Article 04 uses pretrained third-party perception models. This public repository records their role and upstream references but does **not** redistribute model weights, checkpoints, gated artifacts, or raw learned feature tensors.

## SAM 2

- Role: persistent video masks / object support.
- Upstream: https://github.com/facebookresearch/sam2
- Public bundle: reviewed mask previews and aggregate browser artifacts only; no SAM 2 weights are included.

## VGGT

- Role: camera-aware geometry, depth/point maps, tracks, and model-world state used by the geometry branch.
- Upstream model: https://huggingface.co/facebook/VGGT-1B
- Upstream code: https://github.com/facebookresearch/vggt
- Public bundle: publication figures and reviewed/aggregate geometry-derived browser artifacts only; no VGGT model weights or dense learned arrays are included.
- The upstream model/code terms apply independently of this repository. Review the upstream license/model card before running or redistributing VGGT.

## X3D-S / PyTorchVideo

- Role: object-centric local spatiotemporal representation used in the X and M branches.
- Upstream hub entry: https://pytorch.org/hub/facebookresearch_pytorchvideo_x3d/
- Upstream code: https://github.com/facebookresearch/pytorchvideo
- Public bundle: aggregate metrics and publication figures only; no raw 2048-D descriptor arrays or pretrained checkpoint payloads are included.

## Media

The Article 04 publication-facing video and scene imagery were generated synthetically for this research/article workflow. They are included as publication assets, not as third-party datasets.

## General rule

Upstream model licenses and terms remain controlling for the corresponding third-party components. Nothing in this repository grants additional rights to redistribute those model weights or gated/licensed payloads.
