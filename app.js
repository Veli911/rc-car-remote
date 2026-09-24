const SERVICE_UUID = 'b7d4c100-8f1e-4c2a-9a6b-3e77f0a40001';
const CONTROL_UUID = 'b7d4c101-8f1e-4c2a-9a6b-3e77f0a40001';
const STATUS_UUID = 'b7d4c102-8f1e-4c2a-9a6b-3e77f0a40001';
const TELEMETRY_UUID = 'b7d4c103-8f1e-4c2a-9a6b-3e77f0a40001';
const HEARTBEAT_UUID = 'b7d4c104-8f1e-4c2a-9a6b-3e77f0a40001';

const statusText = document.querySelector('#statusText');
const distanceText = document.querySelector('#distanceText');
const batteryText = document.querySelector('#batteryText');
const connectBtn = document.querySelector('#connectBtn');
const installBtn = document.querySelector('#installBtn');
const steeringSlider = document.querySelector('#steeringSlider');
const throttleSlider = document.querySelector('#throttleSlider');
const steeringValue = document.querySelector('#steeringValue');
const throttleValue = document.querySelector('#throttleValue');
const steeringTrack = document.querySelector('#steeringTrack');
const steeringFill = document.querySelector('#steeringFill');
const throttleTrack = document.querySelector('#throttleTrack');
const throttleFill = document.querySelector('#throttleFill');
const modeButtons = document.querySelectorAll('.mode-button');
const centerBtn = document.querySelector('#centerBtn');

let device = null;
let controlCharacteristic = null;
let statusCharacteristic = null;
let telemetryCharacteristic = null;
let heartbeatCharacteristic = null;
let heartbeatInterval = null;
let controlKeepAliveInterval = null;
let wakeLock = null;
let isConnected = false;
let deferredPrompt = null;
let currentMode = 'manual';
let lastKnownSpeed = 0;
let lastKnownSteering = 0;
let tiltReference = 0;
let smoothedTiltSteering = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text) {
  statusText.textContent = text;
}

function updateLabels() {
  const steering = Math.round(lastKnownSteering);
  steeringValue.textContent = steering > 0 ? `+${steering}` : `${steering}`;
  throttleValue.textContent = `${lastKnownSpeed}%`;
}

function updateSteeringVisual() {
  const value = clamp(lastKnownSteering, -100, 100);
  const trackWidth = steeringTrack.clientWidth;
  const center = trackWidth / 2;
  const offset = (value / 100) * center;

  if (value >= 0) {
    steeringFill.style.left = `${center}px`;
    steeringFill.style.width = `${offset}px`;
  } else {
    steeringFill.style.left = `${center + offset}px`;
    steeringFill.style.width = `${-offset}px`;
  }

  updateLabels();
}

function resetSteering() {
  lastKnownSteering = 0;
  steeringSlider.value = '0';
  updateSteeringVisual();
  if (isConnected) {
    sendControlPacket(Number(throttleSlider.value), 0, 0).catch(() => {});
  }
}

function resetThrottle() {
  lastKnownSpeed = 0;
  throttleSlider.value = '0';
  updateThrottleVisual();
  if (isConnected) {
    sendControlPacket(0, Number(steeringSlider.value), 0).catch(() => {});
  }
}

function updateThrottleVisual() {
  const value = clamp(lastKnownSpeed, -100, 100);
  const trackHeight = throttleTrack.clientHeight;
  const halfHeight = trackHeight / 2;
  const fillPx = (Math.abs(value) / 100) * halfHeight;

  if (value >= 0) {
    throttleFill.classList.remove('reverse');
    throttleFill.style.top = `${halfHeight - fillPx}px`;
    throttleFill.style.height = `${fillPx}px`;
  } else {
    throttleFill.classList.add('reverse');
    throttleFill.style.top = `${halfHeight}px`;
    throttleFill.style.height = `${fillPx}px`;
  }

  updateLabels();
}

function buildControlPacket(speed, steering, flags = 0) {
  const view = new Uint8Array(5);
  view[0] = 1;
  view[1] = (Math.random() * 255) | 0;
  view[2] = clamp(speed, -100, 100);
  view[3] = clamp(steering, -100, 100);
  view[4] = flags;
  return view;
}

async function sendControlPacket(speed, steering, flags = 0) {
  if (!controlCharacteristic || !isConnected) return;
  const packet = buildControlPacket(speed, steering, flags);
  await controlCharacteristic.writeValue(packet);
  lastKnownSpeed = clamp(speed, -100, 100);
  lastKnownSteering = clamp(steering, -100, 100);
  updateSteeringVisual();
  updateThrottleVisual();
}

async function sendStop() {
  throttleSlider.value = 0;
  lastKnownSpeed = 0;
  updateThrottleVisual();
  await sendControlPacket(0, Number(steeringSlider.value), 0);
}

function startHeartbeatLoop() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (device && isConnected && heartbeatCharacteristic) {
      const payload = new Uint8Array([1, 0xA5]);
      heartbeatCharacteristic.writeValueWithoutResponse(payload).catch(() => {});
    }
  }, 500);
}

function stopHeartbeatLoop() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startControlKeepAlive() {
  if (controlKeepAliveInterval) clearInterval(controlKeepAliveInterval);
  controlKeepAliveInterval = setInterval(() => {
    if (isConnected) {
      sendControlPacket(lastKnownSpeed, lastKnownSteering, 0).catch(() => {});
    }
  }, 150);
}

function stopControlKeepAlive() {
  if (controlKeepAliveInterval) {
    clearInterval(controlKeepAliveInterval);
    controlKeepAliveInterval = null;
  }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (err) {
    console.warn('Wake lock failed:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isConnected) {
    requestWakeLock();
  }
});

async function handleStatusNotification(event) {
  const data = new Uint8Array(event.target.value.buffer);
  const stateCode = data[2] ?? 0;
  const stateMap = {
    0: 'BOOT',
    1: 'READY',
    2: 'MOVING',
    3: 'STOPPED',
    4: 'FAILSAFE',
    5: 'OBSTACLE',
    6: 'ERROR'
  };
  setStatus(stateMap[stateCode] ?? 'UNKNOWN');
}

async function handleTelemetryNotification(event) {
  const data = new Uint8Array(event.target.value.buffer);
  const distanceMm = data[2] | (data[3] << 8);
  const batteryMv = data[4] | (data[5] << 8);
  distanceText.textContent = `${distanceMm} mm`;
  batteryText.textContent = `${(batteryMv / 1000).toFixed(2)} V`;
}

async function connectToDevice() {
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '[::1]') {
    setStatus('Use localhost or HTTPS');
    return;
  }

  if (!navigator.bluetooth) {
    setStatus('Bluetooth not supported');
    return;
  }

  try {
    setStatus('Connecting...');
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    controlCharacteristic = await service.getCharacteristic(CONTROL_UUID);
    statusCharacteristic = await service.getCharacteristic(STATUS_UUID);
    telemetryCharacteristic = await service.getCharacteristic(TELEMETRY_UUID);
    heartbeatCharacteristic = await service.getCharacteristic(HEARTBEAT_UUID);

    await statusCharacteristic.startNotifications();
    statusCharacteristic.addEventListener('characteristicvaluechanged', handleStatusNotification);

    await telemetryCharacteristic.startNotifications();
    telemetryCharacteristic.addEventListener('characteristicvaluechanged', handleTelemetryNotification);

    isConnected = true;
    startHeartbeatLoop();
    startControlKeepAlive();
    await requestWakeLock();
    setStatus('READY');
    await sendControlPacket(0, 0, 0);
  } catch (error) {
    console.error(error);
    setStatus('Connection failed');
    isConnected = false;
  }
}

async function disconnectDevice() {
  if (!device) return;
  stopHeartbeatLoop();
  stopControlKeepAlive();
  releaseWakeLock();
  try {
    await sendStop();
  } catch (err) {
    console.warn(err);
  }
  device.gatt.disconnect();
  isConnected = false;
  setStatus('Disconnected');
  device = null;
}

function calculateSteeringFromPointer(clientX) {
  const rect = steeringTrack.getBoundingClientRect();
  const progress = clamp((clientX - rect.left) / rect.width, 0, 1);
  let steering = Math.round((progress * 200) - 100);

  if (Math.abs(steering) < 5) {
    steering = 0;
  }

  return steering;
}

function updateManualSteering(clientX) {
  const steering = calculateSteeringFromPointer(clientX);

  steeringSlider.value = String(steering);
  lastKnownSteering = steering;
  updateSteeringVisual();

  if (isConnected) {
    sendControlPacket(Number(throttleSlider.value), steering, 0).catch(() => {});
  }
}

function bindSteeringControl() {
  let activePointerId = null;

  steeringTrack.addEventListener('pointerdown', (event) => {
    if (currentMode !== 'manual' || activePointerId !== null) return;

    activePointerId = event.pointerId;
    event.preventDefault();

    try {
      steeringTrack.setPointerCapture(event.pointerId);
    } catch (_) {}

    updateManualSteering(event.clientX);
  });

  window.addEventListener('pointermove', (event) => {
    if (currentMode !== 'manual' || event.pointerId !== activePointerId) return;
    event.preventDefault();
    updateManualSteering(event.clientX);
  }, { passive: false });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetSteering();
  });

  window.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetSteering();
  });
}

function bindThrottleControl() {
  let activePointerId = null;

  const updateThrottleFromPointer = (event) => {
    const value = calculateThrottleFromPointer(event.clientY);
    const enforced = enforceReverseStopRule(value);
    throttleSlider.value = String(enforced);
    lastKnownSpeed = enforced;
    updateThrottleVisual();
    if (isConnected) {
      sendControlPacket(enforced, Number(steeringSlider.value), 0).catch(() => {});
    }
  };

  throttleTrack.addEventListener('pointerdown', (event) => {
    if (activePointerId !== null) return;

    activePointerId = event.pointerId;
    event.preventDefault();

    try {
      throttleTrack.setPointerCapture(event.pointerId);
    } catch (_) {}

    updateThrottleFromPointer(event);
  });

  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointerId) return;
    event.preventDefault();
    updateThrottleFromPointer(event);
  }, { passive: false });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetThrottle();
  });

  window.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetThrottle();
  });
}

function enforceReverseStopRule(value) {
  const currentSpeed = Number(throttleSlider.value) || 0;
  const previousDirection = currentSpeed > 0 ? 1 : currentSpeed < 0 ? -1 : 0;
  const newDirection = value > 0 ? 1 : value < 0 ? -1 : 0;

  if (previousDirection !== 0 && newDirection !== 0 && previousDirection !== newDirection) {
    return 0;
  }

  return value;
}

function calculateThrottleFromPointer(clientY) {
  const rect = throttleTrack.getBoundingClientRect();
  const progress = clamp((clientY - rect.top) / rect.height, 0, 1);
  const normalized = 1 - progress;
  const raw = (normalized * 200) - 100;
  return Math.round(clamp(raw, -100, 100));
}

function bindModeButtons() {
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      modeButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
      currentMode = button.dataset.mode;

      if (currentMode === 'tilt') {
        if (typeof DeviceOrientationEvent !== 'undefined') {
          if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(() => {
              window.addEventListener('deviceorientation', onTiltOrientation);
              centerTilt();
            }).catch(() => setStatus('Tilt denied'));
          } else {
            window.addEventListener('deviceorientation', onTiltOrientation);
            centerTilt();
          }
        }
      } else {
        window.removeEventListener('deviceorientation', onTiltOrientation);
        smoothedTiltSteering = 0;
      }
    });
  });
}

function centerTilt() {
  tiltReference = 0;
  smoothedTiltSteering = 0;
  steeringSlider.value = '0';
  lastKnownSteering = 0;
  updateSteeringVisual();

  if (isConnected) {
    sendControlPacket(Number(throttleSlider.value), 0, 0).catch(() => {});
  }
}

function onTiltOrientation(event) {
  const rawTilt = Number(typeof event.gamma === 'number' ? event.gamma : (event.beta ?? 0));
  const relative = rawTilt - tiltReference;
  const normalized = clamp(relative, -45, 45);
  const filtered = clamp(Math.round((normalized / 45) * 100), -100, 100);

  smoothedTiltSteering = smoothedTiltSteering * 0.7 + filtered * 0.3;
  const steering = clamp(Math.round(smoothedTiltSteering), -100, 100);

  steeringSlider.value = String(steering);
  lastKnownSteering = steering;
  updateSteeringVisual();

  if (isConnected) {
    sendControlPacket(Number(throttleSlider.value), steering, 0).catch(() => {});
  }
}

function bindInstallPrompt() {
  if (!('beforeinstallprompt' in window)) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });
}

function bindButtons() {
  connectBtn.addEventListener('click', async () => {
    if (isConnected) {
      await disconnectDevice();
      connectBtn.textContent = 'Connect';
      return;
    }

    await connectToDevice();
    connectBtn.textContent = isConnected ? 'Disconnect' : 'Connect';
  });

  centerBtn.addEventListener('click', () => {
    if (currentMode === 'tilt') {
      centerTilt();
      return;
    }

    resetSteering();
  });
}

function init() {
  bindSteeringControl();
  bindThrottleControl();
  bindModeButtons();
  bindButtons();
  bindInstallPrompt();

  throttleSlider.value = '0';
  steeringSlider.value = '0';
  lastKnownSpeed = 0;
  lastKnownSteering = 0;
  updateSteeringVisual();
  updateThrottleVisual();
}

init();
