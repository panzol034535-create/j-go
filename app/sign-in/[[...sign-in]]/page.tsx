import { SignIn } from "@clerk/nextjs";
import { LOOKPICK_BRAND } from "@/lib/brand";

export default function SignInPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="grid w-full max-w-5xl items-center gap-8 md:grid-cols-[minmax(0,1fr)_420px]">
        <section className="hidden overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-neutral-100 md:block">
          <img
            src={LOOKPICK_BRAND.brandHeroSrc}
            alt={LOOKPICK_BRAND.name}
            className="h-full max-h-[560px] w-full object-cover"
          />
        </section>
        <div className="mx-auto w-full max-w-[420px]">
          <SignIn fallbackRedirectUrl="/" signUpUrl="/sign-up" />
        </div>
      </div>
    </main>
  );
}
