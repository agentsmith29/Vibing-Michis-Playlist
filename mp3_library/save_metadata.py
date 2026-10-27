import os
import sys
import json
import shutil
import urllib.request
import urllib.parse
import eyed3
from eyed3.core import Date

MUSIC_FOLDER = '../michi-playlist/audio/'

def get_image_bytes(image_path):
    """
    Lädt Bilddaten von einer Web-URL oder liest sie von einer lokalen Datei.
    Rückgabe: (bytes, mime_type) oder (None, None) bei Fehler.
    """
    if not image_path:
        return None, None

    parsed = urllib.parse.urlparse(image_path)
    
    # 1. Fall: Es ist eine Web-URL (http/https)
    if parsed.scheme in ('http', 'https'):
        try:
            req = urllib.request.Request(
                image_path, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                image_bytes = response.read()
                content_type = response.headers.get('Content-Type', '').lower()
                
                mime_type = "image/png" if "png" in content_type else "image/jpeg"
                return image_bytes, mime_type
        except Exception:
            return None, None

    # 2. Fall: Es ist eine lokale Datei
    elif os.path.exists(image_path):
        try:
            mime_type = "image/png" if image_path.lower().endswith('.png') else "image/jpeg"
            with open(image_path, "rb") as img_file:
                return img_file.read(), mime_type
        except Exception:
            return None, None

    return None, None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Fehlende Eingabedaten"}))
        sys.exit(1)

    try:
        data = json.loads(sys.argv[1])
    except Exception as e:
        print(json.dumps({"error": f"Ungültiges JSON: {str(e)}"}))
        sys.exit(1)

    temp_audio_path = data.get('temp_audio_path')
    image_path = data.get('image_path')
    artist = data.get('artist', 'Unknown Artist')
    title = data.get('title', 'Unknown Title')
    album = data.get('album', 'Unknown Album')
    genre = data.get('genre', 'Pop')
    
    # Robuste Jahreseingabe
    try:
        raw_year = data.get('year')
        year = int(raw_year) if raw_year else 2024
    except (ValueError, TypeError):
        year = 2024

    if not temp_audio_path or not os.path.exists(temp_audio_path):
        print(json.dumps({"error": "Quelldatei nicht gefunden."}))
        sys.exit(1)

    # ID3-Tags schreiben
    audiofile = eyed3.load(temp_audio_path)
    if audiofile.tag is None:
        audiofile.initTag(version=(2, 3, 0))
    else:
        audiofile.tag.version = (2, 3, 0)

    audiofile.tag.artist = artist
    audiofile.tag.album_artist = artist
    audiofile.tag.title = title
    audiofile.tag.album = album
    audiofile.tag.genre = genre
    audiofile.tag.year = year
    audiofile.tag.release_date = Date(year=year)
    audiofile.tag.recording_date = Date(year=year)

    # Album Cover einbetten (URL oder Lokale Datei)
    imagedata, mime_type = get_image_bytes(image_path)
    if imagedata and mime_type:
        audiofile.tag.images.set(3, imagedata, mime_type, u"cover")

    audiofile.tag.save()

    # Datei umbenennen und verschieben
    new_filename = f"{title}.mp3"
    # Ungültige Dateinamen-Zeichen entfernen
    new_filename = "".join(c for c in new_filename if c not in r'\/:*?"<>|')
    
    final_path = os.path.join(MUSIC_FOLDER, new_filename)
    
    shutil.move(temp_audio_path, final_path)

    # Lokales temporäres Bild aufräumen (nur wenn es KEINE Web-URL war)
    if image_path and not image_path.startswith(('http://', 'https://')) and os.path.exists(image_path):
        try:
            os.remove(image_path)
        except OSError:
            pass

    print(json.dumps({"status": "success", "file_path": final_path}))

if __name__ == '__main__':
    main()
