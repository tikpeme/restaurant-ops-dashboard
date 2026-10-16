"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "aws-amplify/auth";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    getCurrentUser()
      .then(() => router.push("/dashboard"))
      .catch(() => {});
  }, [router]);

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
          {({ signOut, user }) => (
            <div className="text-center">
              <p className="text-gray-700">
                Welcome, {user?.signInDetails?.loginId}
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </Authenticator>
      </div>
    </div>
  );
}
