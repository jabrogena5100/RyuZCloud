"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  return (
    <AuthSplit
      mode="register"
      title="Create your account"
      hint="Upload a clip and watch the worker turn it into a stream."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-sage underline underline-offset-4 hover:text-sage-hover">
            Sign in
          </Link>
          . Demo site: no email is ever sent.
        </>
      }
    >
      <AuthForm
        mode="register"
        onSubmit={async (values) => {
          await register(values);
          router.push("/");
        }}
      />
    </AuthSplit>
  );
}
