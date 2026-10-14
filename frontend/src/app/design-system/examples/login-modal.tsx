import { useState } from "react";
import { RiLoginBoxLine } from "@remixicon/react";
import { LoginModal } from "@/components/application/auth/login-modal";
import { Button } from "@/components/base/buttons/button";

export function LoginModalExample() {
  const [open, setOpen] = useState(false);
  return <>
    <Button leadingIcon={RiLoginBoxLine} onClick={() => setOpen(true)}>Open login modal</Button>
    <LoginModal isOpen={open} onClose={() => setOpen(false)} />
  </>;
}
