from rest_framework.routers import SimpleRouter

from jobs.views import JobViewSet

router = SimpleRouter()
router.register("jobs", JobViewSet, basename="job")

urlpatterns = router.urls
