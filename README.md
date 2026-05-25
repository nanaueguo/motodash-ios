# MotoDash

MotoDash is a SwiftUI iOS riding dashboard inspired by CarPlay-style glanceable panels.

## Features

- Large landscape dashboard for handlebar-mounted phones
- Current time
- GPS speed in km/h
- Maximum speed
- Lean angle from Core Motion device attitude
- Pitch, heading, altitude, GPS and IMU status

## Run

Open `MotoDash.xcodeproj` in Xcode on macOS, set your development team, then run on a physical iPhone. GPS speed and motion data are most useful on a real device.

## PWA

The `pwa/` folder contains a no-build web version for iPhone Safari. Serve it over HTTPS, open it on iPhone, then use Safari's Share button to add it to the Home Screen.

For local desktop preview:

```powershell
cd pwa
python -m http.server 4173
```

## Notes

Use this as a glanceable riding aid only. Mount the phone securely and do not interact with the app while riding.
