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
