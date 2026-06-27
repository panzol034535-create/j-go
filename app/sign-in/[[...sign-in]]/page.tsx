import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
      <SignIn fallbackRedirectUrl="/" signUpUrl="/sign-up" />
    </main>
  );
}
