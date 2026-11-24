"use client";

import { useState, type FormEvent } from "react";
import { describeError } from "@/lib/api";
import { INPUT, LABEL, PRIMARY_BUTTON } from "./ui";

export type AuthFormValues = {
  email: string;
  password: string;
  displayName: string;
};

type AuthFormProps = {
  mode: "login" | "register";
  onSubmit: (values: AuthFormValues) => Promise<void>;
};

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const isRegister = mode === "register";
  const [values, setValues] = useState<AuthFormValues>({ email: "", password: "", displayName: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (field: keyof AuthFormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
      {isRegister && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="displayName" className={LABEL}>
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            autoComplete="nickname"
            required
            maxLength={100}
            value={values.displayName}
            onChange={update("displayName")}
            className={INPUT}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={update("email")}
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-controls="password"
            aria-pressed={showPassword}
            className="text-sm text-sage hover:text-sage-hover"
          >
            {showPassword ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 8 : undefined}
          maxLength={128}
          value={values.password}
          onChange={update("password")}
          aria-describedby={isRegister ? "password-help" : undefined}
          className={INPUT}
        />
        {isRegister && (
          <p id="password-help" className="text-sm text-subtle">
            At least 8 characters.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-s1 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={`${PRIMARY_BUTTON} mt-1.5 w-full text-base`}>
        {submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
