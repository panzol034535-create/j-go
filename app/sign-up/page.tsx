import { LookPickAuthPage } from "@/components/auth/LookPickAuthPage";
import { LookPickAuthShell } from "@/components/auth/LookPickAuthShell";

export default function SignUpPage() {
  return (
    <LookPickAuthShell>
      <LookPickAuthPage mode="sign-up" />
    </LookPickAuthShell>
  );
}
