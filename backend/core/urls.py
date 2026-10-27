from django.urls import path

from core import views

urlpatterns = [
    path("health/", views.HealthView.as_view()),
    path("auth/session/", views.SessionView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("auth/password/", views.PasswordView.as_view()),
    path("auth/token/", views.TokenLoginView.as_view()),
    path("auth/token/logout/", views.TokenLogoutView.as_view()),
    path("auth/devices/", views.DeviceListView.as_view()),
    path("auth/devices/<int:pk>/", views.DeviceDetailView.as_view()),
    path("system/", views.SystemView.as_view()),
    path("system/update-ytdlp/", views.UpdateYtDlpView.as_view()),
]
