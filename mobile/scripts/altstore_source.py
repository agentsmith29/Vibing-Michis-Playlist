"""Write an AltStore source (https://faq.altstore.io/developers/make-a-source) for an IPA.

All app facts (bundle id, version, build, minimum iOS, privacy usage descriptions) are read
from the IPA itself, because AltStore refuses apps whose details don't match their source.

usage: altstore_source.py IPA BASE_URL OUTPUT_JSON
  BASE_URL: public folder that will contain the IPA and icon.png, e.g.
            https://agentsmith29.github.io/michi-playlist
"""

import datetime
import json
import plistlib
import sys
import zipfile
from pathlib import Path

SOURCE_ID = "io.github.agentsmith29.michi-playlist"
TINT = "#ff9f1c"
DESCRIPTION = (
    "Private music player for your Michi Playlist server: stream your library, "
    "download songs and playlists for offline listening, background playback "
    "and lock-screen controls. Connect through your VPN."
)


def read_info_plist(ipa: Path) -> dict:
    with zipfile.ZipFile(ipa) as archive:
        name = next(
            n for n in archive.namelist()
            if n.startswith("Payload/") and n.endswith(".app/Info.plist") and n.count("/") == 2
        )
        return plistlib.loads(archive.read(name))


def build_source(ipa: Path, base_url: str) -> dict:
    info = read_info_plist(ipa)
    base_url = base_url.rstrip("/")
    version = {
        "version": info["CFBundleShortVersionString"],
        "buildVersion": str(info["CFBundleVersion"]),
        "date": datetime.date.today().isoformat(),
        "localizedDescription": f"Michi Playlist {info['CFBundleShortVersionString']}",
        "downloadURL": f"{base_url}/{ipa.name}",
        "size": ipa.stat().st_size,
        "minOSVersion": info.get("MinimumOSVersion", "16.0"),
    }
    privacy = {key: value for key, value in info.items() if key.startswith("NS") and key.endswith("UsageDescription")}
    app = {
        "name": info.get("CFBundleDisplayName") or info.get("CFBundleName", "Michi Playlist"),
        "bundleIdentifier": info["CFBundleIdentifier"],
        "developerName": "agentsmith29",
        "subtitle": "Your private music library",
        "localizedDescription": DESCRIPTION,
        "iconURL": f"{base_url}/icon.png",
        "tintColor": TINT,
        "category": "entertainment",
        "screenshots": [],
        "versions": [version],
        # The IPA is built without code signing, so it carries no entitlements of its own.
        "appPermissions": {"entitlements": [], "privacy": privacy},
        # Fields read by older AltStore versions.
        "version": version["version"],
        "versionDate": version["date"],
        "downloadURL": version["downloadURL"],
        "size": version["size"],
    }
    return {
        "name": "Michi Playlist",
        "identifier": SOURCE_ID,
        "subtitle": "Private music player",
        "description": DESCRIPTION,
        "iconURL": f"{base_url}/icon.png",
        "website": "https://github.com/agentsmith29/Vibing-Michis-Playlist",
        "tintColor": TINT,
        "featuredApps": [app["bundleIdentifier"]],
        "apps": [app],
        "news": [],
    }


if __name__ == "__main__":
    ipa_path, base, output = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    source = build_source(ipa_path, base)
    output.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")
    app = source["apps"][0]
    print(f"{output}: {app['bundleIdentifier']} {app['version']} ({app['versions'][0]['buildVersion']}), "
          f"{app['size']} bytes, privacy keys: {sorted(app['appPermissions']['privacy'])}")
