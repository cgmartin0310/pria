import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useNavigate } from "react-router";
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import App from "./App.js";
import { setAuthTokenGetter } from "./lib/api.js";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env["VITE_CLERK_PUBLISHABLE_KEY"];

if (!PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to your .env (see .env.example)."
  );
}

/**
 * Registers Clerk's session-token getter with the API client so every request
 * carries a bearer token. Cleared on unmount.
 */
function ApiAuthBridge() {
  const { getToken } = useClerkAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

/** Bridges Clerk's redirect callbacks to react-router navigation. */
function ClerkWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/sign-in"
    >
      <ApiAuthBridge />
      {children}
    </ClerkProvider>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClerkWithRouter>
        <App />
      </ClerkWithRouter>
    </BrowserRouter>
  </React.StrictMode>
);
