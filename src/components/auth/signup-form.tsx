"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, Lock, Mail, Sparkles, User } from "lucide-react";
import { signUpAction, type SignUpState } from "@/lib/actions/auth";

const initialState: SignUpState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!state.ok || !state.email || !state.password) return;
    setSigningIn(true);
    void signIn("credentials", {
      email: state.email,
      password: state.password,
      callbackUrl: "/onboarding",
    });
  }, [state]);

  return (
    <div className="fade-up">
      <span className="chip chip-violet">
        <Sparkles size={13} />
        Two minutes to a calmer week
      </span>
      <h1 className="display mt-5 text-4xl font-semibold text-cream">Create your study plan</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Create a free account. Add your subjects next — StudyMaster builds the roadmap.
      </p>

      <form action={formAction} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <div className="relative">
            <User
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              placeholder="Your name"
              className="input pl-11"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="input pl-11"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="6+ characters"
                className="input pl-11"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              Confirm
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="Again"
              className="input"
            />
          </div>
        </div>

        {state.error ? (
          <p className="rounded-xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-xs text-pink">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={pending || signingIn}
        >
          {pending || signingIn ? <Loader2 size={16} className="animate-spin" /> : null}
          {pending || signingIn ? "Building your plan…" : "Create my account"}
          {!pending && !signingIn ? <ArrowRight size={16} /> : null}
        </button>

        <p className="text-center text-[0.68rem] leading-relaxed text-muted">
          By continuing you agree to keep being kind to yourself when a day doesn&apos;t go to
          plan. StudyMaster will handle the rescheduling.
        </p>
      </form>

      <p className="mt-7 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-mint hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
