"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export function LookPickSsoCallback() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-neutral-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold text-neutral-600">正在完成登入，請稍候...</p>
        <AuthenticateWithRedirectCallback
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        />
      </div>
    </main>
  );
}
