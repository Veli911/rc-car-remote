# RC Car Web Remote

This is a browser-based remote control UI for the RC car. It uses the Web Bluetooth API and can be installed as a PWA on Android through the browser.

## Setup

Open the folder in a static web server.

```bash
cd webapp
python -m http.server 4173
```

Then open:

- http://localhost:4173

## Install on Android

1. Open the page in Chrome on Android.
2. Tap the menu.
3. Choose "Add to Home screen".
4. The app is installed like an Android app.

## Notes

- The app requires Bluetooth permission and the ESP32 device with the matching service UUID.
- This is a starter browser implementation using JavaScript only.


## Steering update
- compact left-aligned steering track
- full -100..+100 range mapped from the left edge to the right edge
- spring return to center on release

## Offline PWA
This version registers `service-worker.js` and pre-caches the application shell.
After the first successful HTTPS load/install, the UI can open without Internet.
Bluetooth communication remains direct between the Android phone and the ESP32.


## v3 multitouch fix
Steering and throttle now track separate Pointer Events by pointerId, allowing true simultaneous two-thumb control without one control resetting or following the other finger.


## Tilt steering update

- Tilt steering now follows the phone's current screen orientation, including landscape.
- The current holding angle is calibrated as neutral when Tilt is enabled or Center is pressed.
- A 3 degree dead zone, progressive response curve, and smoothing make small steering corrections gentler.
- Full steering is reached only after a deliberate larger tilt (about 40 degrees from the calibrated center).


## Tilt + screen behavior (v5)

- Tilt reaches approximately 100% steering at 40 degrees from the calibrated center.
- 2 degree center dead zone.
- Faster smoothing for a more direct response.
- Screen Wake Lock is requested while the app is visible, even before BLE connection.
- Wake Lock is released when the app goes to the background.


## v7 minimal tilt fix

- Keeps the proven tilt40 behavior and 40-degree full scale.
- Returning from Tilt to Manual automatically resets steering to 0.
- Adds a small Euler-angle discontinuity guard so reversed/steep phone positions do not instantly jump to full steering.
