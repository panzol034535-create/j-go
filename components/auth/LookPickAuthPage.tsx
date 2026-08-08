"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { LookPickWordmark } from "@/components/LookPickWordmark";
import { getClerkErrorMessage } from "@/lib/auth/clerk-error-message";

type OAuthStrategy = "oauth_apple" | "oauth_google" | "oauth_line";

type LookPickAuthPageProps = {
  mode: "sign-in" | "sign-up";
};

type AuthStep = "methods" | "email" | "verify";

const OAUTH_PROVIDERS: Array<{ strategy: OAuthStrategy; label: string }> = [
  { strategy: "oauth_apple", label: "使用 Apple 登入" },
  { strategy: "oauth_google", label: "使用 Google 登入" },
  { strategy: "oauth_line", label: "使用 LINE 登入" },
];

function resolveAuthMode(pathname: string | null, mode: LookPickAuthPageProps["mode"]) {
  if (pathname?.startsWith("/sign-up")) {
    return "sign-up" as const;
  }

  if (pathname?.startsWith("/sign-in")) {
    return "sign-in" as const;
  }

  return mode;
}

async function waitForValue<T>(getValue: () => T | null | undefined, timeoutMs = 8000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = getValue();
    if (value) {
      return value;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 100);
    });
  }

  return null;
}

export function LookPickAuthPage({ mode }: LookPickAuthPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { client, setActive: clerkSetActive } = useClerk();
  const { isSignedIn } = useUser();
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const authMode = resolveAuthMode(pathname, mode);
  const isSignIn = authMode === "sign-in";

  const signInRef = useRef(signIn ?? client?.signIn);
  const signUpRef = useRef(signUp ?? client?.signUp);

  const [step, setStep] = useState<AuthStep>("methods");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const title = isSignIn ? "登入 LookPick" : "註冊 LookPick";
  const subtitle = isSignIn
    ? "登入後即可查看收藏、訂單、購物車與 AI 穿搭紀錄"
    : "建立帳號後即可收藏商品、查看訂單與結帳";

  useEffect(() => {
    signInRef.current = signIn ?? client?.signIn;
    signUpRef.current = signUp ?? client?.signUp;
  }, [signIn, signUp, client]);

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn, router]);

  function getSignInResource() {
    return signInRef.current ?? signIn ?? client?.signIn ?? null;
  }

  function getSignUpResource() {
    return signUpRef.current ?? signUp ?? client?.signUp ?? null;
  }

  async function resolveSignInResource() {
    const existing = getSignInResource();
    if (existing) {
      return existing;
    }

    return waitForValue(() => getSignInResource());
  }

  async function resolveSignUpResource() {
    const existing = getSignUpResource();
    if (existing) {
      return existing;
    }

    return waitForValue(() => getSignUpResource());
  }

  function getAuthErrorMessage(oauthError: unknown, strategy: OAuthStrategy) {
    const message = getClerkErrorMessage(oauthError);

    if (strategy === "oauth_apple") {
      const normalized = message.toLowerCase();
      if (
        normalized.includes("apple") ||
        normalized.includes("provider") ||
        normalized.includes("not allowed") ||
        normalized.includes("oauth")
      ) {
        return "Apple 登入尚未開通";
      }
    }

    return message;
  }

  async function finalizeSession(sessionId: string | null | undefined) {
    if (!sessionId) {
      throw new Error("無法建立登入狀態，請稍後再試");
    }

    const setActive = isSignIn ? setSignInActive ?? clerkSetActive : setSignUpActive ?? clerkSetActive;
    if (!setActive) {
      throw new Error("登入服務尚未就緒，請重新整理頁面");
    }

    await setActive({
      session: sessionId,
      navigate: () => {
        router.push("/");
      },
    });
  }

  async function handleOAuth(strategy: OAuthStrategy) {
    setError("");
    setLoading(true);

    try {
      if (isSignIn) {
        const signInResource = await resolveSignInResource();
        if (!signInResource) {
          throw new Error("登入服務初始化中，請稍後再試");
        }

        await signInResource.authenticateWithRedirect({
          strategy,
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/",
        });
        return;
      }

      const signUpResource = await resolveSignUpResource();
      if (!signUpResource) {
        throw new Error("註冊服務初始化中，請稍後再試");
      }

      await signUpResource.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      });
    } catch (oauthError) {
      setError(getAuthErrorMessage(oauthError, strategy));
      setLoading(false);
    }
  }

  async function handleSendEmailCode(event: React.FormEvent) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("請輸入 Email");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (isSignIn) {
        const signInResource = await resolveSignInResource();
        if (!signInResource) {
          throw new Error("登入服務初始化中，請稍後再試");
        }

        await signInResource.create({ identifier: trimmedEmail });
        const emailCodeFactor = signInResource.supportedFirstFactors?.find(
          (factor) => factor.strategy === "email_code",
        );

        if (!emailCodeFactor || emailCodeFactor.strategy !== "email_code") {
          throw new Error("此 Email 無法使用驗證碼登入，請改用其他方式");
        }

        await signInResource.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
      } else {
        const signUpResource = await resolveSignUpResource();
        if (!signUpResource) {
          throw new Error("註冊服務初始化中，請稍後再試");
        }

        await signUpResource.create({ emailAddress: trimmedEmail });
        await signUpResource.prepareEmailAddressVerification({ strategy: "email_code" });
      }

      setStep("verify");
    } catch (sendError) {
      setError(getClerkErrorMessage(sendError));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("請輸入驗證碼");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (isSignIn) {
        const signInResource = await resolveSignInResource();
        if (!signInResource) {
          throw new Error("登入服務初始化中，請稍後再試");
        }

        const result = await signInResource.attemptFirstFactor({
          strategy: "email_code",
          code: trimmedCode,
        });

        if (result.status === "complete") {
          await finalizeSession(result.createdSessionId);
          return;
        }

        throw new Error("驗證尚未完成，請稍後再試");
      }

      const signUpResource = await resolveSignUpResource();
      if (!signUpResource) {
        throw new Error("註冊服務初始化中，請稍後再試");
      }

      const result = await signUpResource.attemptEmailAddressVerification({ code: trimmedCode });

      if (result.status === "complete") {
        await finalizeSession(result.createdSessionId);
        return;
      }

      throw new Error("驗證尚未完成，請稍後再試");
    } catch (verifyError) {
      setError(getClerkErrorMessage(verifyError));
    } finally {
      setLoading(false);
    }
  }

  const authReady = isSignIn
    ? Boolean(getSignInResource()) || signInLoaded
    : Boolean(getSignUpResource()) || signUpLoaded;

  return (
    <div className="rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm">
      <div className="mb-8 text-center">
        <LookPickWordmark className="mx-auto text-[2rem]" />
        <h1 className="mt-6 text-2xl font-black tracking-tight text-neutral-900">{title}</h1>
        <p className="mt-2 text-sm font-medium leading-6 text-neutral-500">{subtitle}</p>
      </div>

      {!authReady ? (
        <p className="mb-4 text-center text-xs font-medium text-neutral-400">正在連線登入服務...</p>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      {step === "methods" ? (
        <div className="space-y-3">
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider.strategy}
              type="button"
              disabled={loading}
              onClick={() => void handleOAuth(provider.strategy)}
              className="flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold text-neutral-900 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {provider.label}
            </button>
          ))}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setError("");
              setStep("email");
            }}
            className="flex w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSignIn ? "Email 登入" : "Email 註冊"}
          </button>
        </div>
      ) : null}

      {step === "email" ? (
        <form className="space-y-4" onSubmit={handleSendEmailCode}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-neutral-700">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="請輸入 Email"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-neutral-900"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "寄送中..." : "寄送驗證碼"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setError("");
              setStep("methods");
            }}
            className="w-full text-sm font-bold text-neutral-500"
          >
            返回登入方式
          </button>
        </form>
      ) : null}

      {step === "verify" ? (
        <form className="space-y-4" onSubmit={handleVerifyCode}>
          <p className="text-sm font-medium text-neutral-500">
            驗證碼已寄至 <span className="font-bold text-neutral-900">{email}</span>
          </p>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-neutral-700">驗證碼</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="請輸入 Email 驗證碼"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-neutral-900"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "驗證中..." : isSignIn ? "完成登入" : "完成註冊"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setError("");
              setCode("");
              setStep("email");
            }}
            className="w-full text-sm font-bold text-neutral-500"
          >
            重新輸入 Email
          </button>
        </form>
      ) : null}

      <p className="mt-8 text-center text-sm font-medium text-neutral-500">
        {isSignIn ? "還沒有帳號？" : "已經有帳號？"}
        <Link
          href={isSignIn ? "/sign-up" : "/sign-in"}
          className="ml-2 font-bold text-neutral-900 underline"
        >
          {isSignIn ? "立即註冊" : "立即登入"}
        </Link>
      </p>
    </div>
  );
}
