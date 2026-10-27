from pathlib import Path, PurePosixPath

from django.core.management.base import BaseCommand, CommandError

from library.models import Playlist, Track
from library.services.importers import append_to_playlist


class Command(BaseCommand):
    help = (
        "Import playlists of the previous PHP version (text files with lines like "
        "'audio/<file>.mp3;<title>;<artist>'). Songs are matched by file name."
    )

    def add_arguments(self, parser):
        parser.add_argument("directory", help="Folder that contains the old *.txt playlists")
        parser.add_argument("--include-all", action="store_true", help="Also import playlist.txt (all songs)")

    def handle(self, directory, include_all, **options):
        folder = Path(directory)
        if not folder.is_dir():
            raise CommandError(f"{folder} is not a directory")

        by_name: dict[str, Track] = {}
        for track in Track.objects.all():
            by_name.setdefault(PurePosixPath(track.file_path).name.lower(), track)

        for file in sorted(folder.glob("*.txt")):
            if file.name == "playlist.txt" and not include_all:
                continue
            tracks, missing = [], 0
            for line in file.read_text(encoding="utf-8", errors="replace").splitlines():
                if not line.strip():
                    continue
                name = PurePosixPath(line.split(";")[0].strip()).name.lower()
                if name in by_name:
                    tracks.append(by_name[name])
                else:
                    missing += 1
            playlist = Playlist.objects.create(name=file.stem, description="Imported from the previous version")
            append_to_playlist(playlist, tracks)
            self.stdout.write(f"{file.stem}: {len(tracks)} songs ({missing} not found)")
