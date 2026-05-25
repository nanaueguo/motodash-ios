const els = {
  clock: document.querySelector("#clock"),
  speed: document.querySelector("#speed"),
  maxSpeed: document.querySelector("#maxSpeed"),
  avgSpeed: document.querySelector("#avgSpeed"),
  distance: document.querySelector("#distance"),
  lean: document.querySelector("#lean"),
  leanDirection: document.querySelector("#leanDirection"),
  heading: document.querySelector("#heading"),
  altitude: document.querySelector("#altitude"),
  duration: document.querySelector("#duration"),
  accuracy: document.querySelector("#accuracy"),
  gpsStatus: document.querySelector("#gpsStatus"),
  motionStatus: document.querySelector("#motionStatus"),
  gaugeFill: document.querySelector("#gaugeFill"),
  needle: document.querySelector("#needle"),
  startButton: document.querySelector("#startButton"),
  calibrateButton: document.querySelector("#calibrateButton"),
  wakeLockButton: document.querySelector("#wakeLockButton"),
  message: document.querySelector("#message"),
};

const state = {
  active: false,
  speed: 0,
  maxSpeed: 0,
  speedSamples: [],
  distanceMeters: 0,
  startedAt: 0,
  watchId: null,
  lastLocation: null,
  lean: 0,
  leanOffset: 0,
  rawLean: 0,
  wakeLock: null,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value) => Math.round(Number.isFinite(value) ? value : 0);

function setMessage(text) {
  els.message.textContent = text;
}

function setStatus(el, mode, label) {
  el.classList.remove("ok", "warn", "bad");
  el.classList.add(mode);
  el.querySelector("span:last-child").textContent = label;
}

function updateClock() {
  els.clock.textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function updateDuration() {
  if (!state.startedAt) {
    els.duration.textContent = "00:00";
    return;
  }

  const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  els.duration.textContent = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function updateSpeedMetrics() {
  els.speed.textContent = round(state.speed);
  els.maxSpeed.textContent = round(state.maxSpeed);
  els.distance.textContent = (state.distanceMeters / 1000).toFixed(1);

  const avg = state.speedSamples.length
    ? state.speedSamples.reduce((sum, value) => sum + value, 0) / state.speedSamples.length
    : 0;
  els.avgSpeed.textContent = round(avg);
}

function updateLean(rawLean) {
  state.rawLean = rawLean;
  state.lean = rawLean - state.leanOffset;

  const displayLean = clamp(state.lean, -55, 55);
  const absLean = Math.abs(displayLean);
  const severity = absLean < 12 ? "var(--green)" : absLean < 32 ? "var(--amber)" : "var(--red)";
  const direction = absLean < 2 ? "直立" : displayLean < 0 ? "左倾" : "右倾";
  const normalized = ((displayLean + 55) / 110) * 100;

  els.lean.textContent = round(absLean);
  els.leanDirection.textContent = direction;
  els.leanDirection.style.color = severity;
  els.needle.style.transform = `rotate(${displayLean}deg) translateX(-2px)`;
  els.gaugeFill.style.borderColor = severity;
  els.gaugeFill.style.filter = `drop-shadow(0 0 16px ${severity})`;
  els.gaugeFill.style.clipPath =
    displayLean >= 0
      ? `inset(0 ${100 - normalized}% 0 50%)`
      : `inset(0 50% 0 ${normalized}%)`;
}

function handleLocation(position) {
  const { coords, timestamp } = position;
  const speedKph = coords.speed && coords.speed > 0 ? coords.speed * 3.6 : 0;
  state.speed = speedKph;
  state.maxSpeed = Math.max(state.maxSpeed, speedKph);

  if (state.active && speedKph > 1) {
    state.speedSamples.push(speedKph);
    if (state.speedSamples.length > 1800) {
      state.speedSamples.shift();
    }
  }

  if (state.lastLocation && state.active) {
    const delta = distanceBetween(state.lastLocation.coords, coords);
    const deltaTime = timestamp - state.lastLocation.timestamp;
    if (deltaTime > 0 && delta < 150) {
      state.distanceMeters += delta;
    }
  }

  state.lastLocation = position;
  els.heading.textContent = Number.isFinite(coords.heading) ? round(coords.heading) : "--";
  els.altitude.textContent = Number.isFinite(coords.altitude) ? round(coords.altitude) : "--";
  els.accuracy.textContent = Number.isFinite(coords.accuracy) ? round(coords.accuracy) : "--";
  setStatus(els.gpsStatus, "ok", "GPS");
  updateSpeedMetrics();
}

function handleLocationError(error) {
  setStatus(els.gpsStatus, "bad", "NO GPS");
  setMessage(error.message || "定位不可用，请检查 Safari 定位权限。");
}

function distanceBetween(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function requestMotionPermission() {
  const motion = window.DeviceOrientationEvent;
  if (!motion) {
    setStatus(els.motionStatus, "bad", "NO IMU");
    return false;
  }

  if (typeof motion.requestPermission === "function") {
    const result = await motion.requestPermission();
    if (result !== "granted") {
      setStatus(els.motionStatus, "bad", "NO IMU");
      return false;
    }
  }

  window.addEventListener("deviceorientation", onDeviceOrientation, { passive: true });
  setStatus(els.motionStatus, "ok", "IMU");
  return true;
}

function onDeviceOrientation(event) {
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  updateLean(gamma);
}

function startGps() {
  if (!("geolocation" in navigator)) {
    setStatus(els.gpsStatus, "bad", "NO GPS");
    setMessage("当前浏览器不支持定位。");
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(handleLocation, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 12000,
  });
  setStatus(els.gpsStatus, "warn", "GPS");
}

async function toggleRide() {
  if (!state.active) {
    state.active = true;
    state.startedAt = Date.now();
    state.distanceMeters = 0;
    state.speedSamples = [];
    state.maxSpeed = 0;
    els.startButton.textContent = "结束骑行";
    setMessage("骑行中。车把安装后可点“校准”归零倾角。");
    startGps();
    await requestMotionPermission();
    await requestWakeLock();
    return;
  }

  state.active = false;
  els.startButton.textContent = "开始骑行";
  setMessage("骑行已结束。再次点击开始会重置本次里程和平均速度。");
  await releaseWakeLock();
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    els.wakeLockButton.setAttribute("aria-pressed", "false");
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    els.wakeLockButton.setAttribute("aria-pressed", "true");
  } catch {
    els.wakeLockButton.setAttribute("aria-pressed", "false");
  }
}

async function releaseWakeLock() {
  if (state.wakeLock) {
    await state.wakeLock.release();
    state.wakeLock = null;
  }
  els.wakeLockButton.setAttribute("aria-pressed", "false");
}

els.startButton.addEventListener("click", toggleRide);
els.calibrateButton.addEventListener("click", () => {
  state.leanOffset = state.rawLean;
  updateLean(state.rawLean);
  setMessage("倾角已校准。");
});
els.wakeLockButton.addEventListener("click", async () => {
  if (state.wakeLock) {
    await releaseWakeLock();
  } else {
    await requestWakeLock();
  }
});

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.active) {
    await requestWakeLock();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

setStatus(els.gpsStatus, "warn", "GPS");
setStatus(els.motionStatus, "warn", "IMU");
updateClock();
updateDuration();
updateSpeedMetrics();
updateLean(0);
setInterval(updateClock, 1000);
setInterval(updateDuration, 1000);
