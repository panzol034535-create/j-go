import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
      <SignUp fallbackRedirectUrl="/" signInUrl="/sign-in" />
    </main>
  );
}
