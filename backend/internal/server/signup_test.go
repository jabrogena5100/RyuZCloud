package server_test

import (
	"net/http"
	"testing"

	"github.com/jabrogena5100/RyuCloud/backend/internal/config"
	"github.com/jabrogena5100/RyuCloud/backend/internal/integrations"
)

func newClosedSignupApp(t *testing.T, allowed ...string) *testApp {
	t.Helper()
	cfg := testConfig
	cfg.Signup = config.SignupConfig{Closed: true, AllowedEmails: allowed}
	return newTestAppWithConfig(t, cfg, integrations.NewMemoryStorage())
}

func TestSignupStatusIsOpenByDefault(t *testing.T) {
	resp := newTestApp(t).browser().get("/api/v1/auth/signup")
	expectStatus(t, resp, http.StatusOK)
	if open, _ := resp.object(t)["open"].(bool); !open {
		t.Fatalf("want open: true, got %s", resp.body)
	}
}

func TestClosedSignupRefusesNewAccounts(t *testing.T) {
	b := newClosedSignupApp(t, "library@example.com").browser()

	status := b.get("/api/v1/auth/signup")
	expectStatus(t, status, http.StatusOK)
	if open, ok := status.object(t)["open"].(bool); !ok || open {
		t.Fatalf("want open: false, got %s", status.body)
	}

	resp := b.register("stranger@example.com")
	expectStatus(t, resp, http.StatusForbidden)
	if resp.errorCode(t) != "signup_closed" {
		t.Fatalf("unexpected body: %s", resp.body)
	}
	if len(resp.header.Values("Set-Cookie")) != 0 {
		t.Error("a refused sign-up must not start a session")
	}
	expectStatus(t, b.get("/api/v1/auth/me"), http.StatusUnauthorized)
}

func TestClosedSignupStillAdmitsAllowListedAddresses(t *testing.T) {
	b := newClosedSignupApp(t, "library@example.com").browser()
	// Email addresses are compared lower-cased, as the API stores them.
	expectStatus(t, b.register("Library@Example.com"), http.StatusCreated)
	expectStatus(t, b.get("/api/v1/auth/me"), http.StatusOK)
}

func TestClosedSignupStillValidatesInput(t *testing.T) {
	b := newClosedSignupApp(t).browser()
	resp := b.post("/api/v1/auth/register", map[string]any{"email": "not-an-email", "password": "x"})
	expectStatus(t, resp, http.StatusUnprocessableEntity)
}

func TestClosedSignupDoesNotAffectSignIn(t *testing.T) {
	b := newClosedSignupApp(t, "library@example.com").browser()
	expectStatus(t, b.register("library@example.com"), http.StatusCreated)
	expectStatus(t, b.post("/api/v1/auth/logout", nil), http.StatusNoContent)
	expectStatus(t, b.login("library@example.com", defaultPassword, nil), http.StatusOK)
}
