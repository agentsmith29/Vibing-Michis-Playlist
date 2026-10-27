import { useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";

import { errorMessage } from "../api/client";
import { useLogin } from "../api/queries";

export default function LoginPage() {
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-page">
      <Form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate({ username, password });
        }}
      >
        <div className="text-center mb-4">
          <img src="/mango_icon.png" alt="" width={64} height={64} />
          <h1 className="h3 fw-bold mt-3 mb-1">Michi Playlist</h1>
          <p className="text-body-secondary small mb-0">Sign in to your music</p>
        </div>
        <Form.Group className="mb-3" controlId="username">
          <Form.Label>Username</Form.Label>
          <Form.Control autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Form.Group>
        <Form.Group className="mb-4" controlId="password">
          <Form.Label>Password</Form.Label>
          <Form.Control
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Form.Group>
        {login.error && <Alert variant="danger">{errorMessage(login.error)}</Alert>}
        <Button type="submit" className="w-100 py-2" disabled={login.isPending}>
          {login.isPending ? <Spinner size="sm" /> : "Log in"}
        </Button>
      </Form>
    </div>
  );
}
