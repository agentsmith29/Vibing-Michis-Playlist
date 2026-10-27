from django.contrib import admin

from core.models import DeviceToken


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "hint", "created_at", "last_used_at")
    readonly_fields = ("key_hash", "hint", "created_at", "last_used_at")
