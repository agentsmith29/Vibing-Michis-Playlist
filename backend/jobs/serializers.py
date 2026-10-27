from rest_framework import serializers

from jobs.models import Job


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            "id", "kind", "status", "progress", "message", "payload", "result", "error",
            "created_at", "started_at", "finished_at", "updated_at",
        ]
        read_only_fields = fields
