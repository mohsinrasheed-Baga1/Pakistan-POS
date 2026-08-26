"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Store, Loader2, ScanBarcode, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const SECURITY_QUESTIONS = [
  "What is your shop name?",
  "What is your pet's name?",
  "What city were you born in?",
  "What is your favorite color?",
  "What was your first school's name?",
  "What is your mother's name?",
  "What is your father's name?",
  "What is your favorite food?",
];

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = React.useState("admin@pos.local");
  const [password, setPassword] = React.useState("admin123");
  const [loading, setLoading] = React.useState(false);

  // Forgot password state
  const [mode, setMode] = React.useState<"login" | "forgot-step1" | "forgot-step2">("login");
  const [resetEmail, setResetEmail] = React.useState("");
  const [securityQuestion, setSecurityQuestion] = React.useState("");
  const [securityAnswer, setSecurityAnswer] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [resetLoading, setResetLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Invalid email or password");
        setLoading(false);
        return;
      }
      toast.success("Welcome!");
      router.refresh();
    } catch (err) {
      toast.error("Something went wrong");
      setLoading(false);
    }
  }

  // Forgot Password Step 1: Submit email, get security question
  async function onForgotStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/security-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Account not found");
        setResetLoading(false);
        return;
      }
      setSecurityQuestion(data.question);
      setMode("forgot-step2");
    } catch {
      toast.error("Failed to verify account");
    } finally {
      setResetLoading(false);
    }
  }

  // Forgot Password Step 2: Answer question + set new password
  async function onForgotStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!securityAnswer || !newPassword || !confirmNewPassword) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail,
          securityAnswer,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Reset failed");
        setResetLoading(false);
        return;
      }
      toast.success("Password reset successfully! You can now sign in.");
      setMode("login");
      setEmail(resetEmail);
      setPassword("");
      // Clear reset fields
      setResetEmail("");
      setSecurityQuestion("");
      setSecurityAnswer("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-amber-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-emerald-100">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
            <Store className="w-9 h-9 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Pakistan POS</CardTitle>
          <CardDescription className="text-base">
            {mode === "login"
              ? "Sign in to your account to continue"
              : "Reset your password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* ============== LOGIN FORM ============== */}
          {mode === "login" && (
            <>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@pos.local"
                    required
                    className="text-left"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                    className="text-left"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              {/* Forgot Password Link + Activate License Link */}
              <div className="mt-3 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("forgot-step1")}
                  className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Forgot Password?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Clear stored license → will trigger activation screen on next page load
                    if (typeof window !== "undefined") {
                      localStorage.removeItem("pakpos_license_data");
                      localStorage.removeItem("pakpos_system_id");
                    }
                    window.location.reload();
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Activate License / Start Trial
                </button>
              </div>

              <div className="mt-5 pt-4 border-t space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ScanBarcode className="w-4 h-4 text-emerald-600" />
                  <span>Barcode scanner for fast billing</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Multi-user role management</span>
                </div>
              </div>
            </>
          )}

          {/* ============== FORGOT PASSWORD STEP 1 ============== */}
          {mode === "forgot-step1" && (
            <form onSubmit={onForgotStep1} className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Enter your account email to verify your identity via security question.
              </div>
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email Address</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="admin@pos.local"
                  required
                  className="text-left"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMode("login")}
                  className="h-11 flex-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  type="submit"
                  className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={resetLoading || !resetEmail}
                >
                  {resetLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* ============== FORGOT PASSWORD STEP 2 ============== */}
          {mode === "forgot-step2" && (
            <form onSubmit={onForgotStep2} className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                <span className="font-medium">Security Question:</span>{" "}
                {securityQuestion}
              </div>
              <div className="space-y-2">
                <Label htmlFor="secAnswer">Your Answer</Label>
                <Input
                  id="secAnswer"
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Enter your answer"
                  required
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPwd">New Password</Label>
                <Input
                  id="newPwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="text-left"
                />
                {newPassword.length > 0 && newPassword.length < 6 && (
                  <p className="text-xs text-red-600">
                    Password must be at least 6 characters
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confPwd">Confirm New Password</Label>
                <Input
                  id="confPwd"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-type new password"
                  required
                  className="text-left"
                />
                {confirmNewPassword.length > 0 &&
                  newPassword !== confirmNewPassword && (
                    <p className="text-xs text-red-600">
                      Passwords do not match
                    </p>
                  )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode("login");
                    setSecurityQuestion("");
                    setSecurityAnswer("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                  }}
                  className="h-11"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  type="submit"
                  className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={
                    resetLoading ||
                    !securityAnswer ||
                    newPassword.length < 6 ||
                    newPassword !== confirmNewPassword
                  }
                >
                  {resetLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
