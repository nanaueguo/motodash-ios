const els = {
  clock: document.querySelector("#clock"),
  speed: document.querySelector("#speed"),
  speedNeedle: document.querySelector("#speedNeedle"),
  lean: document.querySelector("#lean"),
  leanPointer: document.querySelector("#leanPointer"),
  altitude: document.querySelector("#altitude"),
  startButton: document.querySelector("#startButton"),
  calibrateButton: document.querySelector("#calibrateButton"),
};

const state = {
  active: false,
  speedKph: 0,
  rawLean: 0,
  leanOffset: 0,
  watchId: null,
  wakeLock: null,
};

const MAX_SPEED = 180;
const SPEED_MIN_DEG = 0;
const SPEED_MAX_DEG = 180;
const LEAN_MAX_DEG = 52;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value) => Math.round(Number.isFinite(value) ? value : 0);

function setViewportHeight() {
  document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
}

function updateClock() {
  const value = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  els.clock.textContent = value;
}

function renderSpeed(speedKph) {
  state.speedKph = Math.max(speedKph, 0);
  const capped = clamp(state.speedKph, 0, MAX_SPEED);
  const progress = capped / MAX_SPEED;
  const rotation = SPEED_MIN_DEG + progress * (SPEED_MAX_DEG - SPEED_MIN_DEG);

  els.speed.textContent = round(state.speedKph);
  els.speedNeedle.setAttribute("transform", `rotate(${rotation} 260 288)`);
}

function renderLean(rawLean) {
  state.rawLean = rawLean;
  const calibrated = rawLean - state.leanOffset;
  const displayLean = clamp(calibrated, -LEAN_MAX_DEG, LEAN_MAX_DEG);
  const absLean = Math.abs(displayLean);
  const color = absLean < 14 ? "var(--green)" : absLean < 32 ? "var(--amber)" : "var(--red)";

  els.lean.textContent = round(absLean);
  els.leanPointer.style.setProperty("--lean-rotation", `${displayLean}deg`);
  document.documentElement.style.setProperty("--lean-rotation", `${displayLean}deg`);
  els.lean.parentElement.style.color = color;
}

function handleLocation(position) {
  const { coords } = position;
  const speed = coords.speed && coords.speed > 0 ? coords.speed * 3.6 : 0;
  renderSpeed(speed);
  els.altitude.textContent = Number.isFinite(coords.altitude) ? round(coords.altitude) : "--";
}

function handleLocationError() {
  renderSpeed(0);
  els.altitude.textContent = "--";
}

async function requestMotionPermission() {
  const orientation = window.DeviceOrientationEvent;
  if (!orientation) {
    return;
  }

  if (typeof orientation.requestPermission === "function") {
    const result = await orientation.requestPermission();
    if (result !== "granted") {
      return;
    }
  }

  window.addEventListener("deviceorientation", onDeviceOrientation, { passive: true });
}

function onDeviceOrientation(event) {
  renderLean(getSideLean(event));
}

function getSideLean(event) {
  const beta = Number.isFinite(event.beta) ? event.beta : 0;
  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  const orientation = getScreenOrientation();

  if (Math.abs(orientation) === 90) {
    return orientation === 90 ? -beta : beta;
  }

  return gamma;
}

function getScreenOrientation() {
  if (screen.orientation && Number.isFinite(screen.orientation.angle)) {
    return screen.orientation.angle;
  }

  if (Number.isFinite(window.orientation)) {
    return window.orientation;
  }

  return window.innerWidth > window.innerHeight ? 90 : 0;
}

function startGps() {
  if (!("geolocation" in navigator)) {
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(handleLocation, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 800,
    timeout: 12000,
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    state.wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) {
    return;
  }

  await state.wakeLock.release();
  state.wakeLock = null;
}

async function toggleRide() {
  state.active = !state.active;
  els.startButton.textContent = state.active ? "结束" : "开始";

  if (state.active) {
    startGps();
    await requestMotionPermission();
    await requestWakeLock();
    return;
  }

  await releaseWakeLock();
}

els.startButton.addEventListener("click", toggleRide);
els.calibrateButton.addEventListener("click", () => {
  state.leanOffset = state.rawLean;
  renderLean(state.rawLean);
});

window.addEventListener("resize", setViewportHeight);
window.addEventListener("orientationchange", setViewportHeight);
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.active) {
    await requestWakeLock();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

setViewportHeight();
updateClock();
renderSpeed(0);
renderLean(0);
setInterval(updateClock, 1000);
