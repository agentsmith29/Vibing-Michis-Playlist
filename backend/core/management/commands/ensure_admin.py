import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create the initial user from APP_USERNAME / APP_PASSWORD if it does not exist yet."

    def handle(self, *args, **options):
        username = os.environ.get("APP_USERNAME", "admin")
        password = os.environ.get("APP_PASSWORD")
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            self.stdout.write(f"User {username!r} already exists")
            return
        if not password:
            raise CommandError("Set APP_PASSWORD to create the initial user")
        User.objects.create_superuser(username=username, password=password, email="")
        self.stdout.write(self.style.SUCCESS(f"Created user {username!r}"))
