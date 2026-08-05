import { LookPickAuthPage } from "@/components/auth/LookPickAuthPage";
import { LookPickAuthShell } from "@/components/auth/LookPickAuthShell";

export default function SignInPage() {
  return (
    <LookPickAuthShell>
      <LookPickAuthPage mode="sign-in" />
    </LookPickAuthShell>
  );
}
