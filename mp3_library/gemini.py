import os
import sys
import re
import json
import urllib.parse
import requests
from difflib import SequenceMatcher
import yt_dlp

CACHE_AUDIO = 'cache_audio'
CACHE_IMAGE = 'cache_image'
IMAGE_SIZE = 800

# Ordner anlegen, falls nicht vorhanden
os.makedirs(CACHE_AUDIO, exist_ok=True)
os.makedirs(CACHE_IMAGE, exist_ok=True)

def similar(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def title_case(string):
    if not string:
        return ""
    return ' '.join(word.capitalize() for word in string.split())

def clean_filename(name):
    # Entferne Klammern, Sonderzeichen und gängige YouTube-Zusätze
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'\[.*?\]', '', name)
    name = re.sub(r'[^\w\s-]', '', name)
    name = name.replace(' -', '').strip()
    return name

def fetch_itunes_metadata(search_query):
    encoded_query = urllib.parse.quote_plus(search_query.lower())
    url = f"https://itunes.apple.com/search?term={encoded_query}&country=us&entity=song&limit=5"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
    except Exception as e:
        return [], ""

    results = data.get('results', [])
    if not results:
        return [], ""

    # Treffer nach Ähnlichkeit bewerten
    scored_results = []
    for track in results:
        artist = track.get('artistName', '')
        title = track.get('trackName', '')
        album = track.get('collectionName', '')
        
        # Ähnlichkeitsberechnung
        score = (similar(search_query, artist) + similar(search_query, title)) / 2
        
        if 'remix' in album.lower() or 'mix' in album.lower():
            score *= 0.8
        if 'single' in album.lower():
            score *= 0.95

        scored_results.append((score, track))

    # Sortieren nach höchstem Score
    scored_results.sort(key=lambda x: x[0], reverse=True)

    alternatives = []
    for score, track in scored_results:
        small_image_url = track.get('artworkUrl100', '')
        large_image_url = small_image_url.replace('100x100', f'{IMAGE_SIZE}x{IMAGE_SIZE}')
        
        alternatives.append({
            'artist': title_case(track.get('artistName', '')),
            'title': title_case(track.get('trackName', '')),
            'album': title_case(track.get('collectionName', '')),
            'genre': title_case(track.get('primaryGenreName', '')),
            'year': track.get('releaseDate', '')[0:4] if track.get('releaseDate') else "2024",
            'image_path': large_image_url
        })

    # Artwork für den besten Treffer lokal im Cache speichern
    best_image_url = alternatives[0]['image_path']
    clean_name = re.sub(r'\W+', '_', search_query)
    image_file_path = os.path.join(CACHE_IMAGE, f"{clean_name}.jpg")
    
    try:
        if best_image_url:
            img_data = requests.get(best_image_url, timeout=10).content
            with open(image_file_path, 'wb') as handler:
                handler.write(img_data)
        else:
            image_file_path = ""
    except Exception:
        image_file_path = ""

    return alternatives, image_file_path

def main():

    if len(sys.argv) < 2:
        print(json.dumps({"error": "Fehlende URL"}))
        sys.exit(1)

    url = sys.argv[1].split('&')[0]
    search_text = sys.argv[2] if len(sys.argv) >= 3 else None

    # YouTube Download
    out_template = os.path.join(CACHE_AUDIO, '%(id)s.%(ext)s')
    ydl_opts = {
        'quiet': True,
        'noprogress': True,
        'format': 'm4a/bestaudio/best',
        'outtmpl': out_template,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
        }]
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_title = info.get('title', 'song')
            video_id = info.get('id')
            mp3_path = os.path.join(CACHE_AUDIO, f"{video_id}.mp3")
    except Exception as e:
        print(json.dumps({"error": f"Download fehlgeschlagen: {str(e)}"}))
        sys.exit(1)

    # Suchbegriff bestimmen
    query = search_text if search_text else clean_filename(video_title)
    
    # Metadaten suchen (liefert nun eine Liste aller Alternativen)
    alternatives, image_path = fetch_itunes_metadata(query)

    # Fallback falls iTunes nichts findet
    if not alternatives:
        fallback_tag = {
            'artist': 'Unknown Artist',
            'title': title_case(clean_filename(video_title)),
            'album': 'Single',
            'genre': 'Pop',
            'year': '2024',
            'image_path': ''
        }
        tags = fallback_tag
        alternatives = [fallback_tag]
        image_path = ""
    else:
        tags = alternatives[0] # Der beste Treffer ist der Standard

    result = {
        'status': 'success',
        'temp_audio_path': mp3_path,
        'image_path': image_path,
        'tags': tags,
        'alternatives': alternatives # Alle bis zu 5 Treffer an PHP übergeben
    }

    # JSON-Ausgabe für PHP
    print(json.dumps(result))


if __name__ == '__main__':
    main()

# from tinytag import TinyTag
import glob
from eyed3 import id3
import os

# from variables import file_path_cache, file_path_audio, playlist_path
file_path_audio = '../michi-playlist/audio'
playlist_path = '../michi-playlist/playlists/'


files = glob.glob(file_path_audio+'/*.mp3')
files.sort()

tag = id3.Tag()

playlist = open(playlist_path + 'playlist.txt', 'w')
# print(len(files))

for f in files:
    # try:
        # tag = TinyTag.get(f)
    tag.parse(f)
    # except:
        # print('error', f)
        # continue
    f_name = f.split('/')[-1]
    if tag.artist == "":
        print(f, 'artist')
        # break
    if tag.title == "":
        print(f, 'title')
        # tag.title = f_name[:-4]
        # playlist.write('<div data-src="audio/{}" class="song" style> {}<br>{}</div>\n'.format(f_name, tag.title, tag.artist))
        # continue


    # playlist.write('<div data-src="audio/{}" class="song" style> {}<br>{}</div>\n'.format(f_name, tag.title, tag.artist))
    playlist.write('audio/{};{};{}\n'.format(f_name.replace(';',''), tag.title.replace(';',''), tag.artist.replace(';','')))

playlist.close()


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
