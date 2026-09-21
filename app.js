"use strict";

const TAU = Math.PI * 2;
const WORLD_LIMIT = 3.2;
const COLORS = ["#4bd8c5", "#ffca76", "#ff7e88", "#72a7ff", "#c68cff", "#77df78", "#ff9866", "#67d3f3"];
const RESOLUTIONS = {
  fast: { angles: 72, detectors: 140 },
  standard: { angles: 120, detectors: 220 },
  fine: { angles: 180, detectors: 320 }
};

const defaultEllipses = () => [
  { id: 1, name: "橢圓 1", visible: true, cx: -0.82, cy: 0.34, a: 1.22, b: 0.63, angle: 0.42, density: 1.0, color: COLORS[0] },
  { id: 2, name: "橢圓 2", visible: true, cx: 0.76, cy: -0.23, a: 1.04, b: 0.48, angle: -0.65, density: 0.8, color: COLORS[1] },
  { id: 3, name: "橢圓 3", visible: true, cx: 0.30, cy: 0.96, a: 0.58, b: 0.34, angle: 0.08, density: 1.25, color: COLORS[2] }
];

const state = {
  mode: "binary",
  ellipses: defaultEllipses(),
  selectedId: 1,
  resolution: "standard",
  nextId: 4,
  drag: null,
  renderQueued: false
};

const elements = {
  objectCanvas: document.querySelector("#objectCanvas"),
  sinogramCanvas: document.querySelector("#sinogramCanvas"),
  ellipseList: document.querySelector("#ellipseList"),
  parameterControls: document.querySelector("#parameterControls"),
  parameterSection: document.querySelector("#parameterSection"),
  selectedTitle: document.querySelector("#selectedTitle"),
  parametricEquation: document.querySelector("#parametricEquation"),
  implicitEquation: document.querySelector("#implicitEquation"),
  modeNote: document.querySelector("#modeNote"),
  computeStatus: document.querySelector("#computeStatus"),
  maxValueLabel: document.querySelector("#maxValueLabel"),
  dataSummary: document.querySelector("#dataSummary"),
  addEllipseButton: document.querySelector("#addEllipseButton"),
  deleteEllipseButton: document.querySelector("#deleteEllipseButton"),
  resetButton: document.querySelector("#resetButton"),
  resolutionSelect: document.querySelector("#resolutionSelect")
};

function selectedEllipse() {
  return state.ellipses.find((ellipse) => ellipse.id === state.selectedId) || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatNumber(value, digits = 2) {
  const clean = Math.abs(value) < 0.0005 ? 0 : value;
  return clean.toFixed(digits).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function angleDegrees(angle) {
  let degrees = angle * 180 / Math.PI;
  while (degrees <= -180) degrees += 360;
  while (degrees > 180) degrees -= 360;
  return degrees;
}

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height, dpr };
}

function makeView(width, height) {
  const margin = 30;
  const scale = Math.min((width - margin * 2) / (WORLD_LIMIT * 2), (height - margin * 2) / (WORLD_LIMIT * 2));
  return {
    scale,
    centerX: width / 2,
    centerY: height / 2,
    toScreen(x, y) {
      return { x: this.centerX + x * scale, y: this.centerY - y * scale };
    },
    toWorld(x, y) {
      return { x: (x - this.centerX) / scale, y: (this.centerY - y) / scale };
    }
  };
}

function drawObjectSpace() {
  const { context, width, height } = resizeCanvas(elements.objectCanvas);
  const view = makeView(width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07131e";
  context.fillRect(0, 0, width, height);

  drawGrid(context, view, width, height);
  state.ellipses.forEach((ellipse) => {
    if (ellipse.visible) drawEllipse(context, view, ellipse, ellipse.id === state.selectedId);
  });

  const selected = selectedEllipse();
  if (selected?.visible) drawHandles(context, view, selected);
}

function drawGrid(context, view, width, height) {
  context.save();
  context.lineWidth = 1;
  context.font = "11px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";

  for (let value = -3; value <= 3; value += 0.5) {
    const vertical = view.toScreen(value, 0).x;
    const horizontal = view.toScreen(0, value).y;
    const major = Number.isInteger(value);
    context.strokeStyle = major ? "rgba(159,195,214,0.14)" : "rgba(159,195,214,0.06)";
    context.beginPath();
    context.moveTo(vertical, 0);
    context.lineTo(vertical, height);
    context.moveTo(0, horizontal);
    context.lineTo(width, horizontal);
    context.stroke();

    if (major && value !== 0) {
      context.fillStyle = "rgba(145,169,184,0.62)";
      context.fillText(String(value), vertical, view.centerY + 7);
      context.save();
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(String(value), view.centerX + 7, horizontal);
      context.restore();
    }
  }

  context.strokeStyle = "rgba(239,248,251,0.42)";
  context.beginPath();
  context.moveTo(0, view.centerY);
  context.lineTo(width, view.centerY);
  context.moveTo(view.centerX, 0);
  context.lineTo(view.centerX, height);
  context.stroke();
  context.fillStyle = "rgba(239,248,251,0.72)";
  context.fillText("x", width - 14, view.centerY + 7);
  context.textAlign = "left";
  context.fillText("y", view.centerX + 8, 8);
  context.restore();
}

function drawEllipse(context, view, ellipse, selected) {
  const center = view.toScreen(ellipse.cx, ellipse.cy);
  context.save();
  context.translate(center.x, center.y);
  context.rotate(-ellipse.angle);
  context.beginPath();
  context.ellipse(0, 0, ellipse.a * view.scale, ellipse.b * view.scale, 0, 0, TAU);
  context.fillStyle = rgba(ellipse.color, state.mode === "binary" ? 0.25 : 0.18 + Math.min(ellipse.density, 2) * 0.07);
  context.fill();
  context.lineWidth = selected ? 2.5 : 1.5;
  context.strokeStyle = selected ? ellipse.color : rgba(ellipse.color, 0.72);
  context.stroke();
  context.restore();
}

function handlePositions(ellipse, view) {
  const cosine = Math.cos(ellipse.angle);
  const sine = Math.sin(ellipse.angle);
  return {
    center: view.toScreen(ellipse.cx, ellipse.cy),
    major: view.toScreen(ellipse.cx + ellipse.a * cosine, ellipse.cy + ellipse.a * sine),
    minor: view.toScreen(ellipse.cx - ellipse.b * sine, ellipse.cy + ellipse.b * cosine)
  };
}

function drawHandles(context, view, ellipse) {
  const handles = handlePositions(ellipse, view);
  context.save();
  context.strokeStyle = rgba(ellipse.color, 0.72);
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(handles.center.x, handles.center.y);
  context.lineTo(handles.major.x, handles.major.y);
  context.moveTo(handles.center.x, handles.center.y);
  context.lineTo(handles.minor.x, handles.minor.y);
  context.stroke();
  context.setLineDash([]);

  drawHandle(context, handles.major, ellipse.color, false);
  drawHandle(context, handles.minor, ellipse.color, false);
  drawHandle(context, handles.center, "#ffca76", true);
  context.restore();
}

function drawHandle(context, point, color, filled) {
  context.beginPath();
  context.arc(point.x, point.y, filled ? 6 : 5.5, 0, TAU);
  context.fillStyle = filled ? color : "#07131e";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.stroke();
}

function pointInsideEllipse(point, ellipse) {
  const dx = point.x - ellipse.cx;
  const dy = point.y - ellipse.cy;
  const cosine = Math.cos(ellipse.angle);
  const sine = Math.sin(ellipse.angle);
  const localX = cosine * dx + sine * dy;
  const localY = -sine * dx + cosine * dy;
  return (localX * localX) / (ellipse.a * ellipse.a) + (localY * localY) / (ellipse.b * ellipse.b) <= 1;
}

function pointerLocation(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function onObjectPointerDown(event) {
  const { width, height } = elements.objectCanvas.getBoundingClientRect();
  const view = makeView(width, height);
  const pointer = pointerLocation(event, elements.objectCanvas);
  const selected = selectedEllipse();

  if (selected?.visible) {
    const handles = handlePositions(selected, view);
    for (const type of ["center", "major", "minor"]) {
      if (distance(pointer, handles[type]) <= 14) {
        state.drag = { type, id: selected.id };
        elements.objectCanvas.setPointerCapture(event.pointerId);
        return;
      }
    }
  }

  const world = view.toWorld(pointer.x, pointer.y);
  const hit = [...state.ellipses].reverse().find((ellipse) => ellipse.visible && pointInsideEllipse(world, ellipse));
  if (hit) {
    state.selectedId = hit.id;
    state.drag = { type: "center", id: hit.id, offsetX: world.x - hit.cx, offsetY: world.y - hit.cy };
    elements.objectCanvas.setPointerCapture(event.pointerId);
    renderInterface();
  }
}

function onObjectPointerMove(event) {
  if (!state.drag) return;
  const ellipse = state.ellipses.find((item) => item.id === state.drag.id);
  if (!ellipse) return;
  const rect = elements.objectCanvas.getBoundingClientRect();
  const view = makeView(rect.width, rect.height);
  const pointer = pointerLocation(event, elements.objectCanvas);
  const world = view.toWorld(pointer.x, pointer.y);

  if (state.drag.type === "center") {
    ellipse.cx = clamp(world.x - (state.drag.offsetX || 0), -WORLD_LIMIT, WORLD_LIMIT);
    ellipse.cy = clamp(world.y - (state.drag.offsetY || 0), -WORLD_LIMIT, WORLD_LIMIT);
  } else if (state.drag.type === "major") {
    const dx = world.x - ellipse.cx;
    const dy = world.y - ellipse.cy;
    ellipse.a = clamp(Math.hypot(dx, dy), 0.15, 2.7);
    ellipse.angle = Math.atan2(dy, dx);
  } else if (state.drag.type === "minor") {
    const normalX = -Math.sin(ellipse.angle);
    const normalY = Math.cos(ellipse.angle);
    const projected = (world.x - ellipse.cx) * normalX + (world.y - ellipse.cy) * normalY;
    ellipse.b = clamp(Math.abs(projected), 0.12, 2.7);
  }

  syncParameterValues();
  updateEquation();
  drawObjectSpace();
  scheduleSinogram();
}

function endDrag(event) {
  if (state.drag && elements.objectCanvas.hasPointerCapture?.(event.pointerId)) {
    elements.objectCanvas.releasePointerCapture(event.pointerId);
  }
  state.drag = null;
}

function ellipseInterval(ellipse, detector, theta) {
  const normalX = Math.cos(theta);
  const normalY = Math.sin(theta);
  const lineX = -normalY;
  const lineY = normalX;
  const baseX = detector * normalX - ellipse.cx;
  const baseY = detector * normalY - ellipse.cy;
  const cosine = Math.cos(ellipse.angle);
  const sine = Math.sin(ellipse.angle);

  const u0 = cosine * baseX + sine * baseY;
  const v0 = -sine * baseX + cosine * baseY;
  const du = cosine * lineX + sine * lineY;
  const dv = -sine * lineX + cosine * lineY;
  const invA2 = 1 / (ellipse.a * ellipse.a);
  const invB2 = 1 / (ellipse.b * ellipse.b);
  const A = du * du * invA2 + dv * dv * invB2;
  const B = 2 * (u0 * du * invA2 + v0 * dv * invB2);
  const C = u0 * u0 * invA2 + v0 * v0 * invB2 - 1;
  const discriminant = B * B - 4 * A * C;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const first = (-B - root) / (2 * A);
  const second = (-B + root) / (2 * A);
  return first < second ? [first, second] : [second, first];
}

function unionLength(intervals) {
  if (!intervals.length) return 0;
  intervals.sort((first, second) => first[0] - second[0]);
  let start = intervals[0][0];
  let end = intervals[0][1];
  let total = 0;
  for (let index = 1; index < intervals.length; index += 1) {
    const current = intervals[index];
    if (current[0] <= end) {
      end = Math.max(end, current[1]);
    } else {
      total += end - start;
      start = current[0];
      end = current[1];
    }
  }
  return total + end - start;
}

function radonValue(visibleEllipses, detector, theta) {
  const intervals = [];
  let additiveValue = 0;
  for (const ellipse of visibleEllipses) {
    const interval = ellipseInterval(ellipse, detector, theta);
    if (!interval) continue;
    if (state.mode === "binary") intervals.push(interval);
    else additiveValue += ellipse.density * (interval[1] - interval[0]);
  }
  return state.mode === "binary" ? unionLength(intervals) : additiveValue;
}

function colorMap(normalized) {
  const stops = [
    [0.00, [6, 17, 29]],
    [0.24, [12, 82, 111]],
    [0.52, [19, 174, 170]],
    [0.79, [243, 209, 125]],
    [1.00, [255, 248, 221]]
  ];
  const value = clamp(normalized, 0, 1);
  let index = 0;
  while (index < stops.length - 2 && value > stops[index + 1][0]) index += 1;
  const [leftPosition, leftColor] = stops[index];
  const [rightPosition, rightColor] = stops[index + 1];
  const ratio = (value - leftPosition) / (rightPosition - leftPosition || 1);
  return leftColor.map((channel, channelIndex) => Math.round(channel + (rightColor[channelIndex] - channel) * ratio));
}

function computeSinogram() {
  const startTime = performance.now();
  const visibleEllipses = state.ellipses.filter((ellipse) => ellipse.visible);
  const resolution = RESOLUTIONS[state.resolution];
  const values = new Float32Array(resolution.angles * resolution.detectors);
  let maximum = 0;

  for (let angleIndex = 0; angleIndex < resolution.angles; angleIndex += 1) {
    const theta = angleIndex * Math.PI / resolution.angles;
    for (let detectorIndex = 0; detectorIndex < resolution.detectors; detectorIndex += 1) {
      const detector = -WORLD_LIMIT + detectorIndex * (WORLD_LIMIT * 2) / (resolution.detectors - 1);
      const value = radonValue(visibleEllipses, detector, theta);
      values[angleIndex * resolution.detectors + detectorIndex] = value;
      maximum = Math.max(maximum, value);
    }
  }

  drawSinogram(values, resolution.detectors, resolution.angles, maximum);
  const elapsed = performance.now() - startTime;
  elements.computeStatus.textContent = `已更新 · ${elapsed.toFixed(0)} ms`;
  elements.maxValueLabel.textContent = `max = ${maximum.toFixed(3)}`;
  const modelName = state.mode === "binary" ? "二值聯集" : "密度加法";
  elements.dataSummary.textContent = `${visibleEllipses.length} 個可見橢圓 · ${resolution.angles} 角度 × ${resolution.detectors} detectors · ${modelName}`;
}

function drawSinogram(values, detectorCount, angleCount, maximum) {
  const { context, width, height } = resizeCanvas(elements.sinogramCanvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07131e";
  context.fillRect(0, 0, width, height);

  const offscreen = document.createElement("canvas");
  offscreen.width = detectorCount;
  offscreen.height = angleCount;
  const offscreenContext = offscreen.getContext("2d");
  const image = offscreenContext.createImageData(detectorCount, angleCount);
  for (let index = 0; index < values.length; index += 1) {
    const normalized = maximum > 0 ? Math.sqrt(values[index] / maximum) : 0;
    const [red, green, blue] = colorMap(normalized);
    image.data[index * 4] = red;
    image.data[index * 4 + 1] = green;
    image.data[index * 4 + 2] = blue;
    image.data[index * 4 + 3] = 255;
  }
  offscreenContext.putImageData(image, 0, 0);

  const margin = { left: 52, right: 18, top: 17, bottom: 43 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  context.imageSmoothingEnabled = true;
  context.drawImage(offscreen, margin.left, margin.top, plotWidth, plotHeight);
  context.strokeStyle = "rgba(239,248,251,0.28)";
  context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);

  context.fillStyle = "rgba(201,217,225,0.78)";
  context.font = "12px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "top";
  [-WORLD_LIMIT, 0, WORLD_LIMIT].forEach((detector) => {
    const x = margin.left + (detector + WORLD_LIMIT) / (WORLD_LIMIT * 2) * plotWidth;
    context.fillText(formatNumber(detector, 1), x, margin.top + plotHeight + 8);
  });
  context.fillText("detector s", margin.left + plotWidth / 2, height - 17);

  context.textAlign = "right";
  context.textBaseline = "middle";
  [0, 90, 180].forEach((degree) => {
    const y = margin.top + degree / 180 * plotHeight;
    context.fillText(`${degree}°`, margin.left - 9, y);
  });
  context.save();
  context.translate(14, margin.top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textAlign = "center";
  context.fillText("angle θ", 0, 0);
  context.restore();
}

function scheduleSinogram() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  elements.computeStatus.textContent = "計算中…";
  requestAnimationFrame(() => {
    state.renderQueued = false;
    computeSinogram();
  });
}

function renderEllipseList() {
  elements.ellipseList.replaceChildren();
  for (const ellipse of state.ellipses) {
    const row = document.createElement("div");
    row.className = `ellipse-row${ellipse.id === state.selectedId ? " is-selected" : ""}`;
    row.dataset.id = String(ellipse.id);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "visibility-toggle";
    checkbox.checked = ellipse.visible;
    checkbox.setAttribute("aria-label", `顯示${ellipse.name}`);
    checkbox.addEventListener("change", () => {
      ellipse.visible = checkbox.checked;
      renderInterface();
      scheduleSinogram();
    });

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = ellipse.color;
    dot.style.color = ellipse.color;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "ellipse-select";
    select.innerHTML = `<strong>${ellipse.name}</strong><small>c = (${formatNumber(ellipse.cx)}, ${formatNumber(ellipse.cy)}) · a = ${formatNumber(ellipse.a)} · b = ${formatNumber(ellipse.b)}</small>`;
    select.addEventListener("click", () => {
      state.selectedId = ellipse.id;
      renderInterface();
    });

    const id = document.createElement("span");
    id.className = "row-id";
    id.textContent = `#${ellipse.id}`;
    row.append(checkbox, dot, select, id);
    elements.ellipseList.append(row);
  }
}

const PARAMETER_DEFINITIONS = [
  { key: "cx", label: "中心 x", min: -3, max: 3, step: 0.01, format: (value) => formatNumber(value) },
  { key: "cy", label: "中心 y", min: -3, max: 3, step: 0.01, format: (value) => formatNumber(value) },
  { key: "a", label: "半軸 a", min: 0.15, max: 2.7, step: 0.01, format: (value) => formatNumber(value) },
  { key: "b", label: "半軸 b", min: 0.12, max: 2.7, step: 0.01, format: (value) => formatNumber(value) },
  { key: "angle", label: "旋轉 α", min: -180, max: 180, step: 1, format: (value) => `${formatNumber(angleDegrees(value), 0)}°`, degrees: true },
  { key: "density", label: "密度 ρ", min: 0.1, max: 2.5, step: 0.05, format: (value) => formatNumber(value), additiveOnly: true }
];

function renderParameterControls() {
  const ellipse = selectedEllipse();
  elements.parameterControls.replaceChildren();
  elements.parameterSection.hidden = !ellipse;
  if (!ellipse) return;
  elements.selectedTitle.textContent = ellipse.name;

  for (const definition of PARAMETER_DEFINITIONS) {
    const row = document.createElement("div");
    row.className = `control-row${definition.additiveOnly && state.mode !== "additive" ? " is-muted" : ""}`;
    const label = document.createElement("label");
    const inputId = `parameter-${definition.key}`;
    label.htmlFor = inputId;
    label.textContent = definition.label;

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(definition.degrees ? angleDegrees(ellipse[definition.key]) : ellipse[definition.key]);
    input.disabled = Boolean(definition.additiveOnly && state.mode !== "additive");
    input.dataset.parameter = definition.key;

    const output = document.createElement("output");
    output.dataset.output = definition.key;
    output.textContent = definition.format(ellipse[definition.key]);

    input.addEventListener("input", () => {
      const numeric = Number(input.value);
      ellipse[definition.key] = definition.degrees ? numeric * Math.PI / 180 : numeric;
      output.textContent = definition.format(ellipse[definition.key]);
      updateEquation();
      drawObjectSpace();
      updateEllipseListSummary(ellipse);
      scheduleSinogram();
    });
    row.append(label, input, output);
    elements.parameterControls.append(row);
  }
  updateEquation();
}

function syncParameterValues() {
  const ellipse = selectedEllipse();
  if (!ellipse) return;
  for (const definition of PARAMETER_DEFINITIONS) {
    const input = document.querySelector(`[data-parameter="${definition.key}"]`);
    const output = document.querySelector(`[data-output="${definition.key}"]`);
    if (input) input.value = String(definition.degrees ? angleDegrees(ellipse[definition.key]) : ellipse[definition.key]);
    if (output) output.textContent = definition.format(ellipse[definition.key]);
  }
  updateEllipseListSummary(ellipse);
}

function updateEllipseListSummary(ellipse) {
  const row = elements.ellipseList.querySelector(`[data-id="${ellipse.id}"] small`);
  if (row) row.textContent = `c = (${formatNumber(ellipse.cx)}, ${formatNumber(ellipse.cy)}) · a = ${formatNumber(ellipse.a)} · b = ${formatNumber(ellipse.b)}`;
}

function shiftedVariable(variable, center) {
  if (Math.abs(center) < 0.0005) return variable;
  const sign = center > 0 ? "−" : "+";
  return `(${variable} ${sign} ${formatNumber(Math.abs(center))})`;
}

function updateEquation() {
  const ellipse = selectedEllipse();
  if (!ellipse) return;
  const degrees = formatNumber(angleDegrees(ellipse.angle), 0);
  const cosine = `cos(${degrees}°)`;
  const sine = `sin(${degrees}°)`;
  const cx = formatNumber(ellipse.cx);
  const cy = formatNumber(ellipse.cy);
  const a = formatNumber(ellipse.a);
  const b = formatNumber(ellipse.b);
  const shiftedX = shiftedVariable("x", ellipse.cx);
  const shiftedY = shiftedVariable("y", ellipse.cy);
  elements.parametricEquation.innerHTML = [
    `x(t) = ${cx} + ${a} cos(t) ${cosine} − ${b} sin(t) ${sine}`,
    `<br>y(t) = ${cy} + ${a} cos(t) ${sine} + ${b} sin(t) ${cosine}`
  ].join("");
  elements.implicitEquation.innerHTML =
    `[(${shiftedX}${cosine} + ${shiftedY}${sine}) / ${a}]² + ` +
    `[(−${shiftedX}${sine} + ${shiftedY}${cosine}) / ${b}]² ≤ 1`;
}

function renderMode() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  });
  elements.modeNote.textContent = state.mode === "binary"
    ? "重疊區仍為 1；每條投影線只計算聯集內的總長度。"
    : "每個橢圓可有不同密度；重疊區的密度相加。";
}

function renderInterface() {
  renderMode();
  renderEllipseList();
  renderParameterControls();
  drawObjectSpace();
}

function addEllipse(initial = {}) {
  if (state.ellipses.length >= 12) {
    elements.computeStatus.textContent = "最多 12 個橢圓";
    return null;
  }
  const id = state.nextId++;
  const spread = (id % 5 - 2) * 0.18;
  const ellipse = {
    id,
    name: `橢圓 ${id}`,
    visible: true,
    cx: initial.cx ?? spread,
    cy: initial.cy ?? -spread,
    a: initial.a ?? 0.72,
    b: initial.b ?? 0.42,
    angle: initial.angle ?? 0,
    density: initial.density ?? 1,
    color: COLORS[(id - 1) % COLORS.length]
  };
  state.ellipses.push(ellipse);
  state.selectedId = id;
  renderInterface();
  scheduleSinogram();
  return ellipse;
}

function deleteSelectedEllipse() {
  const index = state.ellipses.findIndex((ellipse) => ellipse.id === state.selectedId);
  if (index < 0) return;
  state.ellipses.splice(index, 1);
  state.selectedId = state.ellipses[Math.min(index, state.ellipses.length - 1)]?.id ?? null;
  renderInterface();
  scheduleSinogram();
}

function resetExample() {
  state.mode = "binary";
  state.ellipses = defaultEllipses();
  state.selectedId = 1;
  state.nextId = 4;
  state.resolution = "standard";
  elements.resolutionSelect.value = "standard";
  renderInterface();
  scheduleSinogram();
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      renderInterface();
      scheduleSinogram();
    });
  });
  elements.addEllipseButton.addEventListener("click", () => addEllipse());
  elements.deleteEllipseButton.addEventListener("click", deleteSelectedEllipse);
  elements.resetButton.addEventListener("click", resetExample);
  elements.resolutionSelect.addEventListener("change", () => {
    state.resolution = elements.resolutionSelect.value;
    scheduleSinogram();
  });
  elements.objectCanvas.addEventListener("pointerdown", onObjectPointerDown);
  elements.objectCanvas.addEventListener("pointermove", onObjectPointerMove);
  elements.objectCanvas.addEventListener("pointerup", endDrag);
  elements.objectCanvas.addEventListener("pointercancel", endDrag);
  elements.objectCanvas.addEventListener("keydown", (event) => {
    const ellipse = selectedEllipse();
    if (!ellipse || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.03;
    if (event.key === "ArrowLeft") ellipse.cx -= step;
    if (event.key === "ArrowRight") ellipse.cx += step;
    if (event.key === "ArrowUp") ellipse.cy += step;
    if (event.key === "ArrowDown") ellipse.cy -= step;
    ellipse.cx = clamp(ellipse.cx, -WORLD_LIMIT, WORLD_LIMIT);
    ellipse.cy = clamp(ellipse.cy, -WORLD_LIMIT, WORLD_LIMIT);
    syncParameterValues();
    updateEquation();
    drawObjectSpace();
    scheduleSinogram();
  });

  const resizeObserver = new ResizeObserver(() => {
    drawObjectSpace();
    scheduleSinogram();
  });
  resizeObserver.observe(elements.objectCanvas);
  resizeObserver.observe(elements.sinogramCanvas);
}

function registerModelContextTools() {
  if (!document.modelContext?.registerTool) return;

  document.modelContext.registerTool({
    name: "read_ellipse_configuration",
    description: "Read the current ellipse geometry and Radon data model.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => ({
      content: [{ type: "text", text: JSON.stringify({
        mode: state.mode,
        resolution: state.resolution,
        ellipses: state.ellipses.map(({ color, ...ellipse }) => ({ ...ellipse, angleDegrees: round(angleDegrees(ellipse.angle), 2) }))
      }) }]
    })
  });

  document.modelContext.registerTool({
    name: "set_radon_model",
    description: "Switch between binary-union and additive-density Radon data.",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["binary", "additive"] } },
      required: ["mode"],
      additionalProperties: false
    },
    execute: async ({ mode }) => {
      if (!["binary", "additive"].includes(mode)) throw new Error("mode must be binary or additive");
      state.mode = mode;
      renderInterface();
      scheduleSinogram();
      return { content: [{ type: "text", text: `Radon model set to ${mode}.` }] };
    }
  });

  document.modelContext.registerTool({
    name: "add_ellipse",
    description: "Add one visible ellipse and recompute the sinogram.",
    inputSchema: {
      type: "object",
      properties: {
        cx: { type: "number", minimum: -3, maximum: 3 },
        cy: { type: "number", minimum: -3, maximum: 3 },
        a: { type: "number", minimum: 0.15, maximum: 2.7 },
        b: { type: "number", minimum: 0.12, maximum: 2.7 },
        angleDegrees: { type: "number", minimum: -180, maximum: 180 },
        density: { type: "number", minimum: 0.1, maximum: 2.5 }
      },
      additionalProperties: false
    },
    execute: async (input = {}) => {
      const ellipse = addEllipse({
        ...input,
        angle: input.angleDegrees === undefined ? 0 : input.angleDegrees * Math.PI / 180
      });
      if (!ellipse) throw new Error("The maximum of 12 ellipses has been reached.");
      return { content: [{ type: "text", text: `Added ellipse ${ellipse.id}.` }] };
    }
  });
}

bindEvents();
renderInterface();
scheduleSinogram();
registerModelContextTools();
