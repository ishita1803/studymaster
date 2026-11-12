"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, KeyRound, Loader2, Save, UserRound } from "lucide-react";
import {
  changePasswordAction,
  updateProfileAction,
  type SettingsState,
} from "@/lib/actions/settings";

const initial: SettingsState = {};

export function ProfileForm({
  name,
  email,
  dailyStudyHours,
  studyStartTime,
  reminderEnabled,
}: {
  name: string;
  email: string;
  dailyStudyHours: number;
  studyStartTime: string;
  reminderEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
          <UserRound size={18} />
        </span>
        <div>
          <p className="display text-base font-semibold text-cream">Your profile</p>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
            Your name is used by Nova in the assistant and on the dashboard.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="profile-name">
            Name
          </label>
          <input
            id="profile-name"
            name="name"
            defaultValue={name}
            required
            minLength={2}
            maxLength={60}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="profile-email">
            Email
          </label>
          <input
            id="profile-email"
            value={email}
            readOnly
            disabled
            className="input opacity-60"
          />
          <p className="mt-1 text-[0.6rem] text-muted">Email changes are disabled in the demo.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="profile-hours">
          Daily study target · {Math.round(dailyStudyHours * 60)} minutes
        </label>
        <input
          id="profile-hours"
          name="dailyStudyHours"
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          defaultValue={dailyStudyHours}
          className="w-full accent-[#5BF0C8]"
        />
        <div className="mt-1 flex justify-between text-[0.6rem] text-muted">
          <span>30 min</span>
          <span>4 hours</span>
          <span>8 hours</span>
        </div>
        <p className="mt-1.5 text-[0.62rem] leading-relaxed text-muted">
          Nova spreads this across your week. Short and honest beats ambitious and ignored.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="profile-start">
          Preferred study start time
        </label>
        <input
          id="profile-start"
          name="studyStartTime"
          type="time"
          defaultValue={studyStartTime}
          required
          className="input w-40"
        />
        <p className="mt-1.5 text-[0.62rem] leading-relaxed text-muted">
          Your roadmap shows real times from here. Blocks include a 5-minute break between topics.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-3.5 py-3">
        <input
          type="checkbox"
          name="reminderEnabled"
          defaultChecked={reminderEnabled}
          className="mt-0.5 h-4 w-4 accent-[#5BF0C8]"
        />
        <span>
          <span className="block text-xs font-semibold text-cream">Daily reminder</span>
          <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-muted">
            Shows a reminder card on your dashboard when today&apos;s goal is still open. No
            emails or push notifications in the local demo.
          </span>
        </span>
      </label>

      {state.error ? (
        <p className="rounded-xl border border-pink/30 bg-pink/10 px-3.5 py-2.5 text-[0.68rem] text-pink">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="flex items-center gap-1.5 rounded-xl border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-[0.68rem] text-mint">
          <Check size={13} />
          Profile saved. Today&apos;s goal has been updated.
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet">
          <KeyRound size={18} />
        </span>
        <div>
          <p className="display text-base font-semibold text-cream">Password</p>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
            Use at least six characters. There is no password reset in the local demo, so keep it
            somewhere safe.
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="password-current">
          Current password
        </label>
        <input
          id="password-current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password-next">
            New password
          </label>
          <input
            id="password-next"
            name="next"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="password-confirm">
            Confirm new password
          </label>
          <input
            id="password-confirm"
            name="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="input"
          />
        </div>
      </div>

      {state.error ? (
        <p className="rounded-xl border border-pink/30 bg-pink/10 px-3.5 py-2.5 text-[0.68rem] text-pink">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="flex items-center gap-1.5 rounded-xl border border-mint/30 bg-mint/10 px-3.5 py-2.5 text-[0.68rem] text-mint">
          <Check size={13} />
          Password changed. Use it next time you sign in.
        </p>
      ) : null}

      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
