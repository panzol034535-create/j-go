type ClerkVerificationLike = {
  status?: string | null;
} | null | undefined;

type ClerkExternalAccountLike = {
  provider: string;
  verification?: ClerkVerificationLike;
};

type ClerkEmailAddressLike = {
  emailAddress?: string | null;
  verification?: ClerkVerificationLike;
};

export type ClerkLoginMethodUserLike = {
  externalAccounts?: ClerkExternalAccountLike[] | null;
  primaryEmailAddress?: ClerkEmailAddressLike | null;
  emailAddresses?: ClerkEmailAddressLike[] | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  oauth_google: "Google",
  line: "LINE",
  oauth_line: "LINE",
  apple: "Apple",
  oauth_apple: "Apple",
};

const LABEL_ORDER = ["Google", "LINE", "Apple", "Email"] as const;

function isVerified(verification: ClerkVerificationLike) {
  return verification?.status === "verified";
}

function normalizeProvider(provider: string) {
  return provider.trim().toLowerCase();
}

function getExternalAccountLabel(provider: string) {
  const normalized = normalizeProvider(provider);

  if (PROVIDER_LABELS[normalized]) {
    return PROVIDER_LABELS[normalized];
  }

  const withoutOAuthPrefix = normalized.replace(/^oauth_/, "");
  if (PROVIDER_LABELS[withoutOAuthPrefix]) {
    return PROVIDER_LABELS[withoutOAuthPrefix];
  }

  if (PROVIDER_LABELS[`oauth_${withoutOAuthPrefix}`]) {
    return PROVIDER_LABELS[`oauth_${withoutOAuthPrefix}`];
  }

  return null;
}

function hasVerifiedEmail(user: ClerkLoginMethodUserLike | null | undefined) {
  if (!user) {
    return false;
  }

  if (user.primaryEmailAddress?.emailAddress && isVerified(user.primaryEmailAddress.verification)) {
    return true;
  }

  return (user.emailAddresses ?? []).some(
    (emailAddress) => emailAddress.emailAddress && isVerified(emailAddress.verification),
  );
}

export function getClerkLoginMethodLabels(
  user: ClerkLoginMethodUserLike | null | undefined,
): string[] {
  const labels = new Set<string>();

  for (const account of user?.externalAccounts ?? []) {
    if (!isVerified(account.verification)) {
      continue;
    }

    const label = getExternalAccountLabel(account.provider);
    if (label) {
      labels.add(label);
    }
  }

  if (labels.size === 0 && hasVerifiedEmail(user)) {
    labels.add("Email");
  }

  if (labels.size === 0) {
    return ["Email"];
  }

  return LABEL_ORDER.filter((label) => labels.has(label));
}

export function formatClerkLoginMethods(user: ClerkLoginMethodUserLike | null | undefined) {
  const labels = getClerkLoginMethodLabels(user);

  if (labels.length === 0) {
    return "其他";
  }

  return labels.join("、");
}
