const video = document.querySelector("#source-video");
const maskCanvas = document.querySelector("#mask-canvas");
const maskContext = maskCanvas.getContext("2d");
const worldCanvas = document.querySelector("#world-canvas");
const worldContext = worldCanvas.getContext("2d");
const slider = document.querySelector("#time-slider");
const timeOutput = document.querySelector("#time-output");
const playButton = document.querySelector("#play-button");
const loadError = document.querySelector("#load-error");
const failureOverlay = document.querySelector("#failure-overlay");

const acceptedIdentityStates = new Set([
  "accepted",
  "accepted-until-exit",
  "accepted-with-support-instability",
]);

let scene;
let currentTime = 0;
let selectedTrackId = null;
let timelineMode = "model";
let currentShotId = null;
let masksByFrame = new Map();
let playing = false;
let videoObjectUrl = null;

function shotAt(time) {
  return scene.shots.find((shot) => (
    time >= shot.startTimestampSeconds && time < shot.endTimestampSecondsExclusive
  )) || null;
}

function frameAt(time) {
  return Math.min(scene.source.frameCount - 1, Math.max(0, Math.floor(time * scene.source.fps)));
}

function identityAt(entity, frameIndex) {
  return entity.identityAssessments.find((assessment) => (
    frameIndex >= assessment.frameRange[0] && frameIndex < assessment.frameRange[1]
  )) || null;
}

function isAcceptedIdentity(entity, frameIndex) {
  const assessment = identityAt(entity, frameIndex);
  return assessment && acceptedIdentityStates.has(assessment.assessment);
}

function interpolate(samples, time, field) {
  if (!samples.length) return null;
  if (time <= samples[0].timestampSeconds) return { ...samples[0] };
  if (time >= samples.at(-1).timestampSeconds) return { ...samples.at(-1) };
  const rightIndex = samples.findIndex((sample) => sample.timestampSeconds >= time);
  const left = samples[rightIndex - 1];
  const right = samples[rightIndex];
  const ratio = (time - left.timestampSeconds) / (right.timestampSeconds - left.timestampSeconds);
  return {
    ...left,
    [field]: left[field].map((component, index) => (
      component + (right[field][index] - component) * ratio
    )),
  };
}

function supportedInterpolation(samples, time, field) {
  if (!samples.length) return null;
  if (samples.length === 1) {
    return Math.abs(time - samples[0].timestampSeconds) <= (0.5 / scene.source.fps)
      ? { ...samples[0] }
      : null;
  }
  const gaps = samples.slice(1).map((sample, index) => (
    sample.timestampSeconds - samples[index].timestampSeconds
  )).sort((left, right) => left - right);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  const supportRadius = medianGap / 2;
  if (
    time < samples[0].timestampSeconds - supportRadius
    || time > samples.at(-1).timestampSeconds + supportRadius
  ) return null;
  return interpolate(samples, time, field);
}

function activeEntities(shot) {
  if (!shot) return [];
  return scene.entities.filter((entity) => entity.shotId === shot.shotId);
}

function selectedEntity() {
  return scene.entities.find((entity) => entity.trackId === selectedTrackId) || null;
}

function syncSelection(shot) {
  const entities = activeEntities(shot);
  if (!entities.some((entity) => entity.trackId === selectedTrackId)) {
    selectedTrackId = entities[0]?.trackId || null;
  }
  if (currentShotId !== shot?.shotId) {
    currentShotId = shot?.shotId || null;
    buildEntityButtons();
    buildTimeline();
  }
}

function decodeMaskPreview(encoded) {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function maskBit(bytes, index) {
  return (bytes[Math.floor(index / 8)] & (1 << (7 - (index % 8)))) !== 0;
}

function drawMaskOverlay(frameIndex, shot) {
  maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (!shot) return;
  const frameMasks = masksByFrame.get(frameIndex) || [];
  const activeTrackIds = new Set(activeEntities(shot).map((entity) => entity.trackId));
  const previewWidth = scene.maskPreviews.width;
  const previewHeight = scene.maskPreviews.height;
  const cellWidth = maskCanvas.width / previewWidth;
  const cellHeight = maskCanvas.height / previewHeight;

  for (const mask of frameMasks) {
    if (!activeTrackIds.has(mask.trackId)) continue;
    if (!mask.acceptedIdentity && !failureOverlay.checked) continue;
    const entity = scene.entities.find((candidate) => candidate.trackId === mask.trackId);
    const selected = mask.trackId === selectedTrackId;
    const rejected = !mask.acceptedIdentity;
    const bytes = decodeMaskPreview(mask.maskPreviewBase64);
    maskContext.fillStyle = rejected
      ? "rgba(239, 111, 97, .44)"
      : colourWithAlpha(entity.colour, selected ? 0.48 : 0.25);
    for (let y = 0; y < previewHeight; y += 1) {
      for (let x = 0; x < previewWidth; x += 1) {
        if (maskBit(bytes, y * previewWidth + x)) {
          maskContext.fillRect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5);
        }
      }
    }
    const [x, y, width, height] = mask.bboxNormalizedXywh;
    const boxX = x * maskCanvas.width;
    const boxY = y * maskCanvas.height;
    const boxWidth = width * maskCanvas.width;
    const boxHeight = height * maskCanvas.height;
    maskContext.strokeStyle = rejected ? "#ef6f61" : entity.colour;
    maskContext.lineWidth = selected || rejected ? 4 : 2;
    maskContext.setLineDash(rejected ? [12, 8] : []);
    maskContext.strokeRect(boxX, boxY, boxWidth, boxHeight);
    maskContext.setLineDash([]);
    maskContext.fillStyle = "rgba(7, 9, 12, .86)";
    const label = rejected
      ? `${entity.semanticLabel} · REJECTED ${mask.identityAssessment}`
      : entity.semanticLabel;
    maskContext.font = "600 22px Inter, sans-serif";
    const labelWidth = maskContext.measureText(label).width + 18;
    maskContext.fillRect(boxX, Math.max(0, boxY - 31), labelWidth, 29);
    maskContext.fillStyle = rejected ? "#ffaca2" : entity.colour;
    maskContext.fillText(label, boxX + 9, Math.max(21, boxY - 9));
  }
}

function colourWithAlpha(hex, alpha) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function worldProjector(shot, entities) {
  const positions = entities.flatMap((entity) => (
    entity.observations.map((observation) => observation.centroidWorld)
  ));
  positions.push(...shot.cameraTrack.map((camera) => camera.positionWorld));
  const xs = positions.map((position) => position[0]);
  const zs = positions.map((position) => position[2]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minZ = Math.min(...zs);
  let maxZ = Math.max(...zs);
  const xPadding = Math.max((maxX - minX) * 0.18, 0.08);
  const zPadding = Math.max((maxZ - minZ) * 0.18, 0.08);
  minX -= xPadding;
  maxX += xPadding;
  minZ -= zPadding;
  maxZ += zPadding;
  return (position) => [
    44 + ((position[0] - minX) / Math.max(maxX - minX, 0.001)) * (worldCanvas.width - 88),
    worldCanvas.height - 42
      - ((position[2] - minZ) / Math.max(maxZ - minZ, 0.001)) * (worldCanvas.height - 86),
  ];
}

function drawWorld(shot, frameIndex) {
  worldContext.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  const gradient = worldContext.createRadialGradient(
    worldCanvas.width / 2, worldCanvas.height / 2, 20,
    worldCanvas.width / 2, worldCanvas.height / 2, worldCanvas.width / 1.4,
  );
  gradient.addColorStop(0, "#1b2029");
  gradient.addColorStop(1, "#0f1116");
  worldContext.fillStyle = gradient;
  worldContext.fillRect(0, 0, worldCanvas.width, worldCanvas.height);
  if (!shot) {
    worldContext.fillStyle = "rgba(243, 241, 234, .6)";
    worldContext.font = "16px Inter, sans-serif";
    worldContext.textAlign = "center";
    worldContext.fillText("No shared world frame across this editorial transition", worldCanvas.width / 2, worldCanvas.height / 2);
    worldContext.textAlign = "left";
    return;
  }

  const entities = activeEntities(shot);
  const project = worldProjector(shot, entities);
  worldContext.strokeStyle = "rgba(255, 255, 255, .07)";
  worldContext.lineWidth = 1;
  for (let index = 1; index < 8; index += 1) {
    const x = index * worldCanvas.width / 8;
    const y = index * worldCanvas.height / 8;
    worldContext.beginPath();
    worldContext.moveTo(x, 0);
    worldContext.lineTo(x, worldCanvas.height);
    worldContext.stroke();
    worldContext.beginPath();
    worldContext.moveTo(0, y);
    worldContext.lineTo(worldCanvas.width, y);
    worldContext.stroke();
  }

  for (const entity of entities) {
    worldContext.beginPath();
    entity.observations.forEach((observation, index) => {
      const point = project(observation.centroidWorld);
      if (index === 0) worldContext.moveTo(...point);
      else worldContext.lineTo(...point);
    });
    worldContext.strokeStyle = colourWithAlpha(
      entity.colour,
      entity.trackId === selectedTrackId ? 0.9 : 0.28,
    );
    worldContext.lineWidth = entity.trackId === selectedTrackId ? 3 : 1.5;
    worldContext.stroke();

    if (!isAcceptedIdentity(entity, frameIndex)) continue;
    const observation = supportedInterpolation(
      entity.observations,
      currentTime,
      "centroidWorld",
    );
    if (!observation) continue;
    const [x, y] = project(observation.centroidWorld);
    worldContext.beginPath();
    worldContext.fillStyle = entity.colour;
    worldContext.arc(x, y, entity.trackId === selectedTrackId ? 8 : 5, 0, Math.PI * 2);
    worldContext.fill();
    worldContext.fillStyle = "rgba(243, 241, 234, .88)";
    worldContext.font = entity.trackId === selectedTrackId
      ? "600 13px Inter, sans-serif"
      : "11px Inter, sans-serif";
    worldContext.fillText(entity.semanticLabel, x + 11, y - 8);
  }

  const camera = interpolate(shot.cameraTrack, currentTime, "positionWorld");
  const [cameraX, cameraY] = project(camera.positionWorld);
  worldContext.strokeStyle = "rgba(243, 241, 234, .85)";
  worldContext.lineWidth = 2;
  worldContext.strokeRect(cameraX - 7, cameraY - 5, 14, 10);
  worldContext.fillStyle = "rgba(243, 241, 234, .48)";
  worldContext.font = "11px ui-monospace, monospace";
  worldContext.fillText("X / Z PROJECTION", 17, 24);
  worldContext.fillText(`${shot.shotId.toUpperCase()} · MODEL-RELATIVE`, 17, worldCanvas.height - 16);
}

function intervalIncludesTrack(interval, trackId) {
  return interval.actorTrackIds?.includes(trackId)
    || interval.subjectTrackId === trackId
    || interval.objectTrackId === trackId
    || interval.scope?.includes(trackId);
}

function activeStates(trackId) {
  if (!trackId) return [];
  const events = timelineMode === "model"
    ? scene.model.events
    : scene.sourceReference.events;
  return events.filter((event) => (
    event.actorTrackIds.includes(trackId)
    && currentTime >= event.startSeconds
    && currentTime < event.endSeconds
  ));
}

function updateInspector(frameIndex, shot) {
  const entity = selectedEntity();
  const fields = {
    label: document.querySelector("#entity-label"),
    track: document.querySelector("#entity-track"),
    shot: document.querySelector("#entity-shot"),
    identity: document.querySelector("#identity-state"),
    position: document.querySelector("#entity-position"),
    support: document.querySelector("#point-support"),
    state: document.querySelector("#active-state"),
  };
  if (!entity || !shot) {
    fields.label.textContent = "No analytic shot";
    fields.track.textContent = "—";
    fields.shot.textContent = "excluded transition";
    fields.identity.textContent = "not evaluated";
    fields.position.textContent = "—";
    fields.support.textContent = "—";
    fields.state.textContent = "uncertain";
    return;
  }
  const assessment = identityAt(entity, frameIndex);
  const accepted = isAcceptedIdentity(entity, frameIndex);
  const observation = accepted
    ? supportedInterpolation(entity.observations, currentTime, "centroidWorld")
    : null;
  fields.label.textContent = entity.semanticLabel;
  fields.track.textContent = entity.trackId;
  fields.shot.textContent = entity.shotId;
  fields.identity.textContent = assessment?.assessment || "not evaluated";
  fields.identity.className = accepted ? "state-ok" : "state-rejected";
  fields.position.textContent = observation
    ? `${observation.centroidWorld.map((value) => value.toFixed(3)).join(", ")} relative`
    : accepted
      ? "no sampled geometry at this time"
      : "excluded from downstream geometry";
  const coverage = observation?.pointSupport?.coverageFraction;
  const retained = observation?.pointSupport?.retainedPointCount;
  fields.support.textContent = Number.isFinite(coverage)
    ? `${(coverage * 100).toFixed(0)}% · ${retained.toLocaleString()} points`
    : "unavailable";
  fields.state.textContent = activeStates(entity.trackId).map((event) => event.type).join(", ")
    || (accepted ? "observed" : "uncertain");
  document.querySelectorAll(".entity-buttons button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.trackId === selectedTrackId));
  });
}

function intervalLabel(interval) {
  if (interval.label) return interval.label;
  if (interval.predicate) {
    return `${shortTrack(interval.subjectTrackId)} ${interval.predicate} ${shortTrack(interval.objectTrackId)}`;
  }
  if (interval.reason) return interval.reason.replaceAll("-", " ");
  return interval.type || "interval";
}

function shortTrack(trackId) {
  return scene.entities.find((entity) => entity.trackId === trackId)?.semanticLabel || trackId;
}

function timelineIntervals() {
  const entity = selectedEntity();
  if (!entity) return [];
  if (timelineMode === "reference") {
    return [
      ...scene.sourceReference.events.map((item) => ({ ...item, rowType: "event" })),
      ...scene.sourceReference.relations.map((item) => ({ ...item, rowType: "relation" })),
    ].filter((item) => item.shotId === entity.shotId && intervalIncludesTrack(item, entity.trackId));
  }
  return [
    ...scene.model.events.map((item) => ({ ...item, rowType: "event" })),
    ...scene.model.relations.map((item) => ({ ...item, rowType: "relation" })),
    ...scene.model.uncertaintyIntervals.map((item) => ({ ...item, rowType: "uncertainty" })),
  ].filter((item) => item.shotId === entity.shotId && intervalIncludesTrack(item, entity.trackId));
}

function buildTimeline() {
  if (!scene) return;
  const timeline = document.querySelector("#timeline");
  timeline.replaceChildren();
  const axis = document.createElement("div");
  axis.className = "timeline-axis";
  for (let time = 0; time <= scene.source.durationSeconds; time += 5) {
    const marker = document.createElement("span");
    marker.style.left = `${time / scene.source.durationSeconds * 100}%`;
    marker.textContent = `${time}s`;
    axis.append(marker);
  }
  timeline.append(axis);
  const intervals = timelineIntervals();
  if (!intervals.length) {
    const empty = document.createElement("p");
    empty.className = "timeline-empty";
    empty.textContent = timelineMode === "reference"
      ? "The source reviewer abstained from additional intervals for this track."
      : "No model interval was emitted for this track.";
    timeline.append(empty);
  }
  for (const interval of intervals) {
    const row = document.createElement("div");
    row.className = "timeline-row";
    const label = document.createElement("span");
    label.className = "timeline-label";
    label.textContent = intervalLabel(interval);
    label.title = label.textContent;
    const track = document.createElement("div");
    track.className = "timeline-track";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-interval ${interval.rowType}`;
    button.style.left = `${interval.startSeconds / scene.source.durationSeconds * 100}%`;
    button.style.width = `${Math.max((interval.endSeconds - interval.startSeconds) / scene.source.durationSeconds * 100, 0.8)}%`;
    const confidence = interval.confidence === null || interval.confidence === undefined
      ? "uncalibrated rule output"
      : `confidence ${interval.confidence}`;
    button.title = `${label.textContent} · ${interval.startSeconds.toFixed(3)}–${interval.endSeconds.toFixed(3)} s · ${confidence}`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => seek(interval.startSeconds));
    track.append(button);
    row.append(label, track);
    timeline.append(row);
  }
  document.querySelector("#timeline-caption").textContent = timelineMode === "model"
    ? "Deterministic G-condition hypotheses. Null confidence is intentional: thresholds are not probabilities."
    : "Directly observable intervals from one AI-assisted source review; not independent human ground truth.";
  updateTimelinePlayhead();
}

function updateTimelinePlayhead() {
  const percentage = currentTime / scene.source.durationSeconds * 100;
  document.querySelectorAll(".timeline-track").forEach((track) => {
    track.style.setProperty("--playhead", `${percentage}%`);
  });
}

function buildEntityButtons() {
  if (!scene) return;
  const host = document.querySelector("#entity-buttons");
  host.replaceChildren();
  const shot = shotAt(currentTime);
  for (const entity of activeEntities(shot)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.trackId = entity.trackId;
    button.style.background = entity.colour;
    button.setAttribute("aria-label", `Select ${entity.semanticLabel}`);
    button.setAttribute("aria-pressed", String(entity.trackId === selectedTrackId));
    button.title = entity.semanticLabel;
    button.addEventListener("click", () => {
      selectedTrackId = entity.trackId;
      buildTimeline();
      render();
    });
    host.append(button);
  }
}

function buildSummary() {
  const values = [
    [scene.counts.shots, "shot-local worlds"],
    [scene.counts.tracks, "reviewed tracks"],
    [scene.counts.reviewedObservations, "3D observations"],
    [scene.counts.modelEvents, "model event intervals"],
    [scene.counts.uncertaintyIntervals, "uncertainty intervals"],
  ];
  const host = document.querySelector("#summary-strip");
  values.forEach(([value, label]) => {
    const item = document.createElement("div");
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    host.append(item);
  });
}

async function loadSourceVideo() {
  const response = await fetch(scene.source.videoUri);
  if (!response.ok) throw new Error(`source video returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const blob = new Blob([bytes], { type: scene.source.browserBlobMimeType });
  videoObjectUrl = URL.createObjectURL(blob);
  video.src = videoObjectUrl;
}

function render() {
  const shot = shotAt(currentTime);
  const frameIndex = frameAt(currentTime);
  syncSelection(shot);
  slider.value = String(currentTime);
  const minutes = Math.floor(currentTime / 60).toString().padStart(2, "0");
  const seconds = (currentTime % 60).toFixed(2).padStart(5, "0");
  timeOutput.textContent = `${minutes}:${seconds}`;
  document.querySelector("#shot-status").textContent = shot?.shotId || "excluded transition";
  document.querySelector("#shot-status").classList.toggle("status-excluded", !shot);
  document.querySelector("#frame-status").textContent = `frame ${String(frameIndex).padStart(3, "0")}`;
  document.querySelector("#video-empty-state").hidden = Boolean(shot);
  drawMaskOverlay(frameIndex, shot);
  drawWorld(shot, frameIndex);
  updateInspector(frameIndex, shot);
  updateTimelinePlayhead();
}

function seek(time) {
  currentTime = Math.max(0, Math.min(scene.source.durationSeconds - 0.001, time));
  video.currentTime = currentTime;
  if (playing) {
    video.pause();
    playing = false;
    updatePlayButton();
  }
  render();
}

function updatePlayButton() {
  playButton.innerHTML = `<span aria-hidden="true">${playing ? "❚❚" : "▶"}</span>`;
  playButton.setAttribute("aria-label", playing ? "Pause sequence" : "Play sequence");
}

function animate() {
  if (!playing) return;
  currentTime = video.currentTime;
  render();
  requestAnimationFrame(animate);
}

function bindInteractions() {
  slider.max = String(scene.source.durationSeconds);
  slider.addEventListener("input", () => seek(Number(slider.value)));
  playButton.addEventListener("click", async () => {
    if (playing) {
      video.pause();
      playing = false;
    } else {
      if (video.currentTime >= scene.source.durationSeconds - 0.05) video.currentTime = 0;
      try {
        await video.play();
        playing = true;
        requestAnimationFrame(animate);
      } catch (error) {
        loadError.hidden = false;
        loadError.textContent = `The browser could not start video playback: ${error.message}`;
      }
    }
    updatePlayButton();
  });
  video.addEventListener("ended", () => {
    playing = false;
    currentTime = scene.source.durationSeconds - 0.001;
    updatePlayButton();
    render();
  });
  video.addEventListener("seeked", () => {
    currentTime = video.currentTime;
    render();
  });
  failureOverlay.addEventListener("change", render);
  document.querySelector("#failure-jump").addEventListener("click", () => {
    failureOverlay.checked = true;
    seek(5.5);
  });
  document.querySelectorAll("#timeline-mode button").forEach((button) => {
    button.addEventListener("click", () => {
      timelineMode = button.dataset.mode;
      document.querySelectorAll("#timeline-mode button").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
      buildTimeline();
      render();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, button, a, video")) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      seek(currentTime + (event.key === "ArrowRight" ? 0.25 : -0.25));
    }
    if (event.key === " ") {
      event.preventDefault();
      playButton.click();
    }
  });
  const toggle = document.querySelector("#provenance-toggle");
  const list = document.querySelector("#provenance-list");
  scene.provenance.forEach((item) => {
    const entry = document.createElement("li");
    entry.textContent = item;
    list.append(entry);
  });
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.querySelector("span").textContent = expanded ? "+" : "−";
    list.hidden = expanded;
  });
}

async function start() {
  try {
    const response = await fetch("./data/scene.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`scene artifact returned HTTP ${response.status}`);
    scene = await response.json();
    for (const mask of scene.maskPreviews.observations) {
      if (!masksByFrame.has(mask.frameIndex)) masksByFrame.set(mask.frameIndex, []);
      masksByFrame.get(mask.frameIndex).push(mask);
    }
    await loadSourceVideo();
    selectedTrackId = scene.entities[0].trackId;
    buildSummary();
    buildEntityButtons();
    buildTimeline();
    bindInteractions();
    render();
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `The reviewed explorer could not be loaded: ${error.message}. Serve the repository through a local web server.`;
    playButton.disabled = true;
    slider.disabled = true;
  }
}

start();
