"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

// Rendered only once the user is signed in. It sends managers to /manager
// and owners/investors to /dashboard.
function RedirectByGroup() {
  const router = useRouter();

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const groups =
        (session.tokens?.idToken?.payload["cognito:groups"] as
          | string[]
          | undefined) ?? [];
      router.push(groups.includes("Managers") ? "/manager" : "/dashboard");
    });
  }, [router]);

  return <p className="text-center text-gray-600">Signing you in...</p>;
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Restaurant Ops Dashboard
          </h1>
          <p className="text-gray-500 mt-2">Sign in to access your dashboard</p>
        </div>
        <Authenticator hideSignUp={true} socialProviders={["google"]}>
          <RedirectByGroup />
        </Authenticator>
      </div>
    </div>
  );
}
