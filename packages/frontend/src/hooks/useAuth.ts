/**
 * useAuth hook — Clerk integration stub.
 *
 * Production: Replace with @clerk/clerk-react hooks.
 * The stub returns a mock authenticated user for development.
 */

export interface AuthUser {
  id: string;
  practiceId: string;
  email: string;
  name: string;
  role: "admin" | "therapist" | "billing";
}

export function useAuth() {
  // Stub: returns a mock authenticated session
  const user: AuthUser = {
    id: "user_stub_001",
    practiceId: "practice_stub_001",
    email: "demo@pria.health",
    name: "Dr. Sarah Chen",
    role: "admin",
  };

  return {
    user,
    isLoaded: true,
    isSignedIn: true,
    signIn: async () => {
      console.log("[useAuth] Sign in — replace with Clerk");
    },
    signOut: async () => {
      console.log("[useAuth] Sign out — replace with Clerk");
    },
  };
}
