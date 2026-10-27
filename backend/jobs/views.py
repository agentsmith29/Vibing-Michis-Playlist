from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from jobs.models import Job
from jobs.serializers import JobSerializer

FINISHED = (Job.Status.DONE, Job.Status.FAILED, Job.Status.CANCELLED)


class JobViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Jobs are shared: every logged-in user sees the library's import activity."""

    serializer_class = JobSerializer
    pagination_class = None

    def get_queryset(self):
        return Job.objects.order_by("-created_at")

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if request.query_params.get("active"):
            queryset = queryset.filter(status__in=Job.ACTIVE_STATUSES)
        if kind := request.query_params.get("kind"):
            queryset = queryset.filter(kind=kind)
        return Response(JobSerializer(queryset[:50], many=True).data)

    def destroy(self, request, *args, **kwargs):
        job = self.get_object()
        if job.status not in FINISHED:
            return Response({"detail": "Only finished jobs can be removed"}, status=status.HTTP_409_CONFLICT)
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"])
    def clear(self, request):
        deleted, _ = Job.objects.filter(status__in=FINISHED).delete()
        return Response({"deleted": deleted})
