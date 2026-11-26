"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/**
 * Sign-up. On the public deployment sign-up is closed (SIGNUP_OPEN=false): the page says so instead of
 * offering a form that would fail, and keeps the form one click away for allow-listed addresses. The API
 * enforces the rule either way: the form shows until the status arrives, and if that request fails the
 * form stays and the API decides.
 */
export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .signupStatus()
      .then((s) => !cancelled && setOpen(s.open))
      .catch(() => !cancelled && setOpen(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const form = (
    <AuthForm
      mode="register"
      onSubmit={async (values) => {
        await register(values);
        router.push("/");
      }}
    />
  );

  return (
    <AuthSplit
      mode="register"
      title={open === false ? "Sign-up is closed" : "Create your account"}
      hint={
        open === false
          ? "This is a portfolio demo. Every public video plays without an account."
          : "Upload a clip and watch the worker turn it into a stream."
      }
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
      {open !== false ? (
        form
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            New accounts are closed on this site.{" "}
            <Link href="/" className="text-sage underline underline-offset-4 hover:text-sage-hover">
              Browse the library
            </Link>{" "}
            instead.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Invited? Create your account</summary>
            <div className="mt-4">{form}</div>
          </details>
        </div>
      )}
    </AuthSplit>
  );
}
