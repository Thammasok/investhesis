import type { ComponentProps, FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type SignInValues = { email: string; password: string }

type SignInFormProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSignIn: (values: SignInValues) => void
}

/**
 * The `login-02` form. GitHub sign-in, "Forgot your password?" and "Sign up" were left out:
 * none of them exist yet.
 */
export function SignInForm({ className, onSignIn, ...props }: SignInFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Always stop the native submit, so a password can never end up in the URL.
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSignIn({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") })
  }

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={handleSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Sign in to your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to sign in to your account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <Button type="submit">Sign in</Button>
          <FieldDescription className="text-center">
            Sign-in isn&apos;t connected yet: any email and password continue as the demo user.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
