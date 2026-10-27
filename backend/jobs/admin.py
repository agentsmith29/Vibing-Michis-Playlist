from django.contrib import admin

from jobs.models import Job


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("kind", "status", "progress", "message", "created_at")
    list_filter = ("kind", "status")
    readonly_fields = ("created_at", "started_at", "finished_at", "updated_at")
