"use client";

import { signOut } from "aws-amplify/auth";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    // Clears the tokens Amplify stored in the browser
    await signOut();
    router.push("/");
  };

  return (
    <button
      onClick={handleSignOut}
      className="text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2"
    >
      Sign out
    </button>
  );
}
