"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  return (
    <AuthSplit
      mode="login"
      title="Welcome back"
      hint="Sign in to upload clips and follow them through the pipeline."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="text-sage underline underline-offset-4 hover:text-sage-hover">
            Create an account
          </Link>
          . This is a demo site; any email works.
        </>
      }
    >
      <AuthForm
        mode="login"
        onSubmit={async ({ email, password }) => {
          await login(email, password);
          router.push("/");
        }}
      />
    </AuthSplit>
  );
}
