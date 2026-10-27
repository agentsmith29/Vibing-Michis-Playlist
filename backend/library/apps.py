from django.apps import AppConfig


class LibraryConfig(AppConfig):
    name = "library"

    def ready(self):
        from library import tasks  # noqa: F401  (registers the job handlers)
