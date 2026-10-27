from django.core.management.base import BaseCommand

from library.services.indexer import scan_library


class Command(BaseCommand):
    help = "Scan the music folder and update the database."

    def handle(self, *args, **options):
        stats = scan_library(progress=lambda percent, message: self.stdout.write(f"{percent:3d}% {message}"))
        self.stdout.write(self.style.SUCCESS(f"Done: {stats}"))
