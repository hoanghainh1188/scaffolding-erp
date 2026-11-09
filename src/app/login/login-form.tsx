"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dict } from "@/locales";

import { loginAction, type SignInFormState } from "./actions";
import { TwoFactorStep } from "./two-factor-step";

const INITIAL: SignInFormState = {
  error: null,
  username: "",
  step: "password",
};

export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  const [showPassword, setShowPassword] = useState(false);

  if (state.step === "code") {
    return (
      <TwoFactorStep
        action={action}
        pending={pending}
        error={state.error}
        username={state.username}
        next={next}
      />
    );
  }

  return (
    <form action={action} className="flex w-full max-w-[400px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{dict.auth.login.title}</h1>
        <p className="text-body text-muted-foreground">
          {dict.auth.login.subtitle}
        </p>
      </div>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">{dict.auth.login.usernameLabel}</Label>
        <Input
          id="username"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={dict.auth.login.usernamePlaceholder}
          defaultValue={state.username}
          className="h-12 rounded-lg"
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{dict.auth.login.passwordLabel}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="h-12 rounded-lg pr-14"
            aria-describedby={state.error ? "login-error" : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0.5 right-0.5 size-11 text-muted-foreground"
            aria-label={
              showPassword
                ? dict.auth.login.hidePassword
                : dict.auth.login.showPassword
            }
            aria-pressed={showPassword}
            onClick={() => setShowPassword((shown) => !shown)}
          >
            {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
      </div>

      <Label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-body font-normal">
        <Checkbox name="remember" className="size-5" />
        {dict.auth.login.rememberMe}
      </Label>

      <div role="alert" id="login-error" className="empty:hidden">
        {state.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="h-13" disabled={pending}>
        {pending ? dict.auth.login.submitting : dict.auth.login.submit}
      </Button>

      <p className="rounded-lg bg-secondary px-4 py-3.5 text-sm leading-5">
        {dict.auth.login.forgotPassword}{" "}
        <strong className="font-semibold">
          {dict.auth.login.forgotPasswordPlace}
        </strong>
        .
      </p>
    </form>
  );
}
