"use client";

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { RiEyeLine, RiEyeOffLine, RiUserLine } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { CloseButton } from "@/components/base/buttons/close-button";
import { Divider } from "@/components/base/divider/divider";
import { Input } from "@/components/base/input/input";
import { SocialButton } from "@/components/base/social-button/social-button";
import { cx } from "@/utils/cx";
import loginCoverImg from "@/assets/login-page.webp";

/** Public demo account shown on the sign-in view so visitors can try the app without registering. */
const DEMO_ACCOUNT = { email: "arkamap.test@example.com", password: "arkamap123" } as const;

export type AuthModalMode = "signin" | "signup" | "forgot";

export interface LoginModalProps {
  /** Controlled open state */
  isOpen: boolean;
  /** Called when backdrop, close button, or Escape key is triggered */
  onClose: () => void;
  /** Optional callback after successful login/signup */
  onSuccess?: (user: { name: string; email: string }) => void;
  /** Initial mode: signin, signup, or forgot */
  defaultMode?: AuthModalMode;
  authenticate?: (mode: AuthModalMode, credentials: { email: string; name: string; password: string; remember_me?: boolean }) => Promise<{ name: string; email: string }>;
  sessionOnly?: boolean;
}

function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type" | "trailingAddon">) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? RiEyeOffLine : RiEyeLine;
  return (
    <Input
      {...props}
      type={shown ? "text" : "password"}
      trailingAddon={
        <button
          type="button"
          aria-label={shown ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="grid size-5 shrink-0 place-items-center rounded-md text-foreground-icon-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
}

export function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  defaultMode = "signin",
  authenticate,
  sessionOnly = false,
}: LoginModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>(defaultMode);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronize modal open state with 2-phase transition matching SettingsModal physics
  useEffect(() => {
    if (isOpen) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      setMode(defaultMode);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 320);
    }
    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [isOpen, defaultMode]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  // The demo account lives on the real backend, so it only shows when sign-in is wired to it.
  const showDemo = mode === "signin" && Boolean(authenticate);

  async function submitWithBackend(
    authMode: AuthModalMode,
    credentials: { email: string; name: string; password: string },
  ) {
    if (!authenticate) return;
    setIsSubmitting(true);
    try {
      const user = await authenticate(authMode, { ...credentials, remember_me: rememberMe });
      toast.success(`Selamat datang, ${user.name}`);
      onSuccess?.(user); onClose();
      window.history.pushState({}, "", "/onboarding");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Autentikasi gagal."); }
    finally { setIsSubmitting(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string)?.trim() || "";
    const name = (formData.get("name") as string)?.trim() || "";
    const password = (formData.get("password") as string) || "";
    const confirmPassword = (formData.get("confirmPassword") as string) || "";

    if (!email) {
      toast.error("Isi alamat email terlebih dahulu.");
      return;
    }
    if (mode !== "forgot" && !password) {
      toast.error("Isi password terlebih dahulu.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Konfirmasi password tidak sama.");
      return;
    }

    if (authenticate) {
      await submitWithBackend(mode, { email, name, password });
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const user = {
        name: name || (email ? email.split("@")[0] : "Mahar Dicha"),
        email: email || "mahar@joints.ugm.ac.id",
      };

      if (mode === "signin") {
        toast.success(`Selamat datang kembali, ${user.name}.`);
        onSuccess?.(user);
        onClose();
        setTimeout(() => {
          window.history.pushState({}, "", "/dashboard");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 120);
      } else if (mode === "signup") {
        toast.success(`Akun berhasil dibuat. Selamat datang, ${user.name}.`);
        onSuccess?.(user);
        onClose();
        setTimeout(() => {
          window.history.pushState({}, "", "/dashboard");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 120);
      } else {
        toast.success(`Tautan atur ulang password dikirim ke ${email}.`);
        setMode("signin");
      }
    }, 600);
  }

  function handleSocialLogin(provider: "Google" | "Apple") {
    if (authenticate) { toast.info("Login sosial belum tersedia."); return; }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const user = {
        name: "Mahar Dicha",
        email: `mahar@${provider.toLowerCase()}.com`,
      };
      toast.success(`Berhasil masuk dengan ${provider}.`);
      onSuccess?.(user);
      onClose();
      setTimeout(() => {
        window.history.pushState({}, "", "/dashboard");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, 120);
    }, 500);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="presentation"
    >
      {/* Backdrop — matching SettingsModal black at 70% with fade */}
      <button
        type="button"
        aria-label="Tutup"
        tabIndex={-1}
        onClick={onClose}
        className={cx(
          "absolute inset-0 cursor-default bg-black/70 transition-opacity duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Animated wrapper with Apple spring transition physics (scale 0.85 -> 1.0, blur 4px -> 0) */}
      <div
        className={cx(
          "relative",
          "transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter]",
          visible ? "scale-100 opacity-100 blur-0" : "scale-[0.85] opacity-0 blur-[4px]",
        )}
      >
        {/* Panel — 871×614 (max-height 614), radius/3xl (24px), matching SettingsModal */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Masuk atau daftar"
          tabIndex={-1}
          className={cx(
            "relative flex h-[614px] max-h-[calc(100dvh-32px)] w-[871px] max-w-[calc(100vw-32px)]",
            "overflow-clip rounded-3xl bg-background-primary-default shadow-2xl outline-none dark:bg-background-secondary-default",
          )}
        >
          {/* Close button */}
          <div className="absolute right-3.5 top-3.5 z-30">
            <CloseButton
              size="md"
              aria-label="Tutup"
              onClick={onClose}
              className="bg-black/10 text-foreground-icon-secondary dark:bg-white/10 dark:text-foreground-icon-secondary md:bg-black/30 md:text-white/80 md:hover:bg-black/50 md:hover:text-white md:backdrop-blur-sm"
            />
          </div>

          {/* Left Column: Focused Auth Form */}
          <div className="flex w-full flex-col justify-between overflow-y-auto p-6 sm:p-8 md:w-[420px] md:shrink-0">
            <div>
              {/* Brand Header */}
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="block size-8 shrink-0 bg-accent-500 dark:bg-text-white -translate-y-0.5"
                  style={{
                    maskImage: "url(/brand/arkamap-icon.svg)",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                    maskSize: "contain",
                  }}
                />
                <img
                  src="/brand/arkamap-wordmark.svg"
                  alt="Arkamap"
                  className="block h-6 w-auto shrink-0 dark:invert"
                />
              </div>

              {/* Title & Subtitle */}
              <div className="mt-5">
                <h2 className="text-title-2-medium font-semibold tracking-tight text-text-primary">
                  {mode === "signin"
                    ? "Masuk ke Arkamap"
                    : mode === "signup"
                    ? "Buat akun baru"
                    : "Atur ulang password"}
                </h2>
                <p className="mt-1 text-body-regular text-text-secondary">
                  {mode === "signin"
                    ? "Lanjutkan memantau kondisi lingkungan Indonesia."
                    : mode === "signup"
                    ? "Daftar untuk memantau lingkungan dan mengelola perangkat sensor."
                    : "Masukkan email akun Anda, kami kirim tautan untuk mengatur ulang password."}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                {mode === "signup" && (
                  <Input
                    name="name"
                    label="Nama Lengkap"
                    placeholder="Nama Anda"
                    autoComplete="name"
                    isRequired
                  />
                )}

                <Input
                  name="email"
                  type="email"
                  label="Email"
                  placeholder="nama@email.com"
                  autoComplete="email"
                  isRequired
                />

                {mode !== "forgot" && (
                  <>
                    <PasswordInput
                      name="password"
                      label="Password"
                      placeholder={mode === "signup" ? "Minimal 8 karakter" : "Masukkan password"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      isRequired
                    />
                    {mode === "signup" && (
                      <PasswordInput
                        name="confirmPassword"
                        label="Konfirmasi password"
                        placeholder="Ketik ulang password"
                        autoComplete="new-password"
                        isRequired
                      />
                    )}
                  </>
                )}

                {mode === "signin" && (
                  <div className="flex items-center justify-between">
                    {sessionOnly ? <span className="text-body-medium text-text-secondary">Sesi sementara</span> : <Checkbox
                      size="sm"
                      isSelected={rememberMe}
                      onChange={setRememberMe}
                    >
                      Ingat saya
                    </Checkbox>}
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-body-medium text-accent-600 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent-500"
                    >
                      Lupa password?
                    </button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full mt-1 active:scale-[0.98] transition-transform duration-100"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Memproses..."
                    : mode === "signin"
                    ? "Masuk"
                    : mode === "signup"
                    ? "Daftar"
                    : "Kirim tautan"}
                </Button>
              </form>

              {/* Social Login Buttons (Google & Apple only, below the form, full readable names) */}
              {mode !== "forgot" && (
                <div className="mt-5">
                  <div className="mb-4">
                    <Divider>{mode === "signup" ? "atau daftar dengan" : "atau masuk dengan"}</Divider>
                  </div>
                  <div className={cx("grid gap-2.5", showDemo ? "grid-cols-3" : "grid-cols-2")}>
                    <SocialButton
                      brand="google"
                      appearance="white"
                      fullWidth
                      onClick={() => handleSocialLogin("Google")}
                    >
                      Google
                    </SocialButton>
                    <SocialButton
                      brand="apple"
                      appearance="white"
                      fullWidth
                      onClick={() => handleSocialLogin("Apple")}
                    >
                      Apple
                    </SocialButton>
                    {showDemo && (
                      <SocialButton
                        brand="custom"
                        config={{ icon: <RiUserLine className="size-full" aria-hidden="true" />, label: "akun demo" }}
                        appearance="white"
                        fullWidth
                        disabled={isSubmitting}
                        onClick={() => void submitWithBackend("signin", { ...DEMO_ACCOUNT, name: "" })}
                      >
                        Demo
                      </SocialButton>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mode Switcher Footer */}
            <div className="pt-4 text-center text-body-regular text-text-secondary">
              {mode === "signin" ? (
                <p>
                  Belum punya akun?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium text-accent-600 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent-500"
                  >
                    Daftar
                  </button>
                </p>
              ) : mode === "signup" ? (
                <p>
                  Sudah punya akun?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-medium text-accent-600 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent-500"
                  >
                    Masuk
                  </button>
                </p>
              ) : (
                <p>
                  Sudah ingat password?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-medium text-accent-600 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-accent-500"
                  >
                    Kembali masuk
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Platform Visual Showcase */}
          <div className="relative hidden h-full flex-1 flex-col justify-end overflow-hidden bg-background-full md:flex">
            {/* Decorative artwork */}
            <img
              src={loginCoverImg}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center select-none pointer-events-none"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
