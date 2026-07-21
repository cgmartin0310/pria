/**
 * useAuth — app-level auth hook.
 *
 * Combines Clerk's session state (identity, sign-out) with PRIA's own user
 * profile from GET /auth/me (practiceId, role, practice). The backend resolves
 * or provisions the PRIA user on first authenticated request, so the profile
 * becomes available shortly after Clerk reports the user as signed in.
 */
import { useEffect, useState } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { authApi, type CurrentUser } from "@/lib/api.js";

export type AuthUser = CurrentUser;

export function useAuth() {
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded || !isSignedIn) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    authApi
      .me()
      .then((res) => {
        if (!cancelled) setProfile(res.data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch when the Clerk user id changes (sign-in/out/switch).
  }, [isLoaded, isSignedIn, clerkUser?.id]);

  return {
    /** PRIA profile: practiceId, role, practice. Null until /auth/me resolves. */
    user: profile,
    isLoaded,
    isSignedIn: !!isSignedIn,
    profileLoading,
    signOut: () => signOut(),
  };
}
